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

## All notes on one page

The plugin adds a page at `/annotations/` that lists every note on the site, grouped by page: what was quoted, who wrote it, when, and how many replies. Filter by status (open, new, text changed, resolved or all), by author, or by text; the filters stay in the address, so you can share a filtered view. **Open on the page** jumps to the note in its page, with the passage highlighted. The notes panel links to it from its header, and from the message on pages without notes. To make it easier to find for reviewers, add it to your sidebar: `{ label: 'Review notes', link: '/annotations/' }`.

The page reads every notes file, one request per annotated page, so it is meant for reviewers rather than for every visitor. Change its path with `overview: 'review'`, or leave it out with `overview: false`.

## Kinds, and notes on the whole page

- **Kinds.** When writing a note, pick what it is: question, problem, proposal or decision. It shows as a coloured label, and the overview page filters by it, so "decision" notes become a record of what was agreed. A kind is optional and its author can change it later.
- **Whole page.** **+ Note on this page**, at the top of the notes panel, writes a note about the page itself rather than a passage, for example "this page is missing the refund flow". These notes come first in the panel.

## Suggested edits

Select a few words and press **Suggest edit** instead of **Annotate**. Write the text as it should read, and why if you like. The note shows the change: removed words struck out in red, new words in green. Others reply as on any note, and **Copy new text** copies the replacement, to apply it to the source by hand. Its author can change the suggestion with **Edit**. The overview page lists them under **Type: Suggested edits**.

A suggestion replaces the passage it quotes, so it works on selections shorter than `longQuote`, not on long passages or the whole page.

## What's new, and mentions

- **New since your last visit.** Notes, replies and edits that others wrote after you last opened a page's notes are marked **New**, and the **Notes** button counts them. The overview page has a **New** filter. On a page you never opened, every note from others is new. Each browser remembers this for itself, in `localStorage`, next to the people it has seen: nothing reaches the server.
- **Mentions.** Type `@` in a note to pick someone who already writes notes on these docs: it writes `@login`. The server reads mentions into [`event.mentions`](/starlight-annotations/guides/notifications/#the-event), so you can notify the people named.

## Publish it

The published site needs somewhere to store notes. Pick one:

| You want | Read |
|---|---|
| Notes committed to your repository, written by your team | [GitHub](/starlight-annotations/guides/github/), [GitLab](/starlight-annotations/guides/gitlab/) or [Gitea, Forgejo and Codeberg](/starlight-annotations/guides/gitea/), then [Cloudflare Workers](/starlight-annotations/guides/cloudflare/) or [other hosts](/starlight-annotations/guides/other-hosts/) |
| Personal notes for each reader, no server | [Notes in the browser](/starlight-annotations/guides/browser-notes/) |

Until the API answers, the published site shows no annotation UI, so you can install the plugin before the server is ready.

## Browser support

Highlights use the [CSS Custom Highlight API](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API): Chrome and Edge 105+, Safari 17.2+, Firefox 140+. In older browsers notes still work from the panel, without highlights in the text.
