import { describe, expect, it } from 'vitest';
import { diffWords } from '../src/diff.js';

const show = (parts) => parts.map(({ type, text }) => (type === 'same' ? text : type === 'del' ? `[-${text}-]` : `{+${text}+}`)).join('');

describe('diffWords', () => {
  it('marks a changed word', () => {
    expect(show(diffWords('the token expires after an hour', 'the token lasts an hour'))).toBe('the token [-expires after-]{+lasts+} an hour');
  });
  it('marks added and removed words', () => {
    expect(show(diffWords('a b c', 'a b x c'))).toBe('a b {+x +}c');
    expect(show(diffWords('a b c', 'a c'))).toBe('a [-b -]c');
  });
  it('handles a deletion of everything', () => {
    expect(diffWords('gone text', '')).toEqual([{ type: 'del', text: 'gone text' }]);
  });
  it('ignores differences in spacing', () => {
    expect(diffWords('a\n  b', 'a b')).toEqual([{ type: 'same', text: 'a b' }]);
  });
  it('rebuilds both texts', () => {
    const before = 'One two three four five six';
    const after = 'One 2 three five seven six eight';
    const parts = diffWords(before, after);
    expect(parts.filter((p) => p.type !== 'ins').map((p) => p.text).join('')).toBe(before);
    expect(parts.filter((p) => p.type !== 'del').map((p) => p.text).join('')).toBe(after);
  });
});
