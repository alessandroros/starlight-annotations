// Serves a built Starlight site and the annotation API from one Worker.
// Pages and assets skip the Worker (see run_worker_first in wrangler.jsonc).

import { createAnnotationsHandler, github } from 'starlight-annotations/server';

export default {
  async fetch(request, env) {
    const annotations = createAnnotationsHandler(
      github({
        repo: env.ANNOTATIONS_REPO,
        branch: env.ANNOTATIONS_BRANCH,
        token: env.GITHUB_TOKEN,
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        sessionSecret: env.ANNOTATIONS_SECRET,
      }),
    );
    return (await annotations(request)) ?? env.ASSETS.fetch(request);
  },
};
