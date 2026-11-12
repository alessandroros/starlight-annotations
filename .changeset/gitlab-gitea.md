---
'starlight-annotations': minor
---

Adds GitLab and Gitea/Forgejo storage and sign-in, next to GitHub: `gitlab({ host, project, … })` for gitlab.com and self-managed GitLab, and `gitea({ host, repo, … })` (also exported as `forgejo`) for Gitea, Forgejo and Codeberg. Both are experimental: they are tested against simulated APIs. The OAuth flow, session and retry logic are now shared by all providers; GitHub behaves as before.
