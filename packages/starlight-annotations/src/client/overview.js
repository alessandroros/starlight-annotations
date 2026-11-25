// The overview page: every note on the site, grouped by page, with filters.
// Read-only: a note opens on its page, where it can be answered or resolved.
import config from 'virtual:starlight-annotations/config';
import { anchor, buildIndex, skipSelector } from './anchoring.js';
import { createBackend } from './backend.js';
import { strings } from './i18n.js';
import { isNew, rememberPeople, seenTimes } from './memory.js';
import { h, kindLabel, KINDS, quoteText, renderMarkdown, suggestionView, suggests } from './shared.js';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const T = strings(document.documentElement.lang, config.translations);
const container = document.querySelector('.annot-overview');
if (container instanceof HTMLElement) start(container);

// "guides/demo" -> "/base/guides/demo/", "index" -> "/base/", "it/index" -> "/base/it/".
function pageUrl(page) {
  const path = page === 'index' ? '' : page.replace(/\/index$/, '');
  return `${BASE}/${path ? `${path}/` : ''}`;
}

async function start(container) {
  const titles = JSON.parse(container.dataset.titles || '{}');
  const pages = await createBackend(config, BASE, T).list();
  if (!pages) {
    container.replaceChildren(h('p', {}, T.overviewUnavailable));
    return;
  }

  // One entry per thread, with what the filters and the cards need.
  const threads = pages.flatMap(({ page, annotations }) =>
    annotations
      .filter((item) => !item.replyTo)
      .map((thread) => ({
        page,
        title: titles[page] ?? titles[page.replace(/\/index$/, '')] ?? page,
        thread,
        replies: annotations.filter((item) => item.replyTo === thread.id),
      })),
  );
  // People for @mention suggestions, and what is new since each page was
  // last opened in this browser.
  rememberPeople(config.storageKey, pages.flatMap((entry) => entry.annotations));
  const seen = seenTimes(config.storageKey);
  for (const entry of threads) entry.fresh = [entry.thread, ...entry.replies].some((item) => isNew(item, seen[entry.page] ?? null));
  if (threads.length === 0) {
    container.replaceChildren(h('p', {}, T.overviewEmpty));
    return;
  }

  // Filters live in the address, so a filtered view can be shared.
  const params = new URLSearchParams(location.search);
  const state = {
    status: ['open', 'new', 'changed', 'resolved', 'all'].includes(params.get('status')) ? params.get('status') : 'open',
    author: params.get('author') ?? '',
    text: params.get('q') ?? '',
    // A type, "none", or "suggestion" for the suggested edits.
    kind: KINDS.includes(params.get('kind')) || ['none', 'suggestion'].includes(params.get('kind')) ? params.get('kind') : '',
  };

  const changed = new Set(); // ids of open threads whose text is gone
  const counts = {
    open: threads.filter((entry) => !entry.thread.resolved).length,
    new: threads.filter((entry) => entry.fresh).length,
    changed: 0, // known once the pages are checked
    resolved: threads.filter((entry) => entry.thread.resolved).length,
    all: threads.length,
  };
  const labels = { open: T.statusOpen, new: T.fresh, changed: T.textChanged, resolved: T.statusResolved, all: T.statusAll };
  const option = (value) => `${labels[value]} (${counts[value]})`;
  const authors = new Map();
  for (const { thread, replies } of threads)
    for (const item of [thread, ...replies]) authors.set(item.author.login, item.author.name || item.author.login);

  const status = h(
    'select',
    { onchange: (event) => update({ status: event.target.value }) },
    ['open', 'new', 'changed', 'resolved', 'all'].map((value) => h('option', { value, selected: state.status === value }, option(value))),
  );
  const author = h(
    'select',
    { onchange: (event) => update({ author: event.target.value }) },
    h('option', { value: '' }, T.everyone),
    [...authors]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([login, name]) => h('option', { value: login, selected: state.author === login }, name)),
  );
  const kind = h(
    'select',
    { onchange: (event) => update({ kind: event.target.value }) },
    h('option', { value: '' }, T.allKinds),
    [...KINDS, 'none'].map((value) =>
      h(
        'option',
        { value, selected: state.kind === value },
        `${value === 'none' ? T.noKind : kindLabel(value, T)} (${threads.filter((entry) => (entry.thread.kind ?? 'none') === value).length})`,
      ),
    ),
    h(
      'option',
      { value: 'suggestion', selected: state.kind === 'suggestion' },
      `${T.suggestions} (${threads.filter((entry) => suggests(entry.thread)).length})`,
    ),
  );
  const search = h('input', {
    type: 'search',
    value: state.text,
    placeholder: T.filter,
    'aria-label': T.filter,
    oninput: (event) => update({ text: event.target.value }),
  });
  const list = h('div', { class: 'annot-overview-list' });
  container.replaceChildren(
    h(
      'div',
      { class: 'annot-overview-filters not-content' },
      h('label', {}, T.showing, status),
      h('label', {}, T.author, author),
      h('label', {}, T.kind, kind),
      search,
    ),
    list,
  );

  function update(change) {
    Object.assign(state, change);
    const query = new URLSearchParams();
    if (state.status !== 'open') query.set('status', state.status);
    if (state.author) query.set('author', state.author);
    if (state.kind) query.set('kind', state.kind);
    if (state.text) query.set('q', state.text);
    const qs = String(query);
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
    render();
  }

  function matches({ thread, replies, fresh }) {
    if (state.status === 'new' && !fresh) return false;
    if (state.status === 'open' && thread.resolved) return false;
    if (state.status === 'resolved' && !thread.resolved) return false;
    if (state.status === 'changed' && (thread.resolved || !changed.has(thread.id))) return false;
    const messages = [thread, ...replies];
    if (state.kind === 'suggestion' ? !suggests(thread) : state.kind && (thread.kind ?? 'none') !== state.kind) return false;
    if (state.author && !messages.some((item) => item.author.login === state.author)) return false;
    const text = state.text.trim().toLowerCase();
    if (!text) return true;
    const quoted = thread.target?.selector ? quoteText(thread.target.selector) : '';
    return [quoted, thread.suggestion ?? '', ...messages.map((item) => item.body)].some((value) => value.toLowerCase().includes(text));
  }

  function card({ page, thread, replies, fresh }) {
    const when = new Date(thread.created).toLocaleString(document.documentElement.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const last = replies.at(-1);
    return h(
      'article',
      { class: `annot-thread annot-overview-card${thread.resolved ? ' resolved' : ''}` },
      thread.target?.selector
        ? h('blockquote', { class: 'annot-quote' }, quoteText(thread.target.selector))
        : h('div', { class: 'annot-quote annot-whole-page' }, T.wholePage),
      thread.kind ? h('span', { class: `annot-kind annot-kind-${thread.kind}` }, kindLabel(thread.kind, T)) : null,
      suggests(thread) ? suggestionView(thread, T) : null,
      h(
        'div',
        { class: 'annot-meta' },
        h('span', { class: 'annot-author', title: thread.author.login }, thread.author.name),
        ' · ',
        when,
        thread.resolved ? h('span', { class: 'annot-badge' }, T.resolved) : null,
        thread.issue
          ? h('a', { class: 'annot-issue', href: thread.issue.url, target: '_blank', rel: 'noopener noreferrer' }, `${T.issue} #${thread.issue.number} ↗`)
          : null,
        fresh ? h('span', { class: 'annot-badge annot-fresh-label' }, T.fresh) : null,
        !thread.resolved && changed.has(thread.id) ? h('span', { class: 'annot-badge annot-changed' }, T.textChanged) : null,
      ),
      thread.body ? renderMarkdown(h('div', { class: 'annot-text annot-md' }), thread.body) : null,
      h(
        'div',
        { class: 'annot-overview-footer' },
        replies.length
          ? h('span', {}, replies.length === 1 ? T.oneReply : T.replies.replace('{n}', String(replies.length)), last ? ` · ${last.author.name}` : '')
          : h('span'),
        h('a', { href: `${pageUrl(page)}#annotation-${encodeURIComponent(thread.id)}` }, `${T.openOnPage} →`),
      ),
    );
  }

  function render() {
    const shown = threads.filter(matches);
    if (shown.length === 0) {
      list.replaceChildren(h('p', { class: 'annot-empty' }, T.noMatches));
      return;
    }
    const byPage = new Map();
    for (const entry of shown) byPage.set(entry.page, [...(byPage.get(entry.page) ?? []), entry]);
    const groups = [...byPage].sort((a, b) => a[1][0].title.localeCompare(b[1][0].title));
    list.replaceChildren(
      ...groups.map(([page, entries]) =>
        h(
          'section',
          { class: 'annot-overview-page' },
          h('h2', {}, h('a', { href: pageUrl(page) }, entries[0].title), h('span', { class: 'annot-count' }, String(entries.length))),
          h(
            'div',
            { class: 'not-content annot-overview-cards' },
            entries.sort((a, b) => b.thread.created.localeCompare(a.thread.created)).map(card),
          ),
        ),
      ),
    );
  }

  render();

  // Open notes whose quoted text is no longer on their page: fetch each page
  // and look for the quotes, as the page itself does.
  const skip = skipSelector(config.exclude);
  const open = [...new Set(threads.filter((entry) => !entry.thread.resolved).map((entry) => entry.page))];
  await mapLimit(open, 4, async (page) => {
    const root = await fetchContent(pageUrl(page));
    if (!root) return; // Not a page we can read: say nothing.
    const index = buildIndex(root, skip);
    for (const entry of threads)
      if (entry.page === page && !entry.thread.resolved && entry.thread.target?.selector && !anchor(index, entry.thread.target.selector)) changed.add(entry.thread.id);
  });
  counts.changed = changed.size;
  status.querySelector('option[value="changed"]').textContent = option('changed');
  render();
}

async function fetchContent(url) {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    return doc.querySelector(config.content);
  } catch {
    return null;
  }
}

async function mapLimit(items, limit, run) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await run(queue.shift());
  }));
}
