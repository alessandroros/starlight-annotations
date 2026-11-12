// Shared by the provider tests: a cookie-keeping client and a JSON reply.
export const ORIGIN = 'https://docs.example';

export const reply = (data, status = 200) =>
  new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export function client(handle) {
  const jar = new Map();
  const request = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const response = await handle(new Request(ORIGIN + path, { ...init, headers }));
    for (const cookie of response?.headers.getSetCookie() ?? []) {
      const [pair] = cookie.split(';');
      const [name, ...value] = pair.split('=');
      if (/Max-Age=0/.test(cookie)) jar.delete(name);
      else jar.set(name, value.join('='));
    }
    return response;
  };
  request.signIn = async () => {
    const login = await request('/_annotations/login?return=/guides/demo/');
    const authorize = new URL(login.headers.get('Location'));
    const callback = await request(`/_annotations/callback?code=c&state=${authorize.searchParams.get('state')}`);
    return { authorize, callback };
  };
  request.post = (page, change) =>
    request('/_annotations/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ page, change }),
    });
  return request;
}

export const decode = (base64) => JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
