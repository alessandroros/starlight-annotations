// Server credentials from a GitHub App instead of a personal access token.
//
// The server signs a short JWT with the app's private key, finds the app's
// installation on `repo`, and exchanges the JWT for an installation token
// limited to that one repository. The token lasts an hour; it is kept in
// memory and renewed five minutes before it expires.
//
// Unlike a personal token, an app belongs to no one: it survives people
// leaving, needs no approval as a personal token in an organization, and
// its commits show the app as committer (the reader stays the author).

import { base64url, fromBase64, required, restClient } from './util.js';

const API = 'https://api.github.com';
const HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const RENEW_BEFORE = 5 * 60 * 1000;

/**
 * A function that returns a valid installation token for `repo`.
 * @param {{ appId: string | number, privateKey: string, installationId?: string | number, repo: string }} options
 * @returns {() => Promise<string>}
 */
export function githubAppToken({ appId, privateKey, installationId, repo }) {
  required({ appId, privateKey, repo }, 'githubAppToken');
  const name = repo.split('/')[1];
  let key;
  let installation = installationId;
  let current;
  let pending;

  async function appJwt() {
    key ??= await crypto.subtle.importKey('pkcs8', pkcs8(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000);
    // 60 s in the past for clock drift; GitHub accepts at most 10 minutes.
    const part = (value) => base64url(new TextEncoder().encode(JSON.stringify(value)));
    const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 540, iss: String(appId) })}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    return `${unsigned}.${base64url(new Uint8Array(signature))}`;
  }

  async function mint() {
    const api = restClient({ base: API, headers: { ...HEADERS, Authorization: `Bearer ${await appJwt()}` }, label: 'GitHub App' });
    if (!installation) {
      const found = await api.get(`/repos/${repo}/installation`, { allow404: true });
      if (!found) throw new Error(`starlight-annotations: the GitHub App ${appId} is not installed on ${repo}.`);
      installation = found.id;
    }
    const response = await api.raw(`/app/installations/${installation}/access_tokens`, {
      method: 'POST',
      body: JSON.stringify({ repositories: [name] }),
    });
    if (!response.ok) throw new Error(`GitHub App token ${response.status}: ${await response.text()}`);
    const { token, expires_at: expiresAt } = await response.json();
    return { token, expires: Date.parse(expiresAt) };
  }

  return async function installationToken() {
    if (current && current.expires - Date.now() > RENEW_BEFORE) return current.token;
    // Requests that arrive together share one renewal.
    const renewal = (pending ??= mint()
      .then((fresh) => (current = fresh))
      .finally(() => (pending = undefined)));
    return (await renewal).token;
  };
}

// GitHub downloads keys as PKCS#1 ("BEGIN RSA PRIVATE KEY"); Web Crypto
// imports PKCS#8 ("BEGIN PRIVATE KEY"). Both are accepted, also with the
// line breaks written as "\n", as they often are in environment variables.
export function pkcs8(pem) {
  const text = String(pem).replace(/\\n/g, '\n').trim();
  const der = fromBase64(text.replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s/g, ''));
  if (text.includes('BEGIN PRIVATE KEY')) return der;
  if (text.includes('BEGIN RSA PRIVATE KEY')) {
    // PrivateKeyInfo { version 0, AlgorithmIdentifier { rsaEncryption, NULL }, OCTET STRING { the PKCS#1 key } }
    const rsaEncryption = Uint8Array.of(0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00);
    return node(0x30, concat(Uint8Array.of(0x02, 0x01, 0x00), rsaEncryption, node(0x04, der)));
  }
  throw new Error('starlight-annotations: the GitHub App private key must be a PEM ("BEGIN RSA PRIVATE KEY" or "BEGIN PRIVATE KEY").');
}

function node(tag, content) {
  const length = [];
  if (content.length < 0x80) length.push(content.length);
  else {
    for (let n = content.length; n > 0; n >>= 8) length.unshift(n & 0xff);
    length.unshift(0x80 | length.length);
  }
  return concat(Uint8Array.of(tag, ...length), content);
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
