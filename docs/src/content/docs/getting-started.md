---
title: Getting started
description: Install starlight-annotations and try it locally in two minutes.
---

## Install

```sh
npm install starlight-annotations
```

Add the plugin to Starlight in `astro.config.mjs`:

```js ins={3,9}
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

## Try it

Run `npm run dev`, open any page, select some text and press **Annotate**.

During development the plugin serves its own API: notes are written to `.annotations/` in your project, with your `git config user.name` as author. Add `.annotations/` to `.gitignore`.

## Publish it

The published site needs somewhere to store notes. Pick one:

| You want | Read |
|---|---|
| Notes committed to your repository, written by your team | [GitHub](/starlight-annotations/guides/github/), [GitLab](/starlight-annotations/guides/gitlab/) or [Gitea, Forgejo and Codeberg](/starlight-annotations/guides/gitea/), then [Cloudflare Workers](/starlight-annotations/guides/cloudflare/) or [other hosts](/starlight-annotations/guides/other-hosts/) |
| Personal notes for each reader, no server | [Notes in the browser](/starlight-annotations/guides/browser-notes/) |

Until the API answers, the published site shows no annotation UI, so you can install the plugin before the server is ready.

## Browser support

Highlights use the [CSS Custom Highlight API](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API): Chrome and Edge 105+, Safari 17.2+, Firefox 140+. In older browsers notes still work from the panel, without highlights in the text.
