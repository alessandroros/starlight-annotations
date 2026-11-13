// The annotation API as a Web-standard handler: (Request) => Response | null.
// Storage and sign-in for GitHub, GitLab, and Gitea/Forgejo (Codeberg).
// It runs anywhere that speaks fetch: Cloudflare Workers, Deno, Bun, Netlify
// and Vercel functions, Node 20+, or an Astro endpoint.
//
//   const handle = createAnnotationsHandler(github({ repo, token, ... }));
//   const response = await handle(request); // null when the path is not ours
//
// Routes, under `prefix` (default "/_annotations"):
//   GET  /api?page=<page>   notes of a page, and who is signed in
//   POST /api               { page, change } applies one change
//   GET  /login /callback /logout   handled by the auth, when it has them

import { AnnotationError, ROUTE_PREFIX, applyChange, checkPage, json } from '../core.js';

export { github, githubAuth, githubStorage } from './github.js';
export { gitlab, gitlabAuth, gitlabStorage } from './gitlab.js';
export { forgejo, gitea, giteaAuth, giteaStorage } from './gitea.js';
export { AnnotationError } from '../core.js';

/**
 * @param {{ storage: Storage, auth?: Auth, prefix?: string }} options
 */
export function createAnnotationsHandler({ storage, auth, prefix = ROUTE_PREFIX }) {
  if (!storage) throw new Error('starlight-annotations: createAnnotationsHandler needs a storage.');
  const root = prefix.replace(/\/$/, '');
  const stillAllowed = async (user) => (auth?.allowed ? auth.allowed(user) : true);

  return async function handleAnnotations(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${root}/`)) return null;
    const route = url.pathname.slice(root.length);

    try {
      if (auth?.route) {
        const response = await auth.route(route, request, url, root);
        if (response) return response;
      }

      if (route === '/api' && request.method === 'GET') {
        const page = checkPage(url.searchParams.get('page'));
        const doc = await storage.load(page);
        let user = auth ? await auth.user(request) : null;
        // Reading never fails on the access check: if the provider does not
        // answer, the reader stays signed in and the next write asks again.
        const revoked = user && (await stillAllowed(user).catch(() => true)) === false;
        if (revoked) user = null;
        return json(
          {
            annotations: doc.annotations,
            user: user && { login: user.login, name: user.name },
            mode: auth?.mode ?? storage.mode ?? 'api',
            canSignIn: Boolean(auth?.route),
          },
          200,
          revoked ? { 'Set-Cookie': auth.clearSession } : {},
        );
      }

      if (route === '/api' && request.method === 'POST') {
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin) return json({ error: 'Cross-site request refused.' }, 403);
        const user = auth ? await auth.user(request) : null;
        if (!user) return json({ error: 'Sign in first.' }, 401);
        if (!(await stillAllowed(user))) {
          const error = auth.noAccess ? auth.noAccess(user.login) : 'You may no longer annotate these docs.';
          return json({ error, signedOut: true }, 403, auth.clearSession ? { 'Set-Cookie': auth.clearSession } : {});
        }
        const { page, change } = await request.json();
        const result = await storage.update(checkPage(page), (doc) => applyChange(doc, change, user), user);
        return json(result);
      }

      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      if (error instanceof AnnotationError) return json({ error: error.message }, error.status);
      console.error('starlight-annotations', error);
      return json({ error: 'The annotation service failed. Try again.' }, 502);
    }
  };
}

/**
 * A fixed identity, for local development or a site behind its own login.
 * @param {{ login: string, name?: string, id?: number }} user
 */
export function staticAuth(user) {
  return { mode: 'local', user: async () => user };
}

/**
 * @typedef {{ login: string, name?: string, id?: number }} User
 * @typedef {{ version: number, page: string, annotations: object[] }} AnnotationDocument
 * @typedef {{
 *   mode?: string,
 *   load(page: string): Promise<AnnotationDocument>,
 *   update(page: string, mutate: (doc: AnnotationDocument) => { annotation: object, message: string }, user: User):
 *     Promise<{ annotation: object, annotations: object[] }>,
 * }} Storage
 * @typedef {{
 *   mode?: string,
 *   user(request: Request): Promise<User | null>,
 *   route?(route: string, request: Request, url: URL, prefix: string): Promise<Response | null>,
 *   allowed?(user: User): Promise<boolean>,
 *   noAccess?(login: string): string,
 *   clearSession?: string,
 * }} Auth
 */
