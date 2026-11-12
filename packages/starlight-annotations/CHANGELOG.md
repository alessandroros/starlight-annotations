# starlight-annotations

## 0.1.1

### Patch Changes

- 7ebce53: Loads the Markdown parser only when a page has notes or a reader starts writing one. The script added to every page drops from about 100 kB to 27 kB.
- 943a525: Fixes the annotation UI having no styles in production builds: the stylesheet is now added to Starlight's `customCss`, which is linked on every page. In 0.1.0 the Notes button and panel appeared unstyled at the end of the page.
- 1d6c768: Points the npm homepage to the documentation site, and adds badges, feature icons and more search keywords to the package page.
