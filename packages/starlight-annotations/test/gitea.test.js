// Gitea / Forgejo storage and sign-in, against an in-memory server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnotationsHandler, forgejo, gitea } from '../src/server/index.js';
import { client, decode, reply } from './helpers.js';

const HOST = 'https://codeberg.org';
const options = { host: HOST, repo: 'ada/docs', token: 'server', clientId: 'cid', clientSecret: 'cs', sessionSecret: 'secret' };

function fakeGitea({ permission = 'write' } = {}) {
  const state = { files: new Map(), branch: false, commits: [], conflicts: 0, seq: 0, auth: [] };
  const fetch = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    expect(url.origin).toBe(HOST);
    if (url.pathname === '/login/oauth/access_token') return reply({ access_token: 'user-token' });
    if (url.pathname === '/api/v1/user') {
      state.auth.push(init.headers.Authorization);
      return reply({ login: 'ada', id: 3, full_name: 'Ada Lovelace' });
    }
    if (url.pathname === '/api/v1/repos/ada/docs/collaborators/ada/permission')
      return permission ? reply({ permission }) : reply({ message: 'not found' }, 404);
    if (url.pathname === '/api/v1/repos/ada/docs') return reply({ default_branch: 'main' });
    if (url.pathname === '/api/v1/repos/ada/docs/git/trees/annotations') {
      if (!state.branch) return reply({ message: 'not found' }, 404);
      // Two entries per page, so the test walks `truncated`.
      const all = [...state.files.keys()].map((path) => ({ path, type: 'blob' }));
      const page = Number(url.searchParams.get('page'));
      return reply({ tree: all.slice((page - 1) * 2, page * 2), truncated: page * 2 < all.length });
    }
    if (url.pathname === '/api/v1/repos/ada/docs/branches' && method === 'POST') {
      expect(JSON.parse(init.body)).toEqual({ new_branch_name: 'annotations', old_branch_name: 'main' });
      state.branch = true;
      return reply({}, 201);
    }
    const file = url.pathname.match(/^\/api\/v1\/repos\/ada\/docs\/contents\/(.+)$/)?.[1];
    if (file) {
      const name = decodeURIComponent(file);
      const stored = state.files.get(name);
      if (method === 'GET') return state.branch && stored ? reply(stored) : reply({ message: 'not found' }, 404);
      state.auth.push(init.headers.Authorization);
      const body = JSON.parse(init.body);
      if (!state.branch) return reply({ message: 'branch does not exist [name: annotations]' }, 404);
      if (state.conflicts > 0) {
        state.conflicts--;
        return reply({ message: 'sha does not match' }, 409);
      }
      if (method === 'POST' && stored) return reply({ message: 'repository file already exists' }, 422);
      if (method === 'PUT' && body.sha !== stored?.sha) return reply({ message: 'sha does not match' }, 409);
      state.files.set(name, { content: body.content, sha: `s${++state.seq}` });
      state.commits.push({ method, ...body });
      return reply({}, method === 'POST' ? 201 : 200);
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  return { state, fetch };
}

let gt;
beforeEach(() => {
  gt = fakeGitea();
  vi.stubGlobal('fetch', gt.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('handler with Gitea / Forgejo', () => {
  it('signs in and commits as the reader on Codeberg', async () => {
    const request = client(createAnnotationsHandler(gitea(options)));
    const { authorize, callback } = await request.signIn();
    expect(authorize.origin + authorize.pathname).toBe(`${HOST}/login/oauth/authorize`);
    expect(callback.status).toBe(303);

    const { annotation } = await (await request.post('index', { action: 'create', target: { exact: 'x' }, body: 'n' })).json();
    expect(gt.state.branch).toBe(true);
    await request.post('index', { action: 'reply', replyTo: annotation.id, body: 'r' });

    const [first, second] = gt.state.commits;
    expect(first).toMatchObject({ method: 'POST', branch: 'annotations', author: { name: 'Ada Lovelace', email: 'ada@noreply.codeberg.org' } });
    expect(second).toMatchObject({ method: 'PUT', sha: 's1' });
    expect(decode(gt.state.files.get('annotations/index.json').content).annotations).toHaveLength(2);
    expect(gt.state.auth).toEqual(['Bearer user-token', 'token server', 'token server', 'token server']);
  });

  it('retries on a stale sha', async () => {
    const request = client(createAnnotationsHandler(gitea(options)));
    await request.signIn();
    const { annotation } = await (await request.post('p', { action: 'create', target: { exact: 'x' }, body: 'n' })).json();
    gt.state.conflicts = 2;
    expect((await request.post('p', { action: 'reply', replyTo: annotation.id, body: 'r' })).status).toBe(200);
  });

  it.each([
    ['read', 403],
    [null, 403],
    ['write', 303],
    ['admin', 303],
    ['owner', 303],
  ])('with permission %s, sign-in answers %i', async (permission, status) => {
    gt = fakeGitea({ permission });
    vi.stubGlobal('fetch', gt.fetch);
    const request = client(createAnnotationsHandler(gitea(options)));
    expect((await request.signIn()).callback.status).toBe(status);
  });

  it('lists every page with notes, following truncated trees', async () => {
    const request = client(createAnnotationsHandler(gitea(options)));
    expect((await (await request('/_annotations/api/all')).json()).pages).toEqual([]);
    await request.signIn();
    for (const page of ['c', 'a', 'b/x', 'd', 'e']) await request.post(page, { action: 'create', target: { exact: 'x' }, body: 'n' });
    const { pages } = await (await request('/_annotations/api/all')).json();
    expect(pages.map((entry) => entry.page)).toEqual(['a', 'b/x', 'c', 'd', 'e']);
  });

  it('exports forgejo as the same provider, and needs a host', () => {
    expect(forgejo).toBe(gitea);
    expect(() => gitea({ ...options, host: undefined })).toThrow(/needs host/);
  });
});
