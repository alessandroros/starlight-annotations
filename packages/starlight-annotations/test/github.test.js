// The handler with GitHub storage and sign-in, against an in-memory GitHub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnotationsHandler, github } from '../src/server/index.js';

const ORIGIN = 'https://docs.example';
const options = { repo: 'o/r', token: 'server', clientId: 'cid', clientSecret: 'cs', sessionSecret: 'secret' };

function fakeGitHub({ profile = { login: 'octo', id: 42, name: 'Octo Cat' }, permission = 'write' } = {}) {
  const state = { files: new Map(), branch: false, commits: [], conflicts: 0, sha: 0 };
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (url.pathname === '/login/oauth/access_token') return reply({ access_token: 'user-token' });
    if (url.pathname === '/user') return reply(profile);
    if (url.pathname.endsWith('/permission')) return permission ? reply({ permission }) : reply({}, 404);
    if (url.pathname === '/repos/o/r') return reply({ default_branch: 'main' });
    if (url.pathname === '/repos/o/r/git/ref/heads/main') return reply({ object: { sha: 'main-sha' } });
    if (url.pathname === '/repos/o/r/git/refs') {
      state.branch = true;
      return reply({}, 201);
    }
    const file = url.pathname.match(/^\/repos\/o\/r\/contents\/(.+)$/)?.[1];
    if (file) {
      const name = decodeURIComponent(file);
      if (method === 'GET') {
        const stored = state.branch && state.files.get(name);
        return stored ? reply(stored) : reply({ message: 'Not Found' }, 404);
      }
      const body = JSON.parse(init.body);
      if (!state.branch) return reply({ message: 'Branch annotations not found' }, 422);
      if (state.conflicts > 0) {
        state.conflicts--;
        return reply({ message: 'is at a different sha' }, 409);
      }
      if ((state.files.get(name)?.sha ?? undefined) !== body.sha) return reply({ message: 'conflict' }, 409);
      state.files.set(name, { content: body.content, sha: `s${++state.sha}` });
      state.commits.push(body);
      return reply({}, 201);
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  return { state, fetch };
}

function client(handle) {
  const jar = new Map();
  return async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const response = await handle(new Request(ORIGIN + path, { ...init, headers }));
    for (const cookie of response?.headers.getSetCookie() ?? []) {
      const [pair] = cookie.split(';');
      const [name, ...value] = pair.split('=');
      if (/Max-Age=0/.test(cookie)) jar.delete(name);
      else jar.set(name, value.join('='));
    }
    return response;
  };
}

async function signIn(request) {
  const login = await request('/_annotations/login?return=/guides/demo/');
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  return request(`/_annotations/callback?code=c&state=${state}`);
}

