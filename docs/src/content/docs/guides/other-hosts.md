---
title: Other hosts
description: Netlify, Vercel, Deno, Node and Astro endpoints.
---

The handler takes a `Request` and returns a `Response` (or `null` when the path is not under `/_annotations`). Anything that speaks the Fetch API can run it.

## Netlify Functions

```js title="netlify/functions/annotations.mjs"
import { createAnnotationsHandler, github } from 'starlight-annotations/server';

const handle = createAnnotationsHandler(github({ /* options */ }));

export default async (request) => (await handle(request)) ?? new Response('Not found', { status: 404 });
export const config = { path: '/_annotations/*' };
```

## Vercel Functions

```js title="api/annotations.js"
import { createAnnotationsHandler, github } from 'starlight-annotations/server';

const handle = createAnnotationsHandler(github({ /* options */ }));

export async function GET(request) { return (await handle(request)) ?? new Response(null, { status: 404 }); }
export const POST = GET;
```

Add a rewrite from `/_annotations/(.*)` to the function in `vercel.json`.

## Node, Express, Fastify

```js
import express from 'express';
import { createAnnotationsHandler, github } from 'starlight-annotations/server';
import { toNodeMiddleware } from 'starlight-annotations/server/node';

const app = express();
app.use(toNodeMiddleware(createAnnotationsHandler(github({ /* options */ }))));
app.use(express.static('dist'));
app.listen(3000);
```

## Astro endpoint (server output)

With an [adapter](https://docs.astro.build/en/guides/on-demand-rendering/), add a catch-all endpoint:

```js title="src/pages/_annotations/[...path].js"
import { createAnnotationsHandler, github } from 'starlight-annotations/server';

export const prerender = false;
const handle = createAnnotationsHandler(github({ /* options */ }));

export const ALL = async ({ request }) => (await handle(request)) ?? new Response(null, { status: 404 });
```

## Your own storage

`createAnnotationsHandler` takes any `{ storage, auth }` pair. A storage has `load(page)` and `update(page, mutate, user)`; an auth has `user(request)` and, optionally, `route(...)` for sign-in pages. See [the server reference](/starlight-annotations/reference/server/).
