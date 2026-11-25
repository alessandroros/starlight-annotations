// A thread becomes a GitHub issue: the issue's content, the call to GitHub,
// and the note it leaves behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyChange, emptyDocument } from '../src/core.js';
import { issueContent } from '../src/server/issue.js';
import { createAnnotationsHandler, github } from '../src/server/index.js';
import { client, reply } from './helpers.js';

function fakeGitHub({ labelsRefused = false, issuesOff = false } = {}) {
  const state = { files: new Map(), issues: [], authorizations: [] };
  const fetch = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (url.pathname === '/login/oauth/access_token') return reply({ access_token: 'user-token' });
    if (url.pathname === '/user') return reply({ login: 'grace', id: 2, name: 'Grace Hopper' });
    if (url.pathname.endsWith('/permission')) return reply({ permission: 'write' });
    const issues = url.pathname.match(/^\/repos\/(o\/\w+)\/issues$/)?.[1];
    if (issues && method === 'POST') {
      state.authorizations.push(new Headers(init.headers).get('Authorization'));
      if (issuesOff) return reply({ message: 'Issues are disabled for this repo' }, 410);
      const body = JSON.parse(init.body);
      if (labelsRefused && body.labels) return reply({ message: 'Validation Failed' }, 422);
      state.issues.push({ repo: issues, ...body });
      const number = 11 + state.issues.length;
      return reply({ number, html_url: `https://github.com/${issues}/issues/${number}` }, 201);
    }
    const file = url.pathname.match(/^\/repos\/o\/r\/contents\/(.+)$/)?.[1];
    if (file) {
      const name = decodeURIComponent(file);
      if (method === 'GET') return state.files.has(name) ? reply(state.files.get(name)) : reply({ message: 'Not Found' }, 404);
      const body = JSON.parse(init.body);
      state.files.set(name, { content: body.content, sha: `s${state.files.size}` });
      return reply({}, 201);
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  return { state, fetch };
}

const options = { repo: 'o/r', token: 'server', clientId: 'c', clientSecret: 's', sessionSecret: 'x' };
const ORIGIN = 'https://docs.example';

let gh;
beforeEach(() => {
  gh = fakeGitHub();
  vi.stubGlobal('fetch', gh.fetch);
});
afterEach(() => vi.unstubAllGlobals());

async function signedIn(extra = {}) {
  const request = client(createAnnotationsHandler(github({ ...options, ...extra })));
  await request.signIn();
  return request;
}

async function thread(request, change = {}) {
  const { annotation } = await (
    await request.post('rfc/0002', { action: 'create', target: { exact: 'every reader' }, body: 'Which **Node** version?\nMore detail.', kind: 'question', ...change })
  ).json();
  await request.post('rfc/0002', { action: 'reply', replyTo: annotation.id, body: 'Node 22, cc @ada' });
  return annotation;
}

describe('issues', () => {
  it('opens an issue with the conversation, then resolves the note and links it', async () => {
    const request = await signedIn({ issues: true });
    expect((await (await request('/_annotations/api?page=rfc/0002')).json()).issues).toBe(true);
    const note = await thread(request);

    const response = await request('/_annotations/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Referer: `${ORIGIN}/rfc/0002/` },
      // A client cannot choose the issue: the server opens it.
      body: JSON.stringify({ page: 'rfc/0002', change: { action: 'issue', id: note.id, issue: { number: 999, url: 'https://evil.example' } } }),
    });
    const { annotation } = await response.json();
    expect(annotation).toMatchObject({ issue: { number: 12, url: 'https://github.com/o/r/issues/12' }, resolved: true, resolvedBy: { login: 'grace' } });

    const [issue] = gh.state.issues;
    expect(issue).toMatchObject({ repo: 'o/r', title: 'Which Node version?', labels: ['question'] });
    expect(issue.body).toContain('> every reader');
    expect(issue.body).toContain(`[Open the note on rfc/0002](${ORIGIN}/rfc/0002/#annotation-${note.id})`);
    expect(issue.body).toContain('Which **Node** version?\nMore detail.');
    expect(issue.body).toContain('Node 22, cc @ada');
    // People are profile links, so nobody is notified just for being in the thread.
    expect(issue.body).toContain('**[Grace Hopper](https://github.com/grace)**');
    expect(issue.body).not.toMatch(/@grace/);

    // Only once.
    const again = await request.post('rfc/0002', { action: 'issue', id: note.id });
    expect(again.status).toBe(409);
    expect(gh.state.issues).toHaveLength(1);
  });

  it('is refused when issues are off, and for replies', async () => {
    const off = await signedIn();
    const note = await thread(off);
    expect(await (await off.post('rfc/0002', { action: 'issue', id: note.id })).json()).toEqual({ error: 'Issues are not turned on for these notes.' });

    const on = await signedIn({ issues: true });
    const doc = JSON.parse(Buffer.from([...gh.state.files.values()][0].content, 'base64').toString());
    const reply = doc.annotations.find((item) => item.replyTo);
    expect((await on.post('rfc/0002', { action: 'issue', id: reply.id })).status).toBe(400);
    expect(gh.state.issues).toHaveLength(0);
  });

  it('opens issues in another repository when asked', async () => {
    const request = await signedIn({ issues: { repo: 'o/tracker' } });
    const note = await thread(request, { kind: undefined });
    const { annotation } = await (await request.post('rfc/0002', { action: 'issue', id: note.id })).json();
    expect(gh.state.issues[0]).toMatchObject({ repo: 'o/tracker' });
    expect(gh.state.issues[0].labels).toBeUndefined();
    expect(annotation.issue.url).toBe('https://github.com/o/tracker/issues/12');
  });

  it('drops labels GitHub refuses, and explains a repository without issues', async () => {
    gh = fakeGitHub({ labelsRefused: true });
    vi.stubGlobal('fetch', gh.fetch);
    let request = await signedIn({ issues: true });
    let note = await thread(request);
    expect((await request.post('rfc/0002', { action: 'issue', id: note.id })).status).toBe(200);
    expect(gh.state.issues[0].labels).toBeUndefined();

    gh = fakeGitHub({ issuesOff: true });
    vi.stubGlobal('fetch', gh.fetch);
    request = await signedIn({ issues: true });
    note = await thread(request);
    const refused = await request.post('rfc/0002', { action: 'issue', id: note.id });
    expect(refused.status).toBe(502);
    expect((await refused.json()).error).toMatch(/Could not open an issue on o\/r/);
  });
});

