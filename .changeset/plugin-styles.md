---
'starlight-annotations': patch
---

Fixes the annotation UI having no styles in production builds: the stylesheet is now added to Starlight's `customCss`, which is linked on every page. In 0.1.0 the Notes button and panel appeared unstyled at the end of the page.
