import { describe, expect, it } from 'vitest';
import { applyChange, checkPage, emptyDocument, filePath } from '../src/core.js';

const ann = { login: 'ann', name: 'Ann' };
const bob = { login: 'bob', name: 'Bob' };
const create = (doc, target = { exact: 'hello', prefix: 'say ', suffix: ' world' }) =>
  applyChange(doc, { action: 'create', target, body: 'note' }, ann).annotation;

describe('pages', () => {
  it('accepts page paths and maps them to files', () => {
    expect(filePath('guides/demo')).toBe('annotations/guides/demo.json');
    expect(filePath('it/index', 'notes/')).toBe('notes/it/index.json');
    expect(filePath('index', '')).toBe('index.json');
  });
  it.each(['../etc/passwd', '/abs', 'a//b', 'trailing/', '', 'a b'])('refuses %j', (page) => {
    expect(() => checkPage(page)).toThrow(/Invalid page/);
  });
});

describe('create', () => {
  it('stores a text quote with trimmed context', () => {
    const doc = emptyDocument('p');
    const note = create(doc, { exact: 'hello', prefix: 'x'.repeat(100), suffix: 'y' });
    expect(note.target.selector).toMatchObject({ type: 'TextQuoteSelector', exact: 'hello', suffix: 'y' });
    expect(note.target.selector.prefix).toHaveLength(64);
    expect(note.author).toEqual({ login: 'ann', name: 'Ann' });
    expect(note.created).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });
  it('stores a long passage as a range of two quotes', () => {
    const doc = emptyDocument('p');
    const note = create(doc, {
      type: 'RangeSelector',
      startSelector: { exact: 'start words', prefix: 'before ' },
      endSelector: { exact: 'end words', suffix: ' after' },
    });
    expect(note.target.selector).toEqual({
      type: 'RangeSelector',
      startSelector: { type: 'TextQuoteSelector', exact: 'start words', prefix: 'before ' },
      endSelector: { type: 'TextQuoteSelector', exact: 'end words', suffix: ' after' },
    });
  });
  it('refuses empty or oversized input', () => {
    const doc = emptyDocument('p');
    expect(() => applyChange(doc, { action: 'create', target: { exact: ' ' }, body: 'n' }, ann)).toThrow(/Empty quote/);
    expect(() => applyChange(doc, { action: 'create', target: { exact: 'q' }, body: 'x'.repeat(5001) }, ann)).toThrow(/too long/);
    expect(() =>
      applyChange(doc, { action: 'create', target: { type: 'RangeSelector', startSelector: { exact: 'a'.repeat(201) }, endSelector: { exact: 'b' } }, body: 'n' }, ann),
    ).toThrow(/too long/);
    expect(() => applyChange(doc, { action: 'nope' }, ann)).toThrow(/Unknown action/);
  });
});

describe('replies', () => {
  it('keeps threads flat and records inReplyTo', () => {
    const doc = emptyDocument('p');
    const thread = create(doc);
    const first = applyChange(doc, { action: 'reply', replyTo: thread.id, body: 'one' }, bob).annotation;
    const second = applyChange(doc, { action: 'reply', replyTo: thread.id, inReplyTo: first.id, body: 'two' }, ann).annotation;
    const third = applyChange(doc, { action: 'reply', replyTo: thread.id, inReplyTo: thread.id, body: 'three' }, ann).annotation;
    expect(first.inReplyTo).toBeUndefined();
    expect(second).toMatchObject({ replyTo: thread.id, inReplyTo: first.id });
    expect(third.inReplyTo).toBeUndefined();
    expect(() => applyChange(doc, { action: 'reply', replyTo: first.id, body: 'x' }, ann)).toThrow(/first note/);
  });
  it('refuses inReplyTo from another thread', () => {
    const doc = emptyDocument('p');
    const a = create(doc);
    const b = create(doc);
    const other = applyChange(doc, { action: 'reply', replyTo: b.id, body: 'o' }, ann).annotation;
    expect(() => applyChange(doc, { action: 'reply', replyTo: a.id, inReplyTo: other.id, body: 'x' }, ann)).toThrow(/another thread/);
  });
});

