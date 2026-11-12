// GitLab storage and sign-in, against an in-memory GitLab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnotationsHandler, gitlab } from '../src/server/index.js';
import { client, decode, reply } from './helpers.js';

const HOST = 'https://git.example.org';
const options = { host: HOST, project: 'docs/site', token: 'server', clientId: 'cid', clientSecret: 'cs', sessionSecret: 'secret' };

function fakeGitLab({ accessLevel = 30 } = {}) {
  const state = { files: new Map(), branch: false, commits: [], conflicts: 0, seq: 0, tokenRequests: [] };
  const fetch = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    expect(url.origin).toBe(HOST);
    if (url.pathname === '/oauth/token') {
      state.tokenRequests.push(JSON.parse(init.body));
      return reply({ access_token: 'user-token' });
    }
    if (url.pathname === '/api/v4/user') return reply({ username: 'ada', id: 7, name: 'Ada Lovelace' });
    if (url.pathname === '/api/v4/projects/docs%2Fsite/members/all/7')
      return accessLevel ? reply({ access_level: accessLevel }) : reply({ message: '404 Not found' }, 404);
    if (url.pathname === '/api/v4/projects/docs%2Fsite') return reply({ default_branch: 'main' });
    if (url.pathname === '/api/v4/projects/docs%2Fsite/repository/branches' && method === 'POST') {
      expect(url.searchParams.get('ref')).toBe('main');
      state.branch = true;
      return reply({}, 201);
    }
    const file = url.pathname.match(/^\/api\/v4\/projects\/docs%2Fsite\/repository\/files\/(.+)$/)?.[1];
    if (file) {
      const name = decodeURIComponent(file);
      const stored = state.files.get(name);
      if (method === 'GET') return state.branch && stored ? reply(stored) : reply({ message: '404 File Not Found' }, 404);
      const body = JSON.parse(init.body);
      if (!state.branch) return reply({ message: 'You can only create or edit files when you are on a branch' }, 400);
      if (state.conflicts > 0) {
        state.conflicts--;
        return reply({ message: 'You are attempting to update a file that has changed since you started editing it.' }, 400);
      }
      if (method === 'POST' && stored) return reply({ message: 'A file with this name already exists' }, 400);
      if (method === 'PUT' && body.last_commit_id !== stored?.last_commit_id) return reply({ message: 'has changed since you started editing it' }, 400);
      state.files.set(name, { content: body.content, last_commit_id: `c${++state.seq}` });
      state.commits.push({ method, ...body });
      return reply({ file_path: name }, method === 'POST' ? 201 : 200);
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  return { state, fetch };
}

let gl;
beforeEach(() => {
  gl = fakeGitLab();
  vi.stubGlobal('fetch', gl.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('handler with GitLab', () => {
  it('signs in with the read_user scope on a self-managed host', async () => {
    const request = client(createAnnotationsHandler(gitlab(options)));
    const { authorize, callback } = await request.signIn();
    expect(authorize.origin + authorize.pathname).toBe(`${HOST}/oauth/authorize`);
    expect(authorize.searchParams.get('scope')).toBe('read_user');
    expect(authorize.searchParams.get('response_type')).toBe('code');
    expect(callback.status).toBe(303);
    expect(gl.state.tokenRequests[0]).toMatchObject({ grant_type: 'authorization_code', client_id: 'cid' });
    expect((await (await request('/_annotations/api?page=p')).json()).user).toEqual({ login: 'ada', name: 'Ada Lovelace' });
  });

  it('creates the branch, then creates and updates the file as the reader', async () => {
    const request = client(createAnnotationsHandler(gitlab(options)));
    await request.signIn();
    const created = await request.post('guides/demo', { action: 'create', target: { exact: 'x' }, body: 'Nota 🚌' });
    expect(created.status).toBe(200);
    const { annotation } = await created.json();
    expect(gl.state.branch).toBe(true);
    expect((await request.post('guides/demo', { action: 'reply', replyTo: annotation.id, body: 'ok' })).status).toBe(200);

    const [first, second] = gl.state.commits;
    expect(first).toMatchObject({ method: 'POST', branch: 'annotations', encoding: 'base64', author_name: 'Ada Lovelace' });
    expect(first.author_email).toBe('7-ada@users.noreply.git.example.org');
    expect(second).toMatchObject({ method: 'PUT', last_commit_id: 'c1' });
    expect(decode(gl.state.files.get('annotations/guides/demo.json').content).annotations).toHaveLength(2);
  });

  it('retries when the file changed meanwhile', async () => {
    const request = client(createAnnotationsHandler(gitlab(options)));
    await request.signIn();
    const { annotation } = await (await request.post('p', { action: 'create', target: { exact: 'x' }, body: 'n' })).json();
    gl.state.conflicts = 2;
    expect((await request.post('p', { action: 'reply', replyTo: annotation.id, body: 'r' })).status).toBe(200);
  });

  it.each([
    ['a Reporter', 20, 403],
    ['not a member', 0, 403],
    ['a Developer', 30, 303],
    ['a Maintainer', 40, 303],
  ])('lets %s sign in: %i', async (_, accessLevel, status) => {
    gl = fakeGitLab({ accessLevel });
    vi.stubGlobal('fetch', gl.fetch);
    const request = client(createAnnotationsHandler(gitlab(options)));
    expect((await request.signIn()).callback.status).toBe(status);
  });

  it('defaults to gitlab.com', async () => {
    const request = client(createAnnotationsHandler(gitlab({ ...options, host: undefined })));
    const login = await request('/_annotations/login?return=/');
    expect(new URL(login.headers.get('Location')).origin).toBe('https://gitlab.com');
  });
});
