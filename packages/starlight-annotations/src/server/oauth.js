// Sign-in with an OAuth 2 provider (GitHub, GitLab, Gitea/Forgejo), shared by
// every provider module.
//
// The reader's access token is used once, at the callback, to read who they
// are, and is then dropped. The session is an HMAC-signed cookie, so the
// server keeps no state. `writers` decides who may write.

import {
  base64url,
  fromBase64url,
  readCookie,
  redirect,
  required,
  safeReturn,
  text,
  timingSafeEqual,
} from './util.js';

const SESSION_COOKIE = 'annot_session';
const STATE_COOKIE = 'annot_state';
const SESSION_AGE = 60 * 60 * 24 * 30;

/**
 * @param {{
 *   mode: string,
 *   where: string,
 *   authorizeUrl: string,
 *   tokenUrl: string,
 *   scope?: string,
 *   clientId: string,
 *   clientSecret: string,
 *   sessionSecret: string,
 *   cookieSecure?: boolean,
 *   writers?: 'collaborators' | 'anyone' | string[] | ((profile: object) => boolean | Promise<boolean>),
 *   profile: (userToken: string) => Promise<{ login: string, id: number, name?: string }>,
 *   canWrite: (profile: { login: string, id: number }) => Promise<boolean>,
 *   noAccess: (login: string) => string,
 * }} options
 */
export function oauthAuth(options) {
  const { mode, where, authorizeUrl, tokenUrl, scope, clientId, clientSecret, sessionSecret, cookieSecure = true } = options;
  const writers = options.writers ?? 'collaborators';
  required({ clientId, clientSecret, sessionSecret }, where);

  const cookie = (name, value, maxAge, path = '/') =>
    `${name}=${value}; HttpOnly;${cookieSecure ? ' Secure;' : ''} SameSite=Lax; Path=${path}; Max-Age=${maxAge}`;

  async function mayWrite(profile) {
    if (writers === 'anyone') return true;
    if (Array.isArray(writers)) return writers.map((login) => login.toLowerCase()).includes(profile.login.toLowerCase());
    if (typeof writers === 'function') return Boolean(await writers(profile));
    return options.canWrite(profile);
  }

  async function hmac(value) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
  }

  return {
    mode,

    async user(request) {
      const value = readCookie(request, SESSION_COOKIE);
      if (!value) return null;
      const [body, signature] = value.split('.');
      if (!body || !signature || !timingSafeEqual(signature, await hmac(body))) return null;
      try {
        const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
        return payload.exp > Date.now() / 1000 ? payload : null;
      } catch {
        return null;
      }
    },

    async route(route, request, url, prefix) {
      if (request.method !== 'GET') return null;
      const callbackPath = `${prefix}/callback`;
      const redirectUri = `${url.origin}${callbackPath}`;

      if (route === '/login') {
        const state = crypto.randomUUID();
        const back = safeReturn(url.searchParams.get('return'));
        const authorize = new URL(authorizeUrl);
        authorize.searchParams.set('client_id', clientId);
        authorize.searchParams.set('redirect_uri', redirectUri);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('state', state);
        if (scope) authorize.searchParams.set('scope', scope);
        if (mode === 'github') authorize.searchParams.set('allow_signup', 'false');
        return redirect(authorize.toString(), [cookie(STATE_COOKIE, `${state}.${encodeURIComponent(back)}`, 600, callbackPath)]);
      }

      if (route === '/callback') {
        // "<uuid>.<return path>": the uuid has no dot, the path may.
        const saved = readCookie(request, STATE_COOKIE) || '';
        const dot = saved.indexOf('.');
        const [state, back] = dot === -1 ? [saved, ''] : [saved.slice(0, dot), saved.slice(dot + 1)];
        const clear = cookie(STATE_COOKIE, '', 0, callbackPath);
        if (!state || state !== url.searchParams.get('state')) return text('The sign-in link expired. Try again.', 400, [clear]);

        const exchange = await fetch(tokenUrl, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: url.searchParams.get('code'),
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }),
        });
        const { access_token: userToken } = await exchange.json().catch(() => ({}));
        if (!userToken) return text('The sign-in was not confirmed. Try again.', 400, [clear]);

        const profile = await options.profile(userToken);
        if (!(await mayWrite(profile))) return text(options.noAccess(profile.login), 403, [clear]);

        const body = base64url(
          new TextEncoder().encode(
            JSON.stringify({ login: profile.login, id: profile.id, name: profile.name || profile.login, exp: Math.floor(Date.now() / 1000) + SESSION_AGE }),
          ),
        );
        const session = `${body}.${await hmac(body)}`;
        return redirect(safeReturn(decodeURIComponent(back || '/')), [clear, cookie(SESSION_COOKIE, session, SESSION_AGE)]);
      }

      if (route === '/logout') {
        return redirect(safeReturn(url.searchParams.get('return')), [cookie(SESSION_COOKIE, '', 0)]);
      }

      return null;
    },
  };
}
