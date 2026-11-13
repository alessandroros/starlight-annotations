// Where the browser reads and writes notes.
//
// "api":     the annotation handler on the same origin (GitHub, disk, or
//            your own storage). Hidden when the API does not answer.
// "browser": localStorage. No server, no sign-in; notes stay on this device.
//            Good for personal study notes, and for demos.

import { applyChange, parseDocument } from '../core.js';

export function createBackend(config, base, T) {
  return config.backend === 'browser' ? browserBackend(config, T) : apiBackend(config, base);
}

function apiBackend(config, base) {
  const api = config.apiBase.startsWith('/') ? `${base}${config.apiBase}` : config.apiBase;
  const here = () => encodeURIComponent(location.pathname + location.search);
  return {
    async load(page) {
      try {
        const response = await fetch(`${api}/api?page=${encodeURIComponent(page)}`, { credentials: 'same-origin' });
        return response.ok ? await response.json() : null; // No API here: stay invisible.
      } catch {
        return null;
      }
    },
    async send(page, change) {
      const response = await fetch(`${api}/api`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page, change }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        return { ok: false, status: response.status, signedOut: Boolean(data.signedOut), error: data.error || `Error ${response.status}` };
      return { ok: true, ...data };
    },
    // Every page with notes, or null when the API cannot list them.
    async list() {
      try {
        const response = await fetch(`${api}/api/all`, { credentials: 'same-origin' });
        return response.ok ? (await response.json()).pages : null;
      } catch {
        return null;
      }
    },
    loginUrl: () => `${api}/login?return=${here()}`,
    logoutUrl: () => `${api}/logout?return=${here()}`,
  };
}

function browserBackend(config, T) {
  const key = (page) => `${config.storageKey}:${page}`;
  const user = { login: 'me', name: T.you };
  const read = (page) => {
    try {
      return parseDocument(localStorage.getItem(key(page)) || '', page);
    } catch {
      return parseDocument('', page);
    }
  };
  return {
    async load(page) {
      return { annotations: read(page).annotations, user, mode: 'browser' };
    },
    async list() {
      const prefix = `${config.storageKey}:`;
      const pages = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const name = localStorage.key(i);
          if (!name?.startsWith(prefix)) continue;
          const page = name.slice(prefix.length);
          const { annotations } = read(page);
          if (annotations.length) pages.push({ page, annotations });
        }
      } catch {
        return null;
      }
      return pages.sort((a, b) => a.page.localeCompare(b.page));
    },
    async send(page, change) {
      try {
        const doc = read(page);
        const { annotation } = applyChange(doc, change, user);
        localStorage.setItem(key(page), JSON.stringify(doc));
        return { ok: true, annotation, annotations: doc.annotations };
      } catch (error) {
        return { ok: false, status: error.status ?? 500, error: error.message };
      }
    },
  };
}
