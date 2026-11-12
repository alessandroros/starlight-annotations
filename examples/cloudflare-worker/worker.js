// Serves a built Starlight site and the annotation API from one Worker.
// Pages and assets skip the Worker (see run_worker_first in wrangler.jsonc).

import { createAnnotationsHandler, github } from 'starlight-annotations/server';

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/_annotations/')) {
      const options = {
        repo: env.ANNOTATIONS_REPO,
        branch: env.ANNOTATIONS_BRANCH || undefined,
        token: env.GITHUB_TOKEN,
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        sessionSecret: env.ANNOTATIONS_SECRET,
      };
      // Until every value is set, answer 503: the pages then hide the annotation UI.
      if (Object.entries(options).some(([key, value]) => key !== 'branch' && !value)) {
        return Response.json({ error: 'Annotations are not configured.' }, { status: 503 });
      }
      const response = await createAnnotationsHandler(github(options))(request);
      if (response) return response;
    }
    return env.ASSETS.fetch(request);
  },
};
