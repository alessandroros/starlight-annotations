---
title: Security
description: What the plugin does to keep notes and the site safe.
---

- **Markdown without HTML.** Notes are rendered with [micromark](https://github.com/micromark/micromark), which escapes raw HTML and drops `javascript:` and other unsafe link protocols. Links open in a new tab with `rel="noopener noreferrer nofollow"`.
- **No DOM rewriting.** Highlights use the CSS Custom Highlight API; the page markup is never changed.
- **Tokens stay on the server.** The reader's GitHub token is used once, at sign-in, to read their login, and is not stored. Reads and writes use the server token.
- **Signed sessions.** The session is an HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookie valid for 30 days. The OAuth flow checks a `state` value.
- **Same-origin writes.** `POST` requests from another origin are refused.
- **Who may write.** By default, people with write access to the repository (write, maintain or admin); read and triage access are refused. Access is checked again while the session lasts (every 60 seconds at most, see `recheck`), so removing someone from the repository signs them out. `writers: 'anyone'` lets every GitHub user commit to your notes branch: use it only if you are ready to moderate.
- **Who may read.** The API answers everyone who can reach it. Put it behind the same protection as your pages if they are private.
- **Limits.** A note is at most 5000 characters, a quote 2000 (80 per end for long passages), and page names are checked so they cannot leave the notes folder.
