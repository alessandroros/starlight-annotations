// GitHub storage and GitHub sign-in.
//
// Storage: one JSON file per page, committed through the Contents API to a
// branch of its own (default "annotations"), so notes never touch the default
// branch and never trigger a deploy. The branch is created from the default
// branch on the first save. Each commit has the reader as author (their
// noreply address), so `git log` and `git blame` show who wrote what.
//
// Sign-in: a GitHub OAuth app (or a GitHub App's user authorization). The
// reader's token is used once to learn their login and is then dropped; the
// session is an HMAC-signed cookie. `writers` decides who may write.

import { AnnotationError, filePath, parseDocument, serializeDocument } from '../core.js';

const GITHUB_API = 'https://api.github.com';
const SESSION_COOKIE = 'annot_session';
const STATE_COOKIE = 'annot_state';
const SESSION_AGE = 60 * 60 * 24 * 30;

/**
 * Storage and sign-in together, which is what most sites want.
 * @param {GitHubOptions} options
 */
export function github(options) {
  return { storage: githubStorage(options), auth: githubAuth(options) };
}

/**
 * @param {{ repo: string, token: string, branch?: string, dir?: string, commitMessage?: (action: string, page: string) => string }} options
 */
export function githubStorage({ repo, token, branch = 'annotations', dir = 'annotations', commitMessage }) {
  required({ repo, token }, 'githubStorage');

  const contentsPath = (page) => `/repos/${repo}/contents/${filePath(page, dir).split('/').map(encodeURIComponent).join('/')}`;

  async function read(page) {
    const file = await api(token, `${contentsPath(page)}?ref=${encodeURIComponent(branch)}`, { allow404: true });
    if (!file) return { doc: parseDocument('', page), sha: undefined };
    return { doc: parseDocument(new TextDecoder().decode(fromBase64(file.content)), page), sha: file.sha };
  }

  async function createBranch() {
    const info = await api(token, `/repos/${repo}`);
    const head = await api(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(info.default_branch)}`);
    const response = await raw(token, `/repos/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.object.sha }),
    });
    // 422: it exists already (another save created it a moment ago).
    if (!response.ok && response.status !== 422) throw new Error(`GitHub create branch ${response.status}: ${await response.text()}`);
  }

  return {
    mode: 'github',
    async load(page) {
      return (await read(page)).doc;
    },
    async update(page, mutate, user) {
      // Two readers saving on the same page: GitHub refuses the stale sha, so
      // read again and apply the change on top.
      let branchCreated = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const { doc, sha } = await read(page);
        const { annotation, message } = mutate(doc);
        const response = await raw(token, contentsPath(page), {
          method: 'PUT',
          body: JSON.stringify({
            message: commitMessage ? commitMessage(message, page) : message,
            content: toBase64(new TextEncoder().encode(serializeDocument(doc))),
            sha,
            branch,
            author: user.id
              ? { name: user.name || user.login, email: `${user.id}+${user.login}@users.noreply.github.com` }
              : undefined,
          }),
        });
        if (response.ok) return { annotation, annotations: doc.annotations };
        if (response.status === 404 || response.status === 422) {
          const detail = await response.text();
          // A missing branch answers 404 or 422 "Branch not found". Create it once.
          if (!branchCreated && (response.status === 404 || /branch/i.test(detail))) {
            await createBranch();
            branchCreated = true;
            continue;
          }
          throw new Error(`GitHub PUT ${response.status}: ${detail}`);
        }
        if (response.status === 409) continue;
        throw new Error(`GitHub PUT ${response.status}: ${await response.text()}`);
      }
      throw new AnnotationError(409, 'Someone else is saving notes on this page. Try again.');
    },
  };
}

/**
 * @param {GitHubOptions} options
 */
