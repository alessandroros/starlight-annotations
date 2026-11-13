---
title: Server API
description: createAnnotationsHandler, the GitHub storage and sign-in, and the Node helpers.
---

## `createAnnotationsHandler({ storage, auth, prefix })`

From `starlight-annotations/server`. Returns `(request: Request) => Promise<Response | null>`.

| Route | |
|---|---|
| `GET {prefix}/api?page=<page>` | The notes of a page and the signed-in user. |
| `POST {prefix}/api` | `{ page, change }`: applies one change and returns the notes. Same-origin only. |
| `GET {prefix}/login`, `/callback`, `/logout` | Handled by the auth, when it has sign-in pages. |

`prefix` defaults to `/_annotations`. If your site has a `base`, include it: `prefix: '/docs/_annotations'`.

A change is one of `create` (with a target and a body), `reply` (with `replyTo`, optional `inReplyTo`), `resolve`, `delete`. Only the author may delete.

## `github(options)`

Returns `{ storage, auth }`: `githubStorage(options)` and `githubAuth(options)` with the same options.

| Option | Default | |
|---|---|---|
| `repo` | | `owner/name` that stores the notes. |
| `token` | | Contents read/write on `repo`. |
| `branch` | `'annotations'` | Created from the default branch on the first save. |
| `dir` | `'annotations'` | Folder in the branch. |
| `commitMessage` | | `(message, page) => string`, to follow your commit convention. |
| `clientId`, `clientSecret` | | The OAuth app. |
| `sessionSecret` | | Signs the session cookie. |
| `writers` | `'collaborators'` | `'collaborators'` (write, maintain or admin access to `repo`), `'anyone'`, a list of logins, or `(profile) => boolean`. |
| `recheck` | `60` | Seconds between checks that a signed-in reader may still write. `false` checks only at sign-in. See below. |
| `cookieSecure` | `true` | Set `false` only to test over plain http. |

`writers` is checked at sign-in and again while the session lasts: when a reader saves a note or loads a page, the answer is reused for `recheck` seconds and then asked again. If their access was removed, the save is refused and they are signed out, so taking someone off the repository takes effect within a minute instead of when their 30-day session ends. If GitHub does not answer, pages still load and saves fail until it does. The answers are kept in memory, per server instance; with `'collaborators'`, each check is one API call made with `token`.

## `gitlab(options)` <small>experimental</small>

`{ storage, auth }` for GitLab. Like `github`, with:

| Option | Default | |
|---|---|---|
| `host` | `'https://gitlab.com'` | Your GitLab. |
| `project` | | Path (`'group/docs'`) or numeric id. |
| `token` | | Scope `api`, Developer role or higher. |

`writers: 'collaborators'` means members with the Developer role or higher. See [the GitLab guide](/starlight-annotations/guides/gitlab/).

## `gitea(options)`, `forgejo(options)` <small>experimental</small>

`{ storage, auth }` for Gitea, Forgejo and Codeberg. Like `github`, with:

| Option | Default | |
|---|---|---|
| `host` | | Your server, e.g. `'https://codeberg.org'`. Required. |
| `repo` | | `owner/name`. |
| `token` | | *repository: Read and write*. |

`writers: 'collaborators'` means write, admin or owner permission. See [the Gitea guide](/starlight-annotations/guides/gitea/).

## `staticAuth(user)`

Everybody is `user`. For development, or behind your own login (Cloudflare Access, a VPN) where you know who the reader is. Write your own auth to read the identity from a header instead: an object with `user(request)`, and optionally `allowed(user)`, which the handler calls before every save and on page loads to refuse and sign out someone who may no longer write.

## Node helpers

From `starlight-annotations/server/node`:

- `fsStorage({ dir })`: notes as files under `dir`.
- `toNodeMiddleware(handler)`: `(req, res, next)` middleware for `node:http`, Connect, Express.
