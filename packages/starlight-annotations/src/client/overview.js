// The overview page: every note on the site, grouped by page, with filters.
// Read-only: a note opens on its page, where it can be answered or resolved.
import config from 'virtual:starlight-annotations/config';
import { createBackend } from './backend.js';
import { strings } from './i18n.js';
import { h, quoteText, renderMarkdown } from './shared.js';

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
  if (threads.length === 0) {
    container.replaceChildren(h('p', {}, T.overviewEmpty));
    return;
  }

  // Filters live in the address, so a filtered view can be shared.
  const params = new URLSearchParams(location.search);
  const state = {
    status: ['open', 'resolved', 'all'].includes(params.get('status')) ? params.get('status') : 'open',
    author: params.get('author') ?? '',
    text: params.get('q') ?? '',
  };

  const counts = {
    open: threads.filter((entry) => !entry.thread.resolved).length,
    resolved: threads.filter((entry) => entry.thread.resolved).length,
    all: threads.length,
  };
  const authors = new Map();
  for (const { thread, replies } of threads)
    for (const item of [thread, ...replies]) authors.set(item.author.login, item.author.name || item.author.login);

  const status = h(
    'select',
    { onchange: (event) => update({ status: event.target.value }) },
    ['open', 'resolved', 'all'].map((value) =>
      h(
        'option',
        { value, selected: state.status === value },
        `${{ open: T.statusOpen, resolved: T.statusResolved, all: T.statusAll }[value]} (${counts[value]})`,
      ),
    ),
  );
  const author = h(
    'select',
    { onchange: (event) => update({ author: event.target.value }) },
    h('option', { value: '' }, T.everyone),
    [...authors]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([login, name]) => h('option', { value: login, selected: state.author === login }, name)),
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
      search,
    ),
    list,
  );

  function update(change) {
    Object.assign(state, change);
    const query = new URLSearchParams();
    if (state.status !== 'open') query.set('status', state.status);
    if (state.author) query.set('author', state.author);
    if (state.text) query.set('q', state.text);
    const qs = String(query);
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
    render();
  }

  function matches({ thread, replies }) {
    if (state.status === 'open' && thread.resolved) return false;
    if (state.status === 'resolved' && !thread.resolved) return false;
    const messages = [thread, ...replies];
    if (state.author && !messages.some((item) => item.author.login === state.author)) return false;
    const text = state.text.trim().toLowerCase();
    if (!text) return true;
    return [quoteText(thread.target.selector), ...messages.map((item) => item.body)].some((value) => value.toLowerCase().includes(text));
  }

  function card({ page, thread, replies }) {
    const when = new Date(thread.created).toLocaleString(document.documentElement.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const last = replies.at(-1);
    return h(
      'article',
      { class: `annot-thread annot-overview-card${thread.resolved ? ' resolved' : ''}` },
      h('blockquote', { class: 'annot-quote' }, quoteText(thread.target.selector)),
      h(
        'div',
        { class: 'annot-meta' },
        h('span', { class: 'annot-author', title: thread.author.login }, thread.author.name),
        ' · ',
        when,
        thread.resolved ? h('span', { class: 'annot-badge' }, T.resolved) : null,
      ),
      renderMarkdown(h('div', { class: 'annot-text annot-md' }), thread.body),
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
}
