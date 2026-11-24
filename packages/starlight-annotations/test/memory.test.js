// What the browser remembers: last visit per page and the people seen.
import { beforeEach, describe, expect, it } from 'vitest';
import { isNew, knownPeople, markSeen, rememberPeople, seenTimes, stamp } from '../src/client/memory.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  };
});

const note = (login, created, edited) => ({ author: { login, name: login.toUpperCase() }, created, ...(edited ? { edited } : {}) });

describe('memory', () => {
  it('remembers the latest message time per page, never going back', () => {
    markSeen('k', 'p', [note('ada', '2026-11-01T10:00:00Z'), note('bob', '2026-11-02T10:00:00Z', '2026-11-03T10:00:00Z')]);
    expect(seenTimes('k')).toEqual({ p: '2026-11-03T10:00:00Z' });
    markSeen('k', 'p', [note('ada', '2026-10-01T10:00:00Z')]);
    expect(seenTimes('k').p).toBe('2026-11-03T10:00:00Z');
    // Not under "k:", where the browser backend keeps pages.
    expect([...store.keys()].some((key) => key.startsWith('k:'))).toBe(false);
  });

  it("marks others' messages after the last visit as new, edits included", () => {
    const since = '2026-11-02T00:00:00Z';
    expect(isNew(note('bob', '2026-11-03T00:00:00Z'), since, 'ada')).toBe(true);
    expect(isNew(note('bob', '2026-11-01T00:00:00Z'), since, 'ada')).toBe(false);
    expect(isNew(note('bob', '2026-11-01T00:00:00Z', '2026-11-04T00:00:00Z'), since, 'ada')).toBe(true);
    expect(isNew(note('ada', '2026-11-03T00:00:00Z'), since, 'ada')).toBe(false);
    expect(isNew(note('bob', '2026-11-01T00:00:00Z'), null, 'ada')).toBe(true); // page never opened
    expect(stamp(note('x', '2026-11-05T00:00:00Z', '2026-11-04T00:00:00Z'))).toBe('2026-11-05T00:00:00Z');
  });

  it('collects the people who write notes', () => {
    rememberPeople('k', [note('ada', 'x'), note('bob', 'x'), { author: { login: 'ada', name: 'Ada L.' } }]);
    expect(knownPeople('k')).toEqual({ ada: 'Ada L.', bob: 'BOB' });
  });

  it('works without storage', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => markSeen('k', 'p', [note('a', '2026-11-01T00:00:00Z')])).not.toThrow();
    expect(seenTimes('k')).toEqual({});
  });
});
