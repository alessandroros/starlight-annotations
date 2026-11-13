---
'starlight-annotations': minor
---

Adds a page listing every note on the site, at `/annotations/` (change it with the `overview` option, or set `overview: false` to leave it out). Notes are grouped by page and can be filtered by status, author and text; the filters are kept in the address. Each note links to its page with `#annotation-<id>`, which opens the panel on that note and scrolls to its passage, also for resolved notes. The notes panel links to the overview.

Storages gain an optional `list()`, implemented for GitHub, GitLab, Gitea/Forgejo, the disk and the browser, and the handler answers `GET {prefix}/api/all`.
