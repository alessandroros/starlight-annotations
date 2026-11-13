# starlight-annotations

## 0.5.0

### Minor Changes

- 6ee673f: Adds a page listing every note on the site, at `/annotations/` (change it with the `overview` option, or set `overview: false` to leave it out). Notes are grouped by page and can be filtered by status, author and text; the filters are kept in the address. Each note links to its page with `#annotation-<id>`, which opens the panel on that note and scrolls to its passage, also for resolved notes. The notes panel links to the overview.
  
  Storages gain an optional `list()`, implemented for GitHub, GitLab, Gitea/Forgejo, the disk and the browser, and the handler answers `GET {prefix}/api/all`.

### Patch Changes

- b1bf95b: Makes the overview page easier to find: the notes panel links to it from its header, next to the title, and from the message shown on a page without notes, instead of at the end of the list.

## 0.4.0

### Minor Changes

- 2a7a36c: Adds GitHub App support: `github({ app: { appId, privateKey } })` instead of `token`. The server mints installation tokens limited to the notes repository, valid for an hour and renewed before they expire, and the app's client ID and secret also handle sign-in, so one app replaces the OAuth app and the personal access token. It suits organizations: the app belongs to no one, needs no token approval and does not expire. Commits show the app as committer and the reader as author. `token` keeps working as before; `githubAppToken()` is exported for other uses of the same app.

## 0.3.0

### Minor Changes

- 05c032c: Checks write access again while a session lasts, not only at sign-in. Before saving a note, and when a signed-in reader loads a page, the server asks the provider again whether they may still write (`writers`), reusing the answer for `recheck` seconds (default 60). If their access was removed, the save is refused and they are signed out, instead of keeping write access until their 30-day session ends. Set `recheck: false` to check only at sign-in, as before. Custom auths can implement the same with an optional `allowed(user)`.

## 0.2.0

### Minor Changes

- ccdae74: Adds GitLab and Gitea/Forgejo storage and sign-in, next to GitHub: `gitlab({ host, project, … })` for gitlab.com and self-managed GitLab, and `gitea({ host, repo, … })` (also exported as `forgejo`) for Gitea, Forgejo and Codeberg. Both are experimental: they are tested against simulated APIs. The OAuth flow, session and retry logic are now shared by all providers; GitHub behaves as before.

## 0.1.2

### Patch Changes

- 8c153d2: `writers: 'collaborators'` (the default) now accepts only people with write, maintain or admin access to the repository. Read and triage access are refused; on a public repository GitHub reports read access for anyone, so before this fix any GitHub user could sign in and annotate.

## 0.1.1

### Patch Changes

- 7ebce53: Loads the Markdown parser only when a page has notes or a reader starts writing one. The script added to every page drops from about 100 kB to 27 kB.
- 943a525: Fixes the annotation UI having no styles in production builds: the stylesheet is now added to Starlight's `customCss`, which is linked on every page. In 0.1.0 the Notes button and panel appeared unstyled at the end of the page.
- 1d6c768: Points the npm homepage to the documentation site, and adds badges, feature icons and more search keywords to the package page.

## 0.1.0

### Minor Changes

- 859bd1b: First release. Readers select text on a Starlight page and leave Markdown notes with replies; notes are stored as one JSON file per page on an `annotations` branch of a GitHub repository, through OAuth sign-in and a Web-standard handler, or in the reader's browser with `backend: 'browser'`.
