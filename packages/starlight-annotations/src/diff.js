// The difference between the quoted text and a suggested edit, word by word,
// for the panel: [{ type: 'same' | 'del' | 'ins', text }]. Spaces belong to
// the words around them, so a changed word shows as one deletion and one
// insertion, not a scatter of letters.

const TOKEN = /\s+|[^\s]+/g;

/**
 * @param {string} before
 * @param {string} after
 * @returns {{ type: 'same' | 'del' | 'ins', text: string }[]}
 */
export function diffWords(before, after) {
  const a = String(before).replace(/\s+/g, ' ').trim().match(TOKEN) ?? [];
  const b = String(after).replace(/\s+/g, ' ').trim().match(TOKEN) ?? [];
  // Longest common subsequence, from the end, so the walk below goes forwards.
  // Quotes are at most a few hundred words: the table stays small.
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const parts = [];
  const add = (type, text) => {
    const last = parts[parts.length - 1];
    if (last?.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      add('same', a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) add('del', a[i++]);
    else add('ins', b[j++]);
  }
  while (i < a.length) add('del', a[i++]);
  while (j < b.length) add('ins', b[j++]);
  return tidy(parts);
}

// A lone space kept between a deletion and an insertion reads as "same":
// fold it into both, so "the [old] [new] token" becomes "the [old ][new ]token".
function tidy(parts) {
  const out = [];
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    const prev = out[out.length - 1];
    const next = parts[k + 1];
    if (part.type === 'same' && part.text === ' ' && prev && next && prev.type !== 'same' && next.type !== 'same') {
      prev.text += ' ';
      continue;
    }
    if (prev && prev.type === part.type) prev.text += part.text;
    else out.push({ ...part });
  }
  // Deletions first, then insertions, inside each changed stretch.
  const sorted = [];
  let run = [];
  const flush = () => {
    const del = run.filter((p) => p.type === 'del').map((p) => p.text).join('');
    const ins = run.filter((p) => p.type === 'ins').map((p) => p.text).join('');
    if (del) sorted.push({ type: 'del', text: del });
    if (ins) sorted.push({ type: 'ins', text: ins });
    run = [];
  };
  for (const part of out) {
    if (part.type === 'same') {
      flush();
      sorted.push(part);
    } else run.push(part);
  }
  flush();
  return sorted;
}
