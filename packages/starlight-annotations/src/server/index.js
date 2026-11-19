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
//   GET  /api/all           notes of every page, for the overview
//   POST /api               { page, change } applies one change
//   GET  /login /callback /logout   handled by the auth, when it has them

import { AnnotationError, ROUTE_PREFIX, applyChange, checkPage, json, withoutContact } from '../core.js';
import { changeEvent } from './notify.js';

export { github, githubAuth, githubStorage } from './github.js';
export { githubAppToken } from './github-app.js';
export { gitlab, gitlabAuth, gitlabStorage } from './gitlab.js';
export { forgejo, gitea, giteaAuth, giteaStorage } from './gitea.js';
export { AnnotationError } from '../core.js';
export { describeChange, slackWebhook, teamsWebhook } from './notify.js';

/**
 * @param {{
 *   storage: Storage,
 *   auth?: Auth,
 *   prefix?: string,
 *   onChange?: OnChange | OnChange[],
 *   pageUrl?: (page: string, request: Request) => string,
 * }} options
 */
export function createAnnotationsHandler({ storage, auth, prefix = ROUTE_PREFIX, onChange, pageUrl }) {
  if (!storage) throw new Error('starlight-annotations: createAnnotationsHandler needs a storage.');
  const root = prefix.replace(/\/$/, '');
  const stillAllowed = async (user) => (auth?.allowed ? auth.allowed(user) : true);
  const listeners = [onChange].flat().filter(Boolean);

  // After a save: tell every listener. A failing listener is logged and never
  // fails the save. With `context.waitUntil` (Cloudflare Workers, Vercel,
  // Netlify) the response does not wait for them.
  function notify(event, context) {
    if (!listeners.length) return undefined;
    const task = Promise.all(
      listeners.map((listener) =>
        Promise.resolve()
          .then(() => listener(event))
          .catch((error) => console.error('starlight-annotations: onChange failed', error)),
      ),
    );
    if (typeof context?.waitUntil === 'function') {
      context.waitUntil(task);
      return undefined;
    }
    return task;
  }

  // Where a note can be opened: the page the reader was on (the Referer of a
  // same-origin save), else `pageUrl(page)`, else a guess without the base.
  function linkTo(page, request, url, id) {
    let base = pageUrl?.(page, request);
    if (!base) {
      try {
        const referer = new URL(request.headers.get('Referer') ?? '');
        if (referer.origin === url.origin) base = `${referer.origin}${referer.pathname}`;
      } catch {
        // No Referer, or not a URL.
      }
    }
    base ??= `${url.origin}/${page === 'index' ? '' : `${page.replace(/\/index$/, '')}/`}`;
    return id ? `${base}#annotation-${encodeURIComponent(id)}` : base;
  }

  // Who opened the thread, when it is someone else, with their email when
  // their note carries one and the auth can open it.
  async function threadAuthor({ annotation, annotations }, user) {
    const thread = annotation.replyTo ? annotations.find((item) => item.id === annotation.replyTo) : annotation;
    const owner = thread?.author;
    if (!owner || owner.login.toLowerCase() === user.login.toLowerCase()) return null;
    const email = owner.contact && auth?.openContact ? await auth.openContact(owner.contact) : null;
    return { login: owner.login, name: owner.name, email };
  }

  return async function handleAnnotations(request, context) {
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
            annotations: doc.annotations.map(withoutContact),
            user: user && { login: user.login, name: user.name },
            mode: auth?.mode ?? storage.mode ?? 'api',
            canSignIn: Boolean(auth?.route),
          },
          200,
          revoked && auth.clearSession ? { 'Set-Cookie': auth.clearSession } : {},
        );
      }

      if (route === '/api/all' && request.method === 'GET') {
        if (!storage.list) return json({ error: 'This storage cannot list pages.' }, 501);
        const pages = (await storage.list())
          .filter((entry) => entry.annotations.length > 0)
          .map((entry) => ({ ...entry, annotations: entry.annotations.map(withoutContact) }));
        pages.sort((a, b) => a.page.localeCompare(b.page));
        return json({ pages, mode: auth?.mode ?? storage.mode ?? 'api' });
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
        // With `emails`, new notes carry the writer's email, sealed.
        const writer = auth?.sealContact && user.email ? { ...user, contact: await auth.sealContact(user.email) } : user;
        const saved = await storage.update(checkPage(page), (doc) => applyChange(doc, change, writer), writer);
        const result = { ...saved, annotation: withoutContact(saved.annotation), annotations: saved.annotations.map(withoutContact) };
        if (listeners.length) {
          const deleted = change.action === 'delete';
          const target = deleted ? (result.annotation.replyTo ?? null) : result.annotation.id;
          const exists = target && result.annotations.some((item) => item.id === target);
          const event = changeEvent({ change, result, page, user, url: linkTo(page, request, url, exists ? target : null) });
          event.threadAuthor = await threadAuthor(saved, user);
          await notify(event, context);
        }
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
 *   list?(): Promise<{ page: string, annotations: object[] }[]>,
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
 *   sealContact?(email: string): Promise<string>,
 *   openContact?(sealed: string): Promise<string | null>,
 * }} Auth
 * @typedef {(event: import('../../server').AnnotationEvent) => void | Promise<void>} OnChange
 */
