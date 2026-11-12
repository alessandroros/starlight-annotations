---
title: Plugin options
description: Every option of the Starlight plugin.
---

```js
starlightAnnotations({
  backend: 'api',
  apiBase: '/_annotations',
  content: '.sl-markdown-content',
  exclude: [],
  longQuote: 400,
  translations: {},
  storageKey: 'starlight-annotations',
  dev: { dir: '.annotations' },
});
```

| Option | Default | What it does |
|---|---|---|
| `backend` | `'api'` | `'api'` reads and writes through the handler on your site. `'browser'` keeps notes in `localStorage`. |
| `apiBase` | `'/_annotations'` | Where the handler answers, relative to the site base. |
| `content` | `'.sl-markdown-content'` | The element whose text can be annotated. |
| `exclude` | `[]` | More CSS selectors to skip. Diagrams (`pre.mermaid`, `svg`), buttons and heading anchors are always skipped. |
| `longQuote` | `400` | Selections longer than this many characters are stored by their first and last 80 characters. |
| `translations` | `{}` | Override UI strings per language: `{ it: { annotate: 'Commenta' } }`. English, Italian, German, French and Spanish are built in; other languages fall back to English. |
| `storageKey` | `'starlight-annotations'` | `localStorage` key prefix for the `browser` backend. |
| `dev` | `{ dir: '.annotations' }` | The API served by `astro dev` for the `api` backend: notes go to `dir`, the author is `git config user.name` or `dev.user`. `false` turns it off. |

The UI follows the page language (`<html lang>`), so multilingual Starlight sites work out of the box. Each language version of a page has its own notes.
