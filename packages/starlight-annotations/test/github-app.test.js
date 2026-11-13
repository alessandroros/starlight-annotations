// GitHub App credentials: the JWT, installation tokens and their renewal,
// and the handler running on them.
import { generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pkcs8 } from '../src/server/github-app.js';
import { createAnnotationsHandler, github, githubAppToken } from '../src/server/index.js';
import { client, reply } from './helpers.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PKCS1 = privateKey.export({ type: 'pkcs1', format: 'pem' });
const PKCS8 = privateKey.export({ type: 'pkcs8', format: 'pem' });

function fakeGitHub({ installed = true } = {}) {
  const state = { issued: 0, jwts: [], tokenRequests: [], commits: [], authorizations: [] };
  const fetch = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const auth = new Headers(init.headers).get('Authorization');
    if (url.pathname === '/repos/o/r/installation') {
      state.jwts.push(auth.slice('Bearer '.length));
      return installed ? reply({ id: 7 }) : reply({ message: 'Not Found' }, 404);
    }
    if (url.pathname === '/app/installations/7/access_tokens') {
      state.jwts.push(auth.slice('Bearer '.length));
      state.tokenRequests.push(JSON.parse(init.body));
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      return reply({ token: `ghs_${++state.issued}`, expires_at: expires }, 201);
    }
    if (url.pathname === '/login/oauth/access_token') return reply({ access_token: 'user-token' });
    if (url.pathname === '/user') return reply({ login: 'octo', id: 42, name: 'Octo Cat' });
    state.authorizations.push(auth);
    if (url.pathname.endsWith('/permission')) return reply({ permission: 'write' });
    if (url.pathname.startsWith('/repos/o/r/contents/')) {
      if ((init.method ?? 'GET') === 'GET') return reply({ message: 'Not Found' }, 404);
      state.commits.push(JSON.parse(init.body));
      return reply({}, 201);
    }
    throw new Error(`unexpected ${init.method ?? 'GET'} ${url}`);
  });
  return { state, fetch };
}

function decodeJwt(jwt) {
  const [header, payload, signature] = jwt.split('.');
  const json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  const valid = verify('sha256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'));
  return { header: json(header), payload: json(payload), valid };
}

let gh;
beforeEach(() => {
  gh = fakeGitHub();
  vi.stubGlobal('fetch', gh.fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('githubAppToken', () => {
  it('signs a valid RS256 JWT and asks for a token limited to the repository', async () => {
    const token = githubAppToken({ appId: 123, privateKey: PKCS1, repo: 'o/r' });
    expect(await token()).toBe('ghs_1');

    const { header, payload, valid } = decodeJwt(gh.state.jwts[0]);
    expect(valid).toBe(true);
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(payload.iss).toBe('123');
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
    expect(gh.state.tokenRequests).toEqual([{ repositories: ['r'] }]);
  });

  it.each([
    ['PKCS#1', PKCS1],
    ['PKCS#8', PKCS8],
    ['PKCS#1 with escaped line breaks', PKCS1.replace(/\n/g, '\\n')],
  ])('accepts a %s key', async (_, key) => {
    const token = githubAppToken({ appId: 1, privateKey: key, repo: 'o/r' });
    expect(await token()).toBe('ghs_1');
    expect(decodeJwt(gh.state.jwts[0]).valid).toBe(true);
  });

  it('turns PKCS#1 into the same PKCS#8 that Node writes', () => {
    const der = Buffer.from(PKCS8.replace(/-----[^-]+-----|\s/g, ''), 'base64');
    expect(Buffer.from(pkcs8(PKCS1)).equals(der)).toBe(true);
  });

  it('refuses a key that is not a PEM', () => {
    expect(() => pkcs8('not a key')).toThrow(/must be a PEM/);
  });

  it('reuses the token, shares one renewal and renews before it expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const token = githubAppToken({ appId: 1, privateKey: PKCS8, repo: 'o/r' });
    expect(await Promise.all([token(), token(), token()])).toEqual(['ghs_1', 'ghs_1', 'ghs_1']);
    expect(gh.state.issued).toBe(1);

    vi.setSystemTime(Date.now() + 50 * 60 * 1000);
    expect(await token()).toBe('ghs_1');
    vi.setSystemTime(Date.now() + 6 * 60 * 1000); // 4 minutes left: renew
    expect(await token()).toBe('ghs_2');
    // The installation is looked up once.
    expect(gh.fetch.mock.calls.filter(([input]) => String(input).endsWith('/installation'))).toHaveLength(1);
  });

  it('uses a given installation id without looking it up', async () => {
    const token = githubAppToken({ appId: 1, privateKey: PKCS8, repo: 'o/r', installationId: 7 });
    await token();
    expect(gh.fetch.mock.calls.filter(([input]) => String(input).endsWith('/installation'))).toHaveLength(0);
  });

  it('says when the app is not installed on the repository', async () => {
    gh = fakeGitHub({ installed: false });
    vi.stubGlobal('fetch', gh.fetch);
    const token = githubAppToken({ appId: 9, privateKey: PKCS8, repo: 'o/r' });
    await expect(token()).rejects.toThrow('the GitHub App 9 is not installed on o/r');
  });

  it('explains missing options', () => {
    expect(() => githubAppToken({ appId: 1, repo: 'o/r' })).toThrow('githubAppToken needs privateKey');
  });
});

describe('handler with a GitHub App', () => {
  const options = { repo: 'o/r', app: { appId: 1, privateKey: PKCS1 }, clientId: 'Iv1.app', clientSecret: 'cs', sessionSecret: 'secret' };

  it('checks access and commits with installation tokens, minting one for both', async () => {
    const request = client(createAnnotationsHandler(github(options)));
    expect((await request.signIn()).callback.status).toBe(303);
    expect((await request.post('p', { action: 'create', target: { exact: 'x' }, body: 'n' })).status).toBe(200);

    expect(gh.state.issued).toBe(1);
    expect(gh.state.authorizations.every((value) => value === 'Bearer ghs_1')).toBe(true);
    expect(gh.state.commits[0].author).toEqual({ name: 'Octo Cat', email: '42+octo@users.noreply.github.com' });
  });

  it('needs a token or an app', () => {
    const { app, ...rest } = options;
    expect(() => github(rest)).toThrow('needs token or app');
  });
});

it('still accepts a plain token', async () => {
  const handle = createAnnotationsHandler(github({ repo: 'o/r', token: 'pat', clientId: 'c', clientSecret: 's', sessionSecret: 'x' }));
  const request = client(handle);
  await request.signIn();
  expect(gh.state.authorizations).toEqual(['Bearer pat']);
  expect(gh.state.issued).toBe(0);
});