const post = (request, page, change, origin = ORIGIN) =>
  request('/_annotations/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ page, change }) });

let gh;
beforeEach(() => {
  gh = fakeGitHub();
  vi.stubGlobal('fetch', gh.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('handler with GitHub', () => {
  it('ignores paths outside its prefix', async () => {
    const handle = createAnnotationsHandler(github(options));
    expect(await handle(new Request(`${ORIGIN}/guides/demo/`))).toBeNull();
  });

  it('reads an empty page before the branch exists, signed out', async () => {
    const request = client(createAnnotationsHandler(github(options)));
    const data = await (await request('/_annotations/api?page=guides/demo')).json();
    expect(data).toEqual({ annotations: [], user: null, mode: 'github', canSignIn: true });
  });

  it('signs in a collaborator and commits as them, creating the branch', async () => {
    const request = client(createAnnotationsHandler(github(options)));
    expect((await post(request, 'guides/demo', { action: 'create', target: { exact: 'x' }, body: 'n' })).status).toBe(401);

    const callback = await signIn(request);
    expect(callback.status).toBe(303);
    expect(callback.headers.get('Location')).toBe('/guides/demo/');
    expect((await (await request('/_annotations/api?page=guides/demo')).json()).user).toEqual({ login: 'octo', name: 'Octo Cat' });

    const created = await post(request, 'it/guides/demo', { action: 'create', target: { exact: 'città' }, body: 'Nota àèì 🚌' });
    expect(created.status).toBe(200);
    expect(gh.state.branch).toBe(true);
    const [commit] = gh.state.commits;
    expect(commit).toMatchObject({ branch: 'annotations', author: { name: 'Octo Cat', email: '42+octo@users.noreply.github.com' } });
    expect(commit.message).toBe('docs(annotations): note on it/guides/demo');
    const stored = JSON.parse(Buffer.from(gh.state.files.get('annotations/it/guides/demo.json').content, 'base64').toString('utf8'));
    expect(stored.annotations[0].body).toBe('Nota àèì 🚌');
  });

  it('retries when another save changed the file', async () => {
    const request = client(createAnnotationsHandler(github(options)));
    await signIn(request);
    const { annotation } = await (await post(request, 'p', { action: 'create', target: { exact: 'x' }, body: 'n' })).json();
    gh.state.conflicts = 2;
    const replied = await post(request, 'p', { action: 'reply', replyTo: annotation.id, body: 'ok' });
    expect(replied.status).toBe(200);
    expect((await replied.json()).annotations).toHaveLength(2);
  });

  it.each([
    ['not a collaborator', null, 403],
    ['read access', 'read', 403],
    ['no access', 'none', 403],
    ['write access', 'write', 303],
    ['admin', 'admin', 303],
  ])('with %s, sign-in answers %i', async (_, permission, status) => {
    gh = fakeGitHub({ permission });
    vi.stubGlobal('fetch', gh.fetch);
    const request = client(createAnnotationsHandler(github(options)));
    expect((await signIn(request)).status).toBe(status);
  });

  it('supports a list of writers and "anyone"', async () => {
    for (const [writers, status] of [[['OCTO'], 303], [['someone'], 403], ['anyone', 303]]) {
      const request = client(createAnnotationsHandler(github({ ...options, writers })));
      expect((await signIn(request)).status).toBe(status);
    }
  });

  it('refuses cross-site writes, bad pages and forged sessions', async () => {
    const request = client(createAnnotationsHandler(github(options)));
    await signIn(request);
    expect((await post(request, 'p', {}, 'https://evil.example')).status).toBe(403);
    expect((await request('/_annotations/api?page=../x')).status).toBe(400);

    const forged = await createAnnotationsHandler(github(options))(
      new Request(`${ORIGIN}/_annotations/api?page=p`, { headers: { Cookie: 'annot_session=e30.bad' } }),
    );
    expect((await forged.json()).user).toBeNull();
  });

  it('rejects a callback without the matching state', async () => {
    const request = client(createAnnotationsHandler(github(options)));
    expect((await request('/_annotations/callback?code=c&state=nope')).status).toBe(400);
  });

  it('honours a custom prefix and commit message', async () => {
    const request = client(
      createAnnotationsHandler({ ...github({ ...options, commitMessage: (m, page) => `chore: ${page}` }), prefix: '/docs/_annotations' }),
    );
    const login = await request('/docs/_annotations/login?return=/docs/');
    const state = new URL(login.headers.get('Location')).searchParams.get('state');
    expect(new URL(login.headers.get('Location')).searchParams.get('redirect_uri')).toBe(`${ORIGIN}/docs/_annotations/callback`);
    await request(`/docs/_annotations/callback?code=c&state=${state}`);
    await request('/docs/_annotations/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ page: 'index', change: { action: 'create', target: { exact: 'x' }, body: 'n' } }),
    });
    expect(gh.state.commits[0].message).toBe('chore: index');
  });

  it('explains missing options', () => {
    expect(() => github({ repo: 'o/r' })).toThrow(/needs token/);
  });
});