describe('resolve and delete', () => {
  it('resolves and reopens a thread', () => {
    const doc = emptyDocument('p');
    const thread = create(doc);
    applyChange(doc, { action: 'resolve', id: thread.id, resolved: true }, bob);
    expect(thread).toMatchObject({ resolved: true, resolvedBy: { login: 'bob' } });
    applyChange(doc, { action: 'resolve', id: thread.id, resolved: false }, ann);
    expect(JSON.parse(JSON.stringify(thread)).resolvedBy).toBeUndefined();
  });
  it('lets only the author delete, and deletes replies with their thread', () => {
    const doc = emptyDocument('p');
    const thread = create(doc);
    const reply = applyChange(doc, { action: 'reply', replyTo: thread.id, body: 'r' }, bob).annotation;
    applyChange(doc, { action: 'reply', replyTo: thread.id, inReplyTo: reply.id, body: 'r2' }, ann);
    expect(() => applyChange(doc, { action: 'delete', id: thread.id }, bob)).toThrow(/Only the author/);
    applyChange(doc, { action: 'delete', id: reply.id }, bob);
    expect(doc.annotations).toHaveLength(2);
    applyChange(doc, { action: 'delete', id: thread.id }, ann);
    expect(doc.annotations).toHaveLength(0);
  });
});

describe('edit and anchor', () => {
  it('lets only the author edit a message, and marks it edited', () => {
    const doc = emptyDocument('p');
    const thread = create(doc);
    const reply = applyChange(doc, { action: 'reply', replyTo: thread.id, body: 'r' }, bob).annotation;
    expect(() => applyChange(doc, { action: 'edit', id: thread.id, body: 'x' }, bob)).toThrow(/Only the author can edit/);
    expect(() => applyChange(doc, { action: 'edit', id: reply.id, body: '  ' }, bob)).toThrow(/Empty reply/);
    const now = new Date('2026-11-24T10:00:00.123Z');
    const { annotation, message } = applyChange(doc, { action: 'edit', id: reply.id, body: ' better ' }, bob, now);
    expect(annotation).toMatchObject({ body: 'better', edited: '2026-11-24T10:00:00Z', author: { login: 'bob' } });
    expect(message).toBe('docs(annotations): edit note on p');
  });
  it('keeps the sealed email of the writer when they edit', () => {
    const doc = emptyDocument('p');
    const thread = applyChange(doc, { action: 'create', target: { exact: 'x' }, body: 'n' }, { ...ann, contact: 'v1.a.b' }).annotation;
    applyChange(doc, { action: 'edit', id: thread.id, body: 'm' }, { ...ann, contact: 'v1.c.d' });
    expect(thread.author.contact).toBe('v1.a.b');
  });
  it('moves a thread to another passage, by anyone who can write', () => {
    const doc = emptyDocument('p');
    const thread = create(doc);
    const reply = applyChange(doc, { action: 'reply', replyTo: thread.id, body: 'r' }, bob).annotation;
    const { annotation } = applyChange(doc, { action: 'anchor', id: thread.id, target: { exact: 'new words', prefix: 'the ' } }, bob);
    expect(annotation.target.selector).toEqual({ type: 'TextQuoteSelector', exact: 'new words', prefix: 'the ', suffix: '' });
    expect(annotation).toMatchObject({ movedBy: { login: 'bob', name: 'Bob' }, movedAt: expect.any(String), body: 'note' });
    expect(() => applyChange(doc, { action: 'anchor', id: reply.id, target: { exact: 'x' } }, bob)).toThrow(/Only a thread/);
    expect(() => applyChange(doc, { action: 'anchor', id: thread.id, target: { exact: '' } }, bob)).toThrow(/Empty quote/);
  });
});
