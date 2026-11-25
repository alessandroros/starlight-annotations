// Pieces shared by the notes panel and the overview page.
//
// Notes are written in Markdown (GitHub flavour) and stored as typed.
// micromark escapes raw HTML and drops javascript: links by default, so a
// note cannot inject markup into the page.

import { diffWords } from '../diff.js';

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

export { KINDS } from '../core.js';

// A thread that suggests an edit carries `suggestion`, the text that should
// replace its quote ("" to delete it).
export const suggests = (thread) => typeof thread?.suggestion === 'string';

// The Clipboard API, or the old copy command where it is refused (a page
// not served over HTTPS, an embedded browser).
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = h('textarea', { readonly: true, style: 'position:fixed;opacity:0' });
    area.value = value;
    document.body.append(area);
    area.select();
    const done = document.execCommand?.('copy') ?? false;
    area.remove();
    return done;
  }
}

// The suggested edit as the reader sees it: the quoted text with the removed
// words struck out and the new ones marked, and a button that copies the new
// text, to paste it into the source by hand.
export function suggestionView(thread, T) {
  const parts = diffWords(thread.target.selector.exact, thread.suggestion);
  const copy = h('button', { type: 'button', class: 'annot-copy' }, T.copySuggestion);
  copy.addEventListener('click', async () => {
    if (await copyText(thread.suggestion)) {
      copy.textContent = T.copied;
      setTimeout(() => (copy.textContent = T.copySuggestion), 1500);
    }
  });
  return h(
    'div',
    { class: 'annot-suggestion' },
    h('div', { class: 'annot-suggestion-head' }, h('strong', {}, thread.suggestion ? T.suggestion : T.removeText), thread.suggestion ? copy : null),
    h(
      'p',
      { class: 'annot-diff' },
      parts.map(({ type, text }) => (type === 'same' ? text : h(type, {}, text))),
    ),
  );
}

// "question" -> T.kindQuestion
export function kindLabel(kind, T) {
  return T[`kind${kind[0].toUpperCase()}${kind.slice(1)}`] ?? kind;
}
