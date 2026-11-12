# Example: Cloudflare Worker

One Worker serves the built docs and the annotation API, with notes committed to GitHub.

1. Follow [Store notes on GitHub](https://alessandroros.github.io/starlight-annotations/guides/github/) to get an OAuth app and a token.
2. Set `ANNOTATIONS_REPO` and `GITHUB_CLIENT_ID` in `wrangler.jsonc`, and the secrets:

   ```sh
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put GITHUB_TOKEN
   openssl rand -hex 32 | npx wrangler secret put ANNOTATIONS_SECRET
   ```

3. Build the docs of this repository with the `api` backend at the root path, then deploy:

   ```sh
   ANNOTATIONS_BACKEND=api DOCS_BASE=/ npm run build
   npx wrangler deploy
   ```

   For your own site, point `assets.directory` at its `dist` folder.

The OAuth app callback is `https://<your worker>/_annotations/callback`.
