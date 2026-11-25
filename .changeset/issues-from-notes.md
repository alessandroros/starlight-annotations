---
'starlight-annotations': minor
---

With `issues: true` in the GitHub options (or `{ repo }` for another repository), every open thread has **Open issue**: the server opens a GitHub issue with the quote, a link back and the whole conversation, labelled with the note's kind, then resolves the note and links the issue in the panel and on the overview page. The credential needs Issues read/write. `onChange` receives the new `issue` action, which Slack and Teams post.
