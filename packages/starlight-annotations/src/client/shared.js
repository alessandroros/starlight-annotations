// Pieces shared by the notes panel and the overview page.
//
// Notes are written in Markdown (GitHub flavour) and stored as typed.
// micromark escapes raw HTML and drops javascript: links by default, so a
// note cannot inject markup into the page.

// ---- Markdown ----

// The Markdown parser is most of the client's weight, so it loads on demand:
// when the page has notes, or when the reader starts to write one. Until it
// arrives a note shows as plain text, then it is filled in.
let markdown = null;
let markdownLoading = null;
const waitingForMarkdown = new Map(); // element -> source

export function loadMarkdown() {
  markdownLoading ??= Promise.all([import('micromark'), import('micromark-extension-gfm')]).then(([{ micromark }, { gfm, gfmHtml }]) => {
    markdown = (source) => micromark(source, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
    for (const [target, source] of waitingForMarkdown) if (target.isConnected) renderMarkdown(target, source);
    waitingForMarkdown.clear();
  }).catch(() => {
    // Offline or blocked: notes stay as plain text, and the next note retries.
    markdownLoading = null;
  });
  return markdownLoading;
}

export function renderMarkdown(target, source) {
  if (!markdown) {
    target.textContent = source;
    target.classList.add('annot-md-pending');
    waitingForMarkdown.set(target, source);
    loadMarkdown();
    return target;
  }
  target.classList.remove('annot-md-pending');
  target.innerHTML = markdown(source);
  for (const link of target.querySelectorAll('a[href]')) {
    // micromark empties unsafe URLs (javascript: and the like): show plain text.
    if (!link.getAttribute('href')) {
      link.replaceWith(...link.childNodes);
      continue;
    }
    link.target = '_blank';
    link.rel = 'noopener noreferrer nofollow';
  }
  return target;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) el.append(child);
  return el;
}

// What the panel shows: a long quote is cut in the middle.
export function quoteText(selector) {
  const squash = (value) => value.replace(/\s+/g, ' ').trim();
  if (selector.type === 'RangeSelector') {
    // The stored edges are cut by length: drop the half words at the cut.
    const head = squash(selector.startSelector.exact).replace(/\s+\S*$/, '');
    const tail = squash(selector.endSelector.exact).replace(/^\S*\s+/, '');
    return `${head} … ${tail}`;
  }
  const exact = squash(selector.exact);
  return exact.length > 220 ? `${exact.slice(0, 130).trimEnd()} … ${exact.slice(-70).trimStart()}` : exact;
}
