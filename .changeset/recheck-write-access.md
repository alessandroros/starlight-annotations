---
'starlight-annotations': minor
---

Checks write access again while a session lasts, not only at sign-in. Before saving a note, and when a signed-in reader loads a page, the server asks the provider again whether they may still write (`writers`), reusing the answer for `recheck` seconds (default 60). If their access was removed, the save is refused and they are signed out, instead of keeping write access until their 30-day session ends. Set `recheck: false` to check only at sign-in, as before. Custom auths can implement the same with an optional `allowed(user)`.
