# Starlight Annotations

Let readers highlight text and leave notes on your [Starlight](https://starlight.astro.build) docs. Notes are JSON files committed to your Git repository.

**[Documentation and live demo](https://alessandroros.github.io/starlight-annotations/)** · **[npm](https://www.npmjs.com/package/starlight-annotations)**

## Repository

```text
packages/starlight-annotations/   the plugin, the client and the server handler
docs/                             the documentation site, which is also the demo
examples/cloudflare-worker/       a Worker serving the docs and the API
```

## Develop

```sh
npm install
npm test                                  # unit tests
npm run dev                               # docs with notes in the browser
ANNOTATIONS_BACKEND=api npm run dev       # docs with the API, notes in docs/.annotations/
```

## Release

Describe user-facing changes with `npx changeset`. On `main`, the release workflow opens a "Version packages" pull request; merging it publishes to npm with provenance.

## Contributing

Issues and pull requests are welcome. Please open an issue first for larger changes, and add a changeset to pull requests that change the package.

## License

[MIT](./LICENSE)
