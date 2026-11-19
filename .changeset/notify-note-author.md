---
'starlight-annotations': minor
---

Adds `emails: true` to the GitHub, GitLab and Gitea auths, to email the author of a note when someone else answers or resolves it. The reader's email is read at sign-in (`user:email` on a GitHub OAuth app; the "Email addresses" account permission on a GitHub App) and stored on their notes encrypted with a key derived from the session secret, never in clear in the repository or in API responses. `onChange` events gain `threadAuthor: { login, name, email }`.
