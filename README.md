# 🖍️ Starlight Annotations

[![npm](https://img.shields.io/npm/v/starlight-annotations?color=blue)](https://www.npmjs.com/package/starlight-annotations)
[![CI](https://github.com/alessandroros/starlight-annotations/actions/workflows/ci.yml/badge.svg)](https://github.com/alessandroros/starlight-annotations/actions/workflows/ci.yml)
[![Docs](https://github.com/alessandroros/starlight-annotations/actions/workflows/docs.yml/badge.svg)](https://alessandroros.github.io/starlight-annotations/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

Let readers highlight text and leave notes on your [Starlight](https://starlight.astro.build) docs. Notes are JSON files committed to your Git repository.

**📖 [Documentation](https://alessandroros.github.io/starlight-annotations/) · ✨ [Live demo](https://alessandroros.github.io/starlight-annotations/guides/demo/) · 📦 [npm](https://www.npmjs.com/package/starlight-annotations)**

See the [package README](./packages/starlight-annotations/README.md) for features and the quick start.

## 📁 Repository

```text
packages/starlight-annotations/   the plugin, the client and the server handler
docs/                             the documentation site, which is also the demo
examples/cloudflare-worker/       a Worker serving the docs and the API
```

## 🛠️ Develop

```sh
npm install
npm test                                  # unit tests
npm run dev                               # docs with notes in the browser
ANNOTATIONS_BACKEND=api npm run dev       # docs with the API, notes in docs/.annotations/
```

## 📦 Release

Describe user-facing changes with `npx changeset`. On `main`, the release workflow opens a "Version packages" pull request; merging it **stages** the new version on npm with provenance. A maintainer then approves it on npmjs.com (or with `npm stage approve`), with 2FA, and only then is it published.

## 🤝 Contributing

Issues and pull requests are welcome. Please open an issue first for larger changes, and add a changeset to pull requests that change the package.

## 📄 License

[MIT](./LICENSE) © Alessandro Rosa
