---
'starlight-annotations': patch
---

`writers: 'collaborators'` (the default) now accepts only people with write, maintain or admin access to the repository. Read and triage access are refused; on a public repository GitHub reports read access for anyone, so before this fix any GitHub user could sign in and annotate.
