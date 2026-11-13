// GitHub storage and GitHub sign-in.
//
// Storage: one JSON file per page, committed through the Contents API to a
// branch of its own (default "annotations"), so notes never touch the default
// branch and never trigger a deploy. The branch is created from the default
// branch on the first save. Each commit has the reader as author (their
// noreply address), so `git log` and `git blame` show who wrote what.
//
// Sign-in: a GitHub OAuth app, or the client id and secret of a GitHub App.
// Only people with write access to `repo` may annotate, unless `writers`
// says otherwise.
//
// Server credentials: a token, or `app` ({ appId, privateKey }) for a GitHub
// App installed on `repo` (see github-app.js).

import { filePath, pageFromPath } from '../core.js';
import { githubAppToken } from './github-app.js';
import { gitStorage } from './git-storage.js';
import { oauthAuth } from './oauth.js';
import { decodeText, encodeText, required, restClient } from './util.js';

// `token` is a string, or a function that returns one (a GitHub App).
const client = (token) =>
  restClient({
    base: 'https://api.github.com',
    headers: async () => ({
      Authorization: `Bearer ${typeof token === 'function' ? await token() : token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }),
    label: 'GitHub',
  });

// The server credential: `token` as given, or installation tokens of `app`.
function serverToken({ repo, token, app }, where) {
  if (token) return token;
  if (app) return githubAppToken({ ...app, repo });
  throw new Error(`starlight-annotations: ${where} needs token or app.`);
}

/**
 * Storage and sign-in together, which is what most sites want. With `app`,
 * both share one installation token.
 * @param {import('../../server').GitHubOptions} options
 */
export function github(options) {
  const token = options.token || options.app ? serverToken(options, 'github') : undefined;
  const shared = { ...options, token, app: undefined };
  return { storage: githubStorage(shared), auth: githubAuth(shared) };
}

/** @param {import('../../server').GitHubStorageOptions} options */
export function githubStorage({ repo, token, app, branch = 'annotations', dir = 'annotations', commitMessage }) {
  required({ repo }, 'githubStorage');
  const api = client(serverToken({ repo, token, app }, 'githubStorage'));
  const contentsPath = (page) => `/repos/${repo}/contents/${filePath(page, dir).split('/').map(encodeURIComponent).join('/')}`;

  return gitStorage({
    mode: 'github',
    commitMessage,

    async read(page) {
      const file = await api.get(`${contentsPath(page)}?ref=${encodeURIComponent(branch)}`, { allow404: true });
      return file && { text: decodeText(file.content), version: file.sha };
    },

    async write(page, content, sha, message, user) {
      const response = await api.raw(contentsPath(page), {
        method: 'PUT',
        body: JSON.stringify({
          message,
          content: encodeText(content),
          sha,
          branch,
          author: user.id ? { name: user.name || user.login, email: `${user.id}+${user.login}@users.noreply.github.com` } : undefined,
        }),
      });
      if (response.ok) return 'ok';
      const detail = await response.text();
      // A missing branch answers 404, or 422 "Branch … not found".
      if (response.status === 404 || (response.status === 422 && /branch/i.test(detail))) return 'missing-branch';
      // 409: stale sha. 422 "sha wasn't supplied": the file was created meanwhile.
      if (response.status === 409 || response.status === 422) return 'conflict';
      throw new Error(`GitHub PUT ${response.status}: ${detail}`);
    },

    async pages() {
      const tree = await api.get(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { allow404: true });
      if (!tree) return []; // No notes branch yet.
      if (tree.truncated) console.warn('starlight-annotations: the notes branch is too large to list in one request; some pages are missing.');
      return tree.tree.filter((entry) => entry.type === 'blob').map((entry) => pageFromPath(entry.path, dir)).filter(Boolean);
    },

    async createBranch() {
      const info = await api.get(`/repos/${repo}`);
      const head = await api.get(`/repos/${repo}/git/ref/heads/${encodeURIComponent(info.default_branch)}`);
      const response = await api.raw(`/repos/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.object.sha }),
      });
      // 422: it exists already (another save created it a moment ago).
      if (!response.ok && response.status !== 422) throw new Error(`GitHub create branch ${response.status}: ${await response.text()}`);
    },
  });
}

/** @param {import('../../server').GitHubAuthOptions} options */
export function githubAuth({ repo, token, app, writers = 'collaborators', ...options }) {
  let server;
  if (writers === 'collaborators') {
    required({ repo }, 'githubAuth with writers "collaborators"');
    server = serverToken({ repo, token, app }, 'githubAuth with writers "collaborators"');
  }
  return oauthAuth({
    ...options,
    writers,
    mode: 'github',
    where: 'githubAuth',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    // No scope: the public profile is enough to know who the reader is.
    async profile(userToken) {
      const user = await client(userToken).get('/user');
      return { login: user.login, id: user.id, name: user.name };
    },
    // Only people who can push. `permission` is the legacy level: maintain
    // counts as write, triage as read. On a public repository GitHub answers
    // "read" for anyone, so read access is not enough.
    async canWrite(profile) {
      const permission = await client(server).get(`/repos/${repo}/collaborators/${encodeURIComponent(profile.login)}/permission`, {
        allow404: true,
      });
      return permission?.permission === 'admin' || permission?.permission === 'write';
    },
    noAccess: (login) => `${login} may not annotate these docs.`,
  });
}
