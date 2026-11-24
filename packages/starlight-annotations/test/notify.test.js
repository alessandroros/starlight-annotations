// onChange: the event after every saved change, and the Slack and Teams senders.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyChange, parseDocument } from '../src/core.js';
import { createAnnotationsHandler, describeChange, slackWebhook, teamsWebhook } from '../src/server/index.js';

const ORIGIN = 'https://docs.example';

function memoryStorage() {
  const docs = new Map();
  const load = async (page) => structuredClone(docs.get(page) ?? parseDocument('', page));
  return {
    load,
    async update(page, mutate) {
      const doc = await load(page);
      const { annotation } = mutate(doc);
      docs.set(page, doc);
      return { annotation, annotations: doc.annotations };
    },
  };
}

// A handler whose signed-in user can be switched between requests.
function setup(options = {}) {
  const who = { current: { login: 'ada', name: 'Ada Lovelace' } };
  const events = [];
  const handle = createAnnotationsHandler({
    storage: memoryStorage(),
    auth: { user: async () => who.current },
    onChange: (event) => events.push(event),
    ...options,
  });
  const send = async (change, { page = 'rfc/0002', referer = `${ORIGIN}/docs/rfc/0002/?x=1#old`, context } = {}) => {
    const response = await handle(
      new Request(`${ORIGIN}/_annotations/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(referer ? { Referer: referer } : {}) },
        body: JSON.stringify({ page, change }),
      }),
      context,
    );
    return response.json();
  };
  return { who, events, send };
}

const target = { exact: 'every reader can sign in' };

afterEach(() => vi.unstubAllGlobals());

describe('onChange', () => {
  it('describes a new note, with a link built from the page the reader was on', async () => {
    const { events, send } = setup();
    const { annotation } = await send({ action: 'create', target, body: 'Is this true? cc @grace and @Alan-T, not me@example.com' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'create',
      page: 'rfc/0002',
      url: `${ORIGIN}/docs/rfc/0002/#annotation-${annotation.id}`,
      user: { login: 'ada', name: 'Ada Lovelace' },
      thread: { id: annotation.id },
      inReplyTo: null,
      participants: [],
      mentions: ['grace', 'Alan-T'],
    });
  });

  it('describes replies, resolve, reopen and delete, with who took part', async () => {
    const { who, events, send } = setup();
    const { annotation: thread } = await send({ action: 'create', target, body: 'Question' });
    who.current = { login: 'grace', name: 'Grace Hopper' };
    const { annotation: reply } = await send({ action: 'reply', replyTo: thread.id, body: 'Answer, @ada' });
    who.current = { login: 'alan', name: 'Alan' };
    await send({ action: 'reply', replyTo: thread.id, inReplyTo: reply.id, body: 'Agreed' });
    await send({ action: 'resolve', id: thread.id, resolved: true });
    await send({ action: 'resolve', id: thread.id, resolved: false });
    who.current = { login: 'grace', name: 'Grace Hopper' };
    await send({ action: 'delete', id: reply.id });

    expect(events.map((event) => event.action)).toEqual(['create', 'reply', 'reply', 'resolve', 'reopen', 'delete']);
    expect(events[1]).toMatchObject({ thread: { id: thread.id }, inReplyTo: { id: thread.id }, participants: ['ada'], mentions: ['ada'] });
    expect(events[2]).toMatchObject({ inReplyTo: { id: reply.id }, participants: ['ada', 'grace'], mentions: [] });
    expect(events[3].mentions).toEqual([]);
    // The deleted reply's link opens its thread, which still exists.
    expect(events[5].url).toBe(`${ORIGIN}/docs/rfc/0002/#annotation-${thread.id}`);
  });

  it('links to the page alone when a whole thread is deleted', async () => {
    const { events, send } = setup();
    const { annotation } = await send({ action: 'create', target, body: 'x' });
    await send({ action: 'delete', id: annotation.id });
    expect(events[1]).toMatchObject({ action: 'delete', thread: { id: annotation.id }, url: `${ORIGIN}/docs/rfc/0002/` });
  });

  it('uses pageUrl, or guesses from the page without a Referer', async () => {
    const guess = setup();
    await guess.send({ action: 'create', target, body: 'x' }, { referer: null, page: 'guides/index' });
    expect(guess.events[0].url).toMatch(`${ORIGIN}/guides/#annotation-`);

    const own = setup({ pageUrl: (page) => `https://site.example/base/${page}/` });
    await own.send({ action: 'create', target, body: 'x' });
    expect(own.events[0].url).toMatch('https://site.example/base/rfc/0002/#annotation-');

    const foreign = setup();
    await foreign.send({ action: 'create', target, body: 'x' }, { referer: 'https://evil.example/rfc/0002/' });
    expect(foreign.events[0].url).toMatch(`${ORIGIN}/rfc/0002/#annotation-`);
  });

  it('never fails the save, and hands the work to waitUntil when there is one', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = setup({ onChange: [() => Promise.reject(new Error('down')), () => {}] });
    expect((await failing.send({ action: 'create', target, body: 'x' })).annotation).toBeDefined();
    expect(quiet).toHaveBeenCalledWith('starlight-annotations: onChange failed', expect.any(Error));
    quiet.mockRestore();

    const waited = [];
    const deferred = setup();
    await deferred.send({ action: 'create', target, body: 'x' }, { context: { waitUntil: (promise) => waited.push(promise) } });
    expect(waited).toHaveLength(1);
    await waited[0];
    expect(deferred.events).toHaveLength(1);
  });

  it('is not called for refused changes', async () => {
    const { who, events, send } = setup();
    const { annotation } = await send({ action: 'create', target, body: 'x' });
    who.current = { login: 'grace', name: 'Grace' };
    expect(await send({ action: 'delete', id: annotation.id })).toEqual({ error: 'Only the author can delete a note.' });
    expect(events).toHaveLength(1);
  });
});

