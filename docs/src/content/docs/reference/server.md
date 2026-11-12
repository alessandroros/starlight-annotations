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
| `cookieSecure` | `true` | Set `false` only to test over plain http. |

## `staticAuth(user)`

Everybody is `user`. For development, or behind your own login (Cloudflare Access, a VPN) where you know who the reader is. Write your own auth to read the identity from a header instead.

## Node helpers

From `starlight-annotations/server/node`:

- `fsStorage({ dir })`: notes as files under `dir`.
- `toNodeMiddleware(handler)`: `(req, res, next)` middleware for `node:http`, Connect, Express.
