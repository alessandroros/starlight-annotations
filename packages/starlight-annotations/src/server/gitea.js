// Gitea and Forgejo storage and sign-in: self-hosted servers, and Codeberg
// (https://codeberg.org), which runs Forgejo.
//
// Storage: the Contents API, on a branch of its own (default "annotations"),
// created from the default branch on the first save. Commits carry the
// reader as author.
//
// Sign-in: an OAuth2 application on the server. Only people with write
// access to the repository may annotate, unless `writers` says otherwise.

import { filePath } from '../core.js';
import { gitStorage } from './git-storage.js';
import { oauthAuth } from './oauth.js';
import { decodeText, encodeText, required, restClient } from './util.js';

const hostOf = (url) => url.replace(/\/+$/, '');

const client = (host, authorization) => restClient({ base: `${hostOf(host)}/api/v1`, headers: { Authorization: authorization }, label: 'Gitea' });

/**
 * Storage and sign-in together.
 * @param {import('../../server').GiteaOptions} options
 */
export function gitea(options) {
  return { storage: giteaStorage(options), auth: giteaAuth(options) };
}

/** @param {import('../../server').GiteaStorageOptions} options */
export function giteaStorage({ host, repo, token, branch = 'annotations', dir = 'annotations', commitMessage }) {
  required({ host, repo, token }, 'giteaStorage');
  const api = client(host, `token ${token}`);
  const contentsPath = (page) => `/repos/${repo}/contents/${filePath(page, dir).split('/').map(encodeURIComponent).join('/')}`;
  const hostname = new URL(hostOf(host)).hostname;

  return gitStorage({
    mode: 'gitea',
    commitMessage,

    async read(page) {
      const file = await api.get(`${contentsPath(page)}?ref=${encodeURIComponent(branch)}`, { allow404: true });
      return file && { text: decodeText(file.content), version: file.sha };
    },

    async write(page, content, sha, message, user) {
      const response = await api.raw(contentsPath(page), {
        method: sha ? 'PUT' : 'POST',
        body: JSON.stringify({
          message,
          content: encodeText(content),
          sha,
          branch,
          ...(user.id ? { author: { name: user.name || user.login, email: `${user.login}@noreply.${hostname}` } } : {}),
        }),
      });
      if (response.ok) return 'ok';
      const detail = await response.text();
      if ((response.status === 404 || response.status === 422) && /branch/i.test(detail)) return 'missing-branch';
      // Stale sha, or the file was created by another save meanwhile.
      if (response.status === 409 || response.status === 422) return 'conflict';
      throw new Error(`Gitea ${sha ? 'PUT' : 'POST'} ${response.status}: ${detail}`);
    },

    async createBranch() {
      const info = await api.get(`/repos/${repo}`);
      const response = await api.raw(`/repos/${repo}/branches`, {
        method: 'POST',
        body: JSON.stringify({ new_branch_name: branch, old_branch_name: info.default_branch }),
      });
      // 409: it exists already.
      if (!response.ok && response.status !== 409) throw new Error(`Gitea create branch ${response.status}: ${await response.text()}`);
    },
  });
}

/** @param {import('../../server').GiteaAuthOptions} options */
export function giteaAuth({ host, repo, token, writers = 'collaborators', ...options }) {
  required({ host }, 'giteaAuth');
  if (writers === 'collaborators') required({ repo, token }, 'giteaAuth with writers "collaborators"');
  const base = hostOf(host);
  return oauthAuth({
    ...options,
    writers,
    mode: 'gitea',
    where: 'giteaAuth',
    authorizeUrl: `${base}/login/oauth/authorize`,
    tokenUrl: `${base}/login/oauth/access_token`,
    scope: 'read:user',
    async profile(userToken) {
      const user = await client(host, `Bearer ${userToken}`).get('/user');
      return { login: user.login, id: user.id, name: user.full_name };
    },
    async canWrite(profile) {
      const permission = await client(host, `token ${token}`).get(
        `/repos/${repo}/collaborators/${encodeURIComponent(profile.login)}/permission`,
        { allow404: true },
      );
      return ['owner', 'admin', 'write'].includes(permission?.permission);
    },
    noAccess: (login) => `${login} may not annotate these docs.`,
  });
}

/** Forgejo speaks the same API as Gitea. */
export { gitea as forgejo };