describe('senders', () => {
  const event = () => {
    const doc = parseDocument('', 'rfc/0002');
    const ada = { login: 'ada', name: 'Ada' };
    const { annotation: thread } = applyChange(doc, { action: 'create', target: { exact: 'a <tag> & more' }, body: 'Why?' }, ada);
    const { annotation } = applyChange(doc, { action: 'reply', replyTo: thread.id, body: 'Because *x* < y' }, { login: 'g', name: 'Grace' });
    return {
      action: 'reply',
      page: 'rfc/0002',
      url: `${ORIGIN}/rfc/0002/#annotation-${annotation.id}`,
      user: { login: 'g', name: 'Grace' },
      annotation,
      thread,
      inReplyTo: thread,
      participants: ['ada'],
      mentions: [],
    };
  };

  it('describes a change as plain text', () => {
    const reply = event();
    const { title, text } = describeChange(reply);
    expect(title).toBe('Grace replied on rfc/0002');
    expect(text).toBe(`Grace replied on rfc/0002\n\n> a <tag> & more\n\nBecause *x* < y\n\n${reply.url}`);
    expect(describeChange({ ...reply, action: 'resolve' }).text).toBe(`Grace resolved a note on rfc/0002\n\n> a <tag> & more\n\n${reply.url}`);
    expect(describeChange({ ...reply, action: 'edit' }).text).toBe(`Grace edited a note on rfc/0002\n\n> a <tag> & more\n\nBecause *x* < y\n\n${reply.url}`);
    expect(describeChange({ ...reply, action: 'anchor' }).title).toBe('Grace moved a note on rfc/0002');
    const question = { ...reply, action: 'create', annotation: { ...reply.thread, kind: 'question' }, thread: { ...reply.thread, target: {} } };
    expect(describeChange(question)).toMatchObject({ title: 'Grace added a question on rfc/0002', quote: '' });
  });

  it('posts escaped mrkdwn to Slack, only for the chosen actions', async () => {
    const fetch = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    await slackWebhook('https://hooks.slack.example/x')(event());
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://hooks.slack.example/x');
    const { text } = JSON.parse(init.body);
    expect(text).toContain('*<https://docs.example/rfc/0002/#annotation-');
    expect(text).toContain('|Grace replied on rfc/0002>*');
    expect(text).toContain('> _a &lt;tag&gt; &amp; more_');
    expect(text).toContain('Because *x* &lt; y');

    await slackWebhook('https://hooks.slack.example/x', { actions: ['create'] })(event());
    expect(fetch).toHaveBeenCalledTimes(1);
    // Edits and moves are not posted unless asked for.
    await slackWebhook('https://hooks.slack.example/x')({ ...event(), action: 'edit' });
    await slackWebhook('https://hooks.slack.example/x', { actions: ['edit'] })({ ...event(), action: 'edit' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('posts an Adaptive Card to Teams, and reports a refused webhook', async () => {
    const fetch = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    await teamsWebhook('https://teams.example/hook')(event());
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.type).toBe('message');
    const card = payload.attachments[0];
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.body.map((block) => block.text)).toEqual(['Grace replied on rfc/0002', 'a <tag> & more', 'Because *x* < y']);
    expect(card.content.actions[0]).toMatchObject({ type: 'Action.OpenUrl', url: expect.stringContaining('#annotation-') });

    fetch.mockResolvedValueOnce(new Response('nope', { status: 400 }));
    await expect(teamsWebhook('https://teams.example/hook')(event())).rejects.toThrow('Teams webhook 400: nope');
    expect(() => slackWebhook('')).toThrow('needs a webhook URL');
  });
});
