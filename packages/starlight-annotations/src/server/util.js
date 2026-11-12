// Small helpers shared by the server modules. Web APIs only, so they run on
// Workers, Deno, Bun and Node 20+.

export function required(values, where) {
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`starlight-annotations: ${where} needs ${missing.join(', ')}.`);
}

export function safeReturn(value) {
  const path = String(value || '/');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

export function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

export function text(message, status, cookies = []) {
  const headers = new Headers({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(message, { status, headers });
}

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(value) {
  return Uint8Array.from(atob(value.replace(/\s/g, '')), (char) => char.charCodeAt(0));
}

export const encodeText = (value) => toBase64(new TextEncoder().encode(value));
export const decodeText = (value) => new TextDecoder().decode(fromBase64(value));

export function base64url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

export function timingSafeEqual(left, right) {
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return diff === 0;
}

// A small REST client: JSON in and out, `null` for an allowed 404.
export function restClient({ base, headers, label }) {
  const raw = (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'starlight-annotations',
        ...headers,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  const get = async (path, { allow404 = false } = {}) => {
    const response = await raw(path);
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`${label} GET ${path} ${response.status}: ${await response.text()}`);
    return response.json();
  };
  return { raw, get };
}