describe('issueContent', () => {
  const profile = (login) => `https://example.test/${login}`;
  it('titles a long note at a word, and a page note says so', () => {
    const doc = emptyDocument('p');
    const { annotation } = applyChange(doc, { action: 'create', target: { type: 'Page' }, body: `> quoted\n${'word '.repeat(30)}` }, { login: 'a' });
    const { title, body, labels } = issueContent({ page: 'p', thread: annotation, replies: [], url: 'u', user: { login: 'a' }, profile });
    expect(title).toBe('quoted');
    expect(body.startsWith('**Whole page**')).toBe(true);
    expect(labels).toEqual([]);
    const long = issueContent({ page: 'p', thread: { ...annotation, body: 'word '.repeat(30) }, replies: [], url: 'u', user: { login: 'a' }, profile });
    expect(long.title.length).toBeLessThanOrEqual(81);
    expect(long.title.endsWith('word…')).toBe(true);
  });
  it('shows a suggested edit as a diff, and titles it when the note is empty', () => {
    const doc = emptyDocument('p');
    const target = { exact: 'the token\nexpires', prefix: '', suffix: '' };
    const { annotation } = applyChange(doc, { action: 'create', target, body: '', suggestion: 'the token lasts' }, { login: 'a' });
    const { title, body } = issueContent({ page: 'p', thread: annotation, replies: [], url: 'u', user: { login: 'a' }, profile });
    expect(title).toBe('Suggested edit on p');
    expect(body).toContain('**Suggested edit**\n\n```diff\n- the token\n- expires\n+ the token lasts\n```');
    expect(body).not.toMatch(/UTC\n\n\n/);
  });
});

describe('the issue change', () => {
  it('records a valid issue only once, on a thread', () => {
    const doc = emptyDocument('p');
    const user = { login: 'a' };
    const { annotation } = applyChange(doc, { action: 'create', target: { exact: 'x' }, body: 'n' }, user);
    expect(() => applyChange(doc, { action: 'issue', id: annotation.id, issue: { number: 0, url: 'https://x' } }, user)).toThrow(/Invalid issue/);
    expect(() => applyChange(doc, { action: 'issue', id: annotation.id, issue: { number: 3, url: 'javascript:alert(1)' } }, user)).toThrow(/Invalid issue/);
    const { message } = applyChange(doc, { action: 'issue', id: annotation.id, issue: { number: 3, url: 'https://github.com/o/r/issues/3' } }, user);
    expect(message).toBe('docs(annotations): open issue #3 for a note on p');
    expect(() => applyChange(doc, { action: 'issue', id: annotation.id, issue: { number: 4, url: 'https://x' } }, user)).toThrow(/already has an issue/);
  });
});
