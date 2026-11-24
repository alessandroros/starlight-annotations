// Finding a stored quote in a page's text. Shared by the page panel and the
// overview, which checks pages it fetched for notes whose text has changed.

// Text the reader does not see as content: diagrams (rendered late), heading
// anchor links ("Section titled …"), buttons, and the selectors you add.
export function skipSelector(exclude = []) {
  return ['pre.mermaid', 'svg', 'script', 'style', 'button', '.sl-anchor-link', '.annot-ui', ...exclude].join(', ');
}

// The text of `root` as one string, with each text node's offset. `skip`
// names the elements whose text the reader does not see as content.
export function buildIndex(root, skip) {
  const nodes = [];
  const byNode = new Map();
  let text = '';
  const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement && !node.parentElement.closest(skip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const entry = { node, start: text.length };
    nodes.push(entry);
    byNode.set(node, entry);
    text += node.data;
  }
  return { text, nodes, byNode };
}

function shared(a, b, fromEnd) {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max && (fromEnd ? a[a.length - 1 - n] === b[b.length - 1 - n] : a[n] === b[n])) n++;
  return n;
}

// Finds a quote in the page, at or after `from`. Among several matches, the
// one whose surrounding text agrees best with the stored context wins; on a
// tie, the first one.
function anchorQuote(index, { exact, prefix = '', suffix = '' }, from = 0) {
  const text = index.text;
  const matches = [];
  for (let at = text.indexOf(exact, from); at !== -1; at = text.indexOf(exact, at + 1)) matches.push([at, at + exact.length]);
  if (matches.length === 0) {
    // Whitespace may differ after an edit or a rebuild.
    const pattern = exact.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (!pattern) return null;
    for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
      if (match.index >= from) matches.push([match.index, match.index + match[0].length]);
    }
  }
  let best = null;
  let bestScore = -1;
  for (const [start, end] of matches) {
    const score =
      shared(text.slice(Math.max(0, start - prefix.length), start), prefix, true) +
      shared(text.slice(end, end + suffix.length), suffix, false);
    if (score > bestScore) [best, bestScore] = [[start, end], score];
  }
  return best;
}

// A long passage is stored as its start and its end: find the start, then
// the end after it.
export function anchor(index, selector) {
  if (selector.type !== 'RangeSelector') return anchorQuote(index, selector);
  const start = anchorQuote(index, selector.startSelector);
  if (!start) return null;
  const end = anchorQuote(index, selector.endSelector, start[1]);
  return end ? [start[0], end[1]] : null;
}
