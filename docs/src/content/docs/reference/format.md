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

- **Targets** follow the [W3C Web Annotation](https://www.w3.org/TR/annotation-model/#text-quote-selector) selectors. A selection longer than `longQuote` is a `RangeSelector` with a `startSelector` and an `endSelector`, each a `TextQuoteSelector` of 80 characters.
- **Replies** have `replyTo` (the first note of the thread) and, when they answer another reply, `inReplyTo`. Threads are flat.
- **Bodies** are Markdown, stored as typed.
- **Resolved** threads have `resolved: true`, `resolvedBy` and `resolvedAt`.

A note whose text cannot be found any more is listed under "Text no longer found on the page" until someone resolves or deletes it.
