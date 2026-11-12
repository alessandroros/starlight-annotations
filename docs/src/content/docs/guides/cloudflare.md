---
title: Cloudflare Workers
description: Serve the static site and the annotation API from one Worker.
---

A Worker with [static assets](https://developers.cloudflare.com/workers/static-assets/) serves the built site and answers the annotation API on the same origin. A complete example is in [`examples/cloudflare-worker`](https://github.com/alessandroros/starlight-annotations/tree/main/examples/cloudflare-worker).

```js title="worker.js"
import { createAnnotationsHandler, github } from 'starlight-annotations/server';

export default {
  async fetch(request, env) {
    const annotations = createAnnotationsHandler(
      github({
        repo: env.ANNOTATIONS_REPO,
        token: env.GITHUB_TOKEN,
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        sessionSecret: env.ANNOTATIONS_SECRET,
      }),
    );
    return (await annotations(request)) ?? env.ASSETS.fetch(request);
  },
};
```

```jsonc title="wrangler.jsonc"
{
  "name": "my-docs",
  "main": "./worker.js",
  "compatibility_date": "2026-10-29",
  "assets": { "directory": "./dist", "binding": "ASSETS", "run_worker_first": ["/_annotations/*"] },
  "vars": { "ANNOTATIONS_REPO": "owner/docs", "GITHUB_CLIENT_ID": "Ov23…" }
}
```

`run_worker_first` sends only the API paths to the Worker; pages and assets are served directly.

Set the secrets once:

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_TOKEN
openssl rand -hex 32 | npx wrangler secret put ANNOTATIONS_SECRET
```

Then `npm run build && npx wrangler deploy`.

## A site behind a password

If your Worker already checks a password or Cloudflare Access, call the handler after that check: notes are then readable only by people who can read the pages.