export function githubAuth({ clientId, clientSecret, sessionSecret, repo, token, writers = 'collaborators', cookieSecure = true }) {
  required({ clientId, clientSecret, sessionSecret }, 'githubAuth');
  if (writers === 'collaborators') required({ repo, token }, 'githubAuth with writers "collaborators"');

  const cookie = (name, value, maxAge, path = '/') =>
    `${name}=${value}; HttpOnly;${cookieSecure ? ' Secure;' : ''} SameSite=Lax; Path=${path}; Max-Age=${maxAge}`;

  async function mayWrite(profile) {
    if (writers === 'anyone') return true;
    if (Array.isArray(writers)) return writers.map((login) => login.toLowerCase()).includes(profile.login.toLowerCase());
    if (typeof writers === 'function') return Boolean(await writers(profile));
    // Only people who can push to the repository. `permission` is the legacy
    // level: maintain counts as write, triage as read. On a public repository
    // GitHub answers "read" for anyone, so read access is not enough.
    const permission = await api(token, `/repos/${repo}/collaborators/${encodeURIComponent(profile.login)}/permission`, { allow404: true });
    return permission?.permission === 'admin' || permission?.permission === 'write';
  }

  async function hmac(value) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
  }

  return {
    mode: 'github',

    async user(request) {
      const value = readCookie(request, SESSION_COOKIE);
      if (!value) return null;
      const [body, signature] = value.split('.');
      if (!body || !signature || !timingSafeEqual(signature, await hmac(body))) return null;
      try {
        const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
        return payload.exp > Date.now() / 1000 ? payload : null;
      } catch {
        return null;
      }
    },

    async route(route, request, url, prefix) {
      if (request.method !== 'GET') return null;
      const callbackPath = `${prefix}/callback`;
      const redirectUri = `${url.origin}${callbackPath}`;

      if (route === '/login') {
        const state = crypto.randomUUID();
        const back = safeReturn(url.searchParams.get('return'));
        const authorize = new URL('https://github.com/login/oauth/authorize');
        authorize.searchParams.set('client_id', clientId);
        authorize.searchParams.set('redirect_uri', redirectUri);
        authorize.searchParams.set('state', state);
        authorize.searchParams.set('allow_signup', 'false');
        // No scope: the public profile is enough to know who the reader is.
        return redirect(authorize.toString(), [cookie(STATE_COOKIE, `${state}.${encodeURIComponent(back)}`, 600, callbackPath)]);
      }

      if (route === '/callback') {
        // "<uuid>.<return path>": the uuid has no dot, the path may.
        const saved = readCookie(request, STATE_COOKIE) || '';
        const dot = saved.indexOf('.');
        const [state, back] = dot === -1 ? [saved, ''] : [saved.slice(0, dot), saved.slice(dot + 1)];
        const clear = cookie(STATE_COOKIE, '', 0, callbackPath);
        if (!state || state !== url.searchParams.get('state')) return text('The sign-in link expired. Try again.', 400, [clear]);

        const exchange = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: url.searchParams.get('code'), redirect_uri: redirectUri }),
        });
        const { access_token: userToken } = await exchange.json();
        if (!userToken) return text('GitHub did not confirm the sign-in.', 400, [clear]);

        const profile = await api(userToken, '/user');
        if (!(await mayWrite(profile))) {
          return text(`${profile.login} may not annotate these docs.`, 403, [clear]);
        }
        const body = base64url(
          new TextEncoder().encode(
            JSON.stringify({ login: profile.login, id: profile.id, name: profile.name || profile.login, exp: Math.floor(Date.now() / 1000) + SESSION_AGE }),
          ),
        );
        const session = `${body}.${await hmac(body)}`;
        return redirect(safeReturn(decodeURIComponent(back || '/')), [clear, cookie(SESSION_COOKIE, session, SESSION_AGE)]);
      }

      if (route === '/logout') {
        return redirect(safeReturn(url.searchParams.get('return')), [cookie(SESSION_COOKIE, '', 0)]);
      }

      return null;
    },
  };
}

// ---- GitHub REST ----

function raw(token, path, init = {}) {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'starlight-annotations',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

async function api(token, path, { allow404 = false } = {}) {
  const response = await raw(token, path);
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub GET ${path} ${response.status}: ${await response.text()}`);
  return response.json();
}

// ---- Helpers ----

function required(values, where) {
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`starlight-annotations: ${where} needs ${missing.join(', ')}.`);
}

function safeReturn(value) {
  const path = String(value || '/');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function text(message, status, cookies = []) {
  const headers = new Headers({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(message, { status, headers });
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value.replace(/\s/g, '')), (char) => char.charCodeAt(0));
}

function base64url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

function timingSafeEqual(left, right) {
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * @typedef {{
 *   repo: string,
 *   token: string,
 *   branch?: string,
 *   dir?: string,
 *   clientId: string,
 *   clientSecret: string,
 *   sessionSecret: string,
 *   writers?: 'collaborators' | 'anyone' | string[] | ((profile: { login: string, id: number }) => boolean | Promise<boolean>),
 *   cookieSecure?: boolean,
 * }} GitHubOptions
 */
