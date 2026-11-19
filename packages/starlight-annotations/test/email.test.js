// `emails`: the writer's email, sealed into their notes, and given to
// onChange as `threadAuthor.email` when someone else answers or resolves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from '../src/core.js';
import { createAnnotationsHandler, githubAuth } from '../src/server/index.js';
import { client, reply } from './helpers.js';

const people = {
  ada: { login: 'ada', id: 1, name: 'Ada', email: null, emails: [{ email: 'ada@example.com', primary: true, verified: true }] },
  grace: { login: 'grace', id: 2, name: 'Grace', email: 'grace@public.example', emails: null },
};

let current;
let authorizeScopes;
beforeEach(() => {
  current = 'ada';
  authorizeScopes = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/login/oauth/access_token') return reply({ access_token: `token-${current}` });
      const { emails, ...profile } = people[current];
      if (url.pathname === '/user') return reply(profile);
      // Grace's token has no email permission.
      if (url.pathname === '/user/emails') return emails ? reply(emails) : reply({ message: 'Resource not accessible' }, 403);
      if (url.pathname.endsWith('/permission')) return reply({ permission: 'write' });
      throw new Error(`unexpected ${url}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function memoryStorage() {
  const docs = new Map();
  const load = async (page) => structuredClone(docs.get(page) ?? parseDocument('', page));
  return {
    docs,
    load,
    list: async () => [...docs].map(([page, doc]) => ({ page, annotations: structuredClone(doc.annotations) })),
    async update(page, mutate) {
      const doc = await load(page);
      const { annotation } = mutate(doc);
      docs.set(page, doc);
      return { annotation, annotations: doc.annotations };
    },
  };
}

function setup({ emails = true, sessionSecret = 'secret', storage = memoryStorage() } = {}) {
  const events = [];
  const auth = githubAuth({ repo: 'o/r', token: 't', clientId: 'c', clientSecret: 's', sessionSecret, emails, recheck: false });
  const handle = createAnnotationsHandler({ storage, auth, onChange: (event) => events.push(event) });
  // One cookie jar per person.
  const as = async (login) => {
    current = login;
    const request = client(handle);
    const { authorize } = await request.signIn();
    authorizeScopes.push(authorize.searchParams.get('scope'));
    return request;
  };
  return { storage, events, as, handle };
}

const create = { action: 'create', target: { exact: 'a passage' }, body: 'Is this right?' };

describe('emails', () => {
  it('asks for the email scope and seals the address into the note, never in clear', async () => {
    const { storage, as } = setup();
    const ada = await as('ada');
    expect(authorizeScopes).toEqual(['user:email']);

    const saved = await (await ada.post('p', create)).json();
    const stored = storage.docs.get('p').annotations[0].author;
    expect(stored.contact).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(JSON.stringify(storage.docs.get('p'))).not.toContain('ada@example.com');

    // The browser never gets the sealed field.
    expect(saved.annotation.author).toEqual({ login: 'ada', name: 'Ada' });
    expect(saved.annotations[0].author).toEqual({ login: 'ada', name: 'Ada' });
    expect((await (await ada('/_annotations/api?page=p')).json()).annotations[0].author).toEqual({ login: 'ada', name: 'Ada' });
    expect((await (await ada('/_annotations/api/all')).json()).pages[0].annotations[0].author).toEqual({ login: 'ada', name: 'Ada' });
  });

  it("gives onChange the note author's email when someone else answers or resolves", async () => {
    const { events, as } = setup();
    const ada = await as('ada');
    const { annotation: thread } = await (await ada.post('p', create)).json();
    await ada.post('p', { action: 'reply', replyTo: thread.id, body: 'Adding context' });

    const grace = await as('grace');
    await grace.post('p', { action: 'reply', replyTo: thread.id, body: 'Yes' });
    await grace.post('p', { action: 'resolve', id: thread.id, resolved: true });

    expect(events.map((event) => [event.action, event.threadAuthor])).toEqual([
      ['create', null],
      ['reply', null], // Ada answering her own note
      ['reply', { login: 'ada', name: 'Ada', email: 'ada@example.com' }],
      ['resolve', { login: 'ada', name: 'Ada', email: 'ada@example.com' }],
    ]);
    // Events carry no sealed fields either.
    expect(JSON.stringify(events)).not.toContain('"contact"');
  });

  it('falls back to the public email without the email permission', async () => {
    const { storage, events, as } = setup();
    const grace = await as('grace');
    const { annotation } = await (await grace.post('p', create)).json();
    expect(storage.docs.get('p').annotations[0].author.contact).toBeDefined();
    const ada = await as('ada');
    await ada.post('p', { action: 'reply', replyTo: annotation.id, body: 'Answer' });
    expect(events[1].threadAuthor.email).toBe('grace@public.example');
  });

  it('stores nothing and asks for no scope without `emails`', async () => {
    const { storage, events, as } = setup({ emails: false });
    const ada = await as('ada');
    const { annotation } = await (await ada.post('p', create)).json();
    expect(authorizeScopes).toEqual([null]);
    expect(storage.docs.get('p').annotations[0].author).toEqual({ login: 'ada', name: 'Ada' });
    const grace = await as('grace');
    await grace.post('p', { action: 'reply', replyTo: annotation.id, body: 'x' });
    expect(events[1].threadAuthor).toEqual({ login: 'ada', name: 'Ada', email: null });
  });

  it('cannot open an email sealed under another session secret', async () => {
    const storage = memoryStorage();
    const before = setup({ storage, sessionSecret: 'old' });
    const { annotation } = await (await (await before.as('ada')).post('p', create)).json();

    const after = setup({ storage, sessionSecret: 'new' });
    await (await after.as('grace')).post('p', { action: 'reply', replyTo: annotation.id, body: 'x' });
    expect(after.events[0].threadAuthor).toEqual({ login: 'ada', name: 'Ada', email: null });
  });
});
