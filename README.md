# 🖍️ Starlight Annotations

[![npm](https://img.shields.io/npm/v/starlight-annotations?color=blue)](https://www.npmjs.com/package/starlight-annotations)
[![CI](https://github.com/alessandroros/starlight-annotations/actions/workflows/ci.yml/badge.svg)](https://github.com/alessandroros/starlight-annotations/actions/workflows/ci.yml)
[![Docs](https://github.com/alessandroros/starlight-annotations/actions/workflows/docs.yml/badge.svg)](https://alessandroros.github.io/starlight-annotations/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

Let readers highlight text and leave notes on your [Starlight](https://starlight.astro.build) docs. Notes are JSON files committed to your Git repository.

**📖 [Documentation](https://alessandroros.github.io/starlight-annotations/) · ✨ [Live demo](https://alessandroros.github.io/starlight-annotations/guides/demo/) · 📦 [npm](https://www.npmjs.com/package/starlight-annotations) · 📋 [Changelog](./packages/starlight-annotations/CHANGELOG.md)**

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
npm test        # unit tests
npm run dev     # the docs site, with the demo
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for pull requests, changesets and how releases are made.

## 📋 Releases

What changed in each version is in the [changelog](./packages/starlight-annotations/CHANGELOG.md), also on the [docs site](https://alessandroros.github.io/starlight-annotations/changelog/) and in the [GitHub releases](https://github.com/alessandroros/starlight-annotations/releases). The package follows semantic versioning; while it is `0.x`, a minor version may change behavior, and its notes say what to update.

## 📄 License

[MIT](./LICENSE) © Alessandro Rosa
