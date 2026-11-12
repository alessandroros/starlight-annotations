---
title: Notes in the browser
description: Personal notes for each reader, with no server.
---

```js
starlightAnnotations({ backend: 'browser' });
```

Notes are saved in the reader's `localStorage`. There is no server and no sign-in, and nobody else sees them: good for study notes on a course or a handbook, and for demos like [this site](/starlight-annotations/guides/demo/).

Notes stay on one device and one browser, and clearing site data removes them. Use the [`api` backend](/starlight-annotations/guides/github/) for shared notes.
