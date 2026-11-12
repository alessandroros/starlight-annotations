---
title: Store notes on GitHub
description: Commit notes to your repository, written by the collaborators who sign in with GitHub.
---

With the GitHub storage, notes are JSON files on a branch of your repository (default `annotations`). The branch is created from the default branch on the first save, so notes never touch `main` and never trigger a deploy. Each commit has the reader as author.

Readers sign in with GitHub. By default only people with **write access** to the repository (write, maintain or admin) may annotate; read or triage access is not enough.

## 1. Create a GitHub OAuth app

GitHub → Settings → Developer settings → **OAuth Apps** → **New OAuth App** ([direct link](https://github.com/settings/applications/new); an organization has the same page under its settings).

| Field | Value |
|---|---|
| Homepage URL | your site, e.g. `https://docs.example.com` |
| Authorization callback URL | `https://docs.example.com/_annotations/callback` (with your site base before `/_annotations` if you have one) |

Leave Device Flow off. The app asks for no scope: it only reads the public profile of who signs in.

Copy the **Client ID**, then **Generate a new client secret** and copy it too.

## 2. Create a token for the server

A [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):

- **Resource owner**: the owner of the repository. An organization may have to approve the token.
- **Repository access**: only the docs repository.
- **Permissions**: *Contents: Read and write*. *Metadata: Read-only* is added for you.

The server reads and writes notes with this token, and uses it to check who is a collaborator.

## 3. Pick a session secret

Any long random string. It signs the session cookie:

```sh
openssl rand -hex 32
```

## 4. Mount the handler

```js
import { createAnnotationsHandler, github } from 'starlight-annotations/server';

const handle = createAnnotationsHandler(
  github({
    repo: 'owner/docs',
    token: env.GITHUB_TOKEN,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    sessionSecret: env.ANNOTATIONS_SECRET,
  }),
);
```

`handle(request)` returns a `Response` for its own paths and `null` for everything else. See [Cloudflare Workers](/starlight-annotations/guides/cloudflare/) and [other hosts](/starlight-annotations/guides/other-hosts/) for where to put it, and [the server reference](/starlight-annotations/reference/server/) for every option, such as `writers`, `branch` and `commitMessage`.
