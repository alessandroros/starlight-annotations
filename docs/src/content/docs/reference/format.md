---
title: File format
description: What a note looks like on disk.
---

One file per page: `annotations/<page>.json`, where `<page>` is the path of the page without the site base (`guides/demo`, `it/guides/demo`; the home page is `index`).

```json
{
  "version": 1,
  "page": "guides/demo",
  "annotations": [
    {
      "id": "a759e8e8-e6ea-4f11-8001-4c0a89bf7bea",
      "created": "2026-11-12T11:00:48Z",
      "author": { "login": "octocat", "name": "The Octocat" },
      "target": {
        "selector": {
          "type": "TextQuoteSelector",
          "exact": "point at the exact sentence",
          "prefix": "the people who read it can ",
          "suffix": " that confused them."
        }
      },
      "body": "Should this say **paragraph**?",
      "resolved": false
    },
    {
      "id": "0b1c…",
      "created": "2026-11-12T11:05:02Z",
      "author": { "login": "hubot", "name": "Hubot" },
      "replyTo": "a759e8e8-e6ea-4f11-8001-4c0a89bf7bea",
      "body": "Yes, fixed in #42."
    }
  ]
}
```

- **Notes about the whole page** have a `target` without a `selector` (`"target": {}`). The panel lists them first, under **Whole page**; they never lose their place when the text changes.
- **Kinds**: a thread may have `kind`: `question`, `issue` (shown as "Problem"), `proposal` or `decision`. Its author picks it when writing and can change it with **Edit**. Notes without a kind are fine.
- **Targets** follow the [W3C Web Annotation](https://www.w3.org/TR/annotation-model/#text-quote-selector) selectors. A selection longer than `longQuote` is a `RangeSelector` with a `startSelector` and an `endSelector`, each a `TextQuoteSelector` of 80 characters.
- **Replies** have `replyTo` (the first note of the thread) and, when they answer another reply, `inReplyTo`. Threads are flat.
- **Bodies** are Markdown, stored as typed.
- **Authors** are `{ login, name }`. With `emails: true` in the auth, notes and replies also carry `contact`: the writer's email, encrypted with the session secret. It is never sent to the browser.
- **Resolved** threads have `resolved: true`, `resolvedBy` and `resolvedAt`.
- **Edited** notes and replies have `edited`, the time of the last edit. Only the author can edit, and the panel shows "edited" next to the date.
- **Threads that became an issue** have `issue: { number, url }`, and are resolved.
- **Moved** threads have `movedBy` and `movedAt`: someone attached them to another passage, and `target` is the new one.

## When the text changes

A note whose text cannot be found any more is listed under "Text no longer found on the page" at the bottom of the panel, with the passage it quoted. Anyone signed in can press **Attach to other text**, select the passage the note is about now, and press **Attach here**: the thread keeps its messages and gets the new quote. Or resolve it, if the change answered it.

The overview page finds these notes for you: it opens each page with open notes and looks for their quotes, then marks the ones it cannot find **Text changed**. The status filter has a **Text changed** entry for them alone.
