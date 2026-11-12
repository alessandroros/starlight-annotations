# 🖍️ starlight-annotations

[![npm](https://img.shields.io/npm/v/starlight-annotations?color=blue)](https://www.npmjs.com/package/starlight-annotations)
[![CI](https://github.com/alessandroros/starlight-annotations/actions/workflows/ci.yml/badge.svg)](https://github.com/alessandroros/starlight-annotations/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/alessandroros/starlight-annotations/blob/main/LICENSE)
[![Starlight plugin](https://img.shields.io/badge/Starlight-plugin-8a55f6)](https://starlight.astro.build/resources/plugins/)

Let readers highlight text and leave notes on your [Starlight](https://starlight.astro.build) docs. Notes are JSON files committed to your Git repository, not stored by a third-party service.

**📖 [Documentation](https://alessandroros.github.io/starlight-annotations/) · ✨ [Live demo](https://alessandroros.github.io/starlight-annotations/guides/demo/)**

## Features

- 💬 **Select, note, discuss.** Markdown notes with a formatting toolbar, replies, "in reply to" references, resolve and reopen.
- 📌 **Anchored to the text.** W3C Web Annotation selectors: notes find their place again after edits, and long passages are stored by their start and end.
- 🗂️ **Your repo, your data.** One file per page on a branch of its own; every note is a commit by its author.
- 🌍 **Runs anywhere.** The API is one Web-standard handler for Cloudflare Workers, Netlify, Vercel, Deno or Node. Or keep personal notes in the browser, with no server.
- 🪶 **Light and safe.** Highlights use the CSS Custom Highlight API, so the page markup is never rewritten. Notes cannot inject HTML, and the Markdown parser loads only when it is needed.
- 🌐 **Multilingual.** English, Italian, German, French and Spanish built in; the UI follows the page language.

## 🚀 Quick start

```sh
npm install starlight-annotations
```

```js
// astro.config.mjs
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightAnnotations from 'starlight-annotations';

export default defineConfig({
  integrations: [
    starlight({
      title: 'My docs',
      plugins: [starlightAnnotations()],
    }),
  ],
});
```

Run `npm run dev`, select text on any page and press **Annotate**. During development notes are written to `.annotations/` in your project.

## ☁️ Publish

Mount the handler next to your pages, for example on a Cloudflare Worker:

```js
import { createAnnotationsHandler, github } from 'starlight-annotations/server';

export default {
  async fetch(request, env) {
    const annotations = createAnnotationsHandler(
      github({
        repo: 'owner/docs',
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

See [Store notes on GitHub](https://alessandroros.github.io/starlight-annotations/guides/github/) for the OAuth app and the token, and [other hosts](https://alessandroros.github.io/starlight-annotations/guides/other-hosts/) for Netlify, Vercel, Node and Astro endpoints.

No server? `starlightAnnotations({ backend: 'browser' })` keeps notes in each reader's browser.

## 📄 License

MIT © Alessandro Rosa
