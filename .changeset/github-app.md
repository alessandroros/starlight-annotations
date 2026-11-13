---
'starlight-annotations': minor
---

Adds GitHub App support: `github({ app: { appId, privateKey } })` instead of `token`. The server mints installation tokens limited to the notes repository, valid for an hour and renewed before they expire, and the app's client ID and secret also handle sign-in, so one app replaces the OAuth app and the personal access token. It suits organizations: the app belongs to no one, needs no token approval and does not expire. Commits show the app as committer and the reader as author. `token` keeps working as before; `githubAppToken()` is exported for other uses of the same app.
