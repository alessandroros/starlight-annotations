// GitLab storage and sign-in, for gitlab.com and self-managed GitLab.
//
// Storage: the Repository Files API, on a branch of its own (default
// "annotations"), created from the default branch on the first save. Commits
// carry the reader as author. Concurrent saves are caught with
// `last_commit_id`.
//
// Sign-in: a GitLab OAuth application with the `read_user` scope. Only
// project members with the Developer role or higher may annotate, unless
// `writers` says otherwise.

import { filePath } from '../core.js';
import { gitStorage } from './git-storage.js';
import { oauthAuth } from './oauth.js';
import { decodeText, encodeText, required, restClient } from './util.js';

const DEVELOPER = 30;

function hostOf(url = 'https://gitlab.com') {
  return url.replace(/\/+$/, '');
}

const client = (host, token) =>
  restClient({ base: `${hostOf(host)}/api/v4`, headers: { Authorization: `Bearer ${token}` }, label: 'GitLab' });

/**
 * Storage and sign-in together.
 * @param {import('../../server').GitLabOptions} options
 */
export function gitlab(options) {
  return { storage: gitlabStorage(options), auth: gitlabAuth(options) };
}

/** @param {import('../../server').GitLabStorageOptions} options */
export function gitlabStorage({ host, project, token, branch = 'annotations', dir = 'annotations', commitMessage }) {
  required({ project, token }, 'gitlabStorage');
  const api = client(host, token);
  const id = encodeURIComponent(project);
  const filesPath = (page) => `/projects/${id}/repository/files/${encodeURIComponent(filePath(page, dir))}`;
  const hostname = new URL(hostOf(host)).hostname;

  return gitStorage({
    mode: 'gitlab',
    commitMessage,

    async read(page) {
      const file = await api.get(`${filesPath(page)}?ref=${encodeURIComponent(branch)}`, { allow404: true });
      return file && { text: decodeText(file.content), version: file.last_commit_id };
    },

    async write(page, content, lastCommitId, message, user) {
      const response = await api.raw(filesPath(page), {
        method: lastCommitId ? 'PUT' : 'POST',
        body: JSON.stringify({
          branch,
          content: encodeText(content),
          encoding: 'base64',
          commit_message: message,
          last_commit_id: lastCommitId,
          ...(user.id ? { author_name: user.name || user.login, author_email: `${user.id}-${user.login}@users.noreply.${hostname}` } : {}),
        }),
      });
      if (response.ok) return 'ok';
      const detail = await response.text();
      if ((response.status === 400 || response.status === 404) && /branch/i.test(detail)) return 'missing-branch';
      // "has changed since you started editing it", or "already exists" when
      // another save created the file a moment ago.
      if (response.status === 400 && /changed|already exists/i.test(detail)) return 'conflict';
      throw new Error(`GitLab ${lastCommitId ? 'PUT' : 'POST'} ${response.status}: ${detail}`);
    },

    async createBranch() {
      const info = await api.get(`/projects/${id}`);
      const response = await api.raw(
        `/projects/${id}/repository/branches?branch=${encodeURIComponent(branch)}&ref=${encodeURIComponent(info.default_branch)}`,
        { method: 'POST' },
      );
      if (!response.ok) {
        const detail = await response.text();
        if (!(response.status === 400 && /already exists/i.test(detail))) throw new Error(`GitLab create branch ${response.status}: ${detail}`);
      }
    },
  });
}

/** @param {import('../../server').GitLabAuthOptions} options */
export function gitlabAuth({ host, project, token, writers = 'collaborators', ...options }) {
  if (writers === 'collaborators') required({ project, token }, 'gitlabAuth with writers "collaborators"');
  const base = hostOf(host);
  return oauthAuth({
    ...options,
    writers,
    mode: 'gitlab',
    where: 'gitlabAuth',
    authorizeUrl: `${base}/oauth/authorize`,
    tokenUrl: `${base}/oauth/token`,
    scope: 'read_user',
    async profile(userToken) {
      const user = await client(host, userToken).get('/user');
      return { login: user.username, id: user.id, name: user.name };
    },
    // Developer (30) and above can push to unprotected branches.
    async canWrite(profile) {
      const member = await client(host, token).get(`/projects/${encodeURIComponent(project)}/members/all/${profile.id}`, { allow404: true });
      return Boolean(member && member.access_level >= DEVELOPER);
    },
    noAccess: (login) => `${login} may not annotate these docs: a Developer role or higher on the project is needed.`,
  });
}
