// starlight-annotations client. Select text in a page, write a note, and the
// note goes to the configured backend. Highlights use the CSS Custom Highlight
// API, so the page DOM is never rewritten: Mermaid, Expressive Code and other
// plugins keep working on the same nodes.
//
// Notes are written in Markdown (GitHub flavour) and stored as typed.
// micromark escapes raw HTML and drops javascript: links by default, so a
// note cannot inject markup into the page.
import config from 'virtual:starlight-annotations/config';
import { createBackend } from './backend.js';
import { strings } from './i18n.js';
import { h, loadMarkdown, quoteText, renderMarkdown } from './shared.js';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
// Text the reader does not see as content: diagrams (rendered late), heading
// anchor links ("Section titled …"), buttons, and the selectors you add.
const SKIP = ['pre.mermaid', 'svg', 'script', 'style', 'button', '.sl-anchor-link', '.annot-ui', ...config.exclude].join(', ');
const CONTEXT = 32;
const T = strings(document.documentElement.lang, config.translations);
const backend = createBackend(config, BASE, T);

const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? '⌘' : 'Ctrl+';

// Edits go through execCommand when it works, so Cmd+Z still undoes them.
function insert(area, text) {
  area.focus();
  if (!document.execCommand?.('insertText', false, text)) {
    area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function wrap(area, before, after, fallback) {
  const { selectionStart: start, selectionEnd: end, value } = area;
  // Pressing the button again on wrapped text removes the marks.
  if (value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    const inner = value.slice(start, end);
    area.setSelectionRange(start - before.length, end + after.length);
    insert(area, inner);
    area.setSelectionRange(start - before.length, start - before.length + inner.length);
    return;
  }
  const inner = value.slice(start, end) || fallback;
  insert(area, before + inner + after);
  area.setSelectionRange(start + before.length, start + before.length + inner.length);
}

function prefixLines(area, prefixFor) {
  const { selectionStart, selectionEnd, value } = area;
  const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
  let end = value.indexOf('\n', selectionEnd);
  if (end === -1) end = value.length;
  const lines = value.slice(start, end).split('\n');
  const marked = lines.every((line, i) => line.startsWith(prefixFor(i)));
  const out = lines.map((line, i) => (marked ? line.slice(prefixFor(i).length) : prefixFor(i) + line)).join('\n');
  area.setSelectionRange(start, end);
  insert(area, out);
  area.setSelectionRange(start, start + out.length);
}

function link(area) {
  const { selectionStart: start, selectionEnd: end, value } = area;
  const selected = value.slice(start, end);
  if (/^https?:\/\/\S+$/.test(selected)) {
    insert(area, `[${T.link.toLowerCase()}](${selected})`);
    area.setSelectionRange(start + 1, start + 1 + T.link.length);
  } else {
    const label = selected || T.link.toLowerCase();
    insert(area, `[${label}](https://)`);
    area.setSelectionRange(start + label.length + 3, start + label.length + 11);
  }
}

function code(area) {
  const selected = area.value.slice(area.selectionStart, area.selectionEnd);
  if (selected.includes('\n')) wrap(area, '```\n', '\n```', '');
  else wrap(area, '`', '`', T.code.toLowerCase());
}

const svg = (paths) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

// [label, icon, action, shortcut key]
const TOOLS = [
  [T.bold, '<b>B</b>', (area) => wrap(area, '**', '**', T.bold.toLowerCase()), 'b'],
  [T.italic, '<i>I</i>', (area) => wrap(area, '_', '_', T.italic.toLowerCase()), 'i'],
  [T.strike, '<s>S</s>', (area) => wrap(area, '~~', '~~', T.strike.toLowerCase())],
  null,
  [T.code, svg('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'), code, 'e'],
  [T.link, svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'), link, 'k'],
  [T.quote, svg('<path d="M3 21c3 0 7-1 7-8V5H3v7h4c0 3-1 5-4 6"/><path d="M14 21c3 0 7-1 7-8V5h-7v7h4c0 3-1 5-4 6"/>'), (area) => prefixLines(area, () => '> ')],
  null,
  [T.bullets, svg('<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'), (area) => prefixLines(area, () => '- ')],
  [T.numbers, svg('<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'), (area) => prefixLines(area, (i) => `${i + 1}. `)],
  [T.tasks, svg('<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>'), (area) => prefixLines(area, () => '- [ ] ')],
  [T.codeBlock, svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m10 9-3 3 3 3M14 15l3-3-3-3"/>'), (area) => wrap(area, '```\n', '\n```', '')],
];

const root = document.querySelector(config.content);
// The overview page lists notes; it is not annotated itself.
if (root instanceof HTMLElement && !document.querySelector('.annot-overview')) start(root);

function pageKey() {
  let path = decodeURIComponent(location.pathname);
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length);
  path = path.replace(/\/index\.html$|\.html$/, '').replace(/^\/+|\/+$/g, '');
  return path || 'index';
}

// ---- Text index: the page text as one string, mapped back to DOM nodes ----

function buildIndex(root) {
  const nodes = [];
  const byNode = new Map();
  let text = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement && !node.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const entry = { node, start: text.length };
    nodes.push(entry);
    byNode.set(node, entry);
    text += node.data;
  }
  return { text, nodes, byNode };
}

function offsetOf(index, container, offset) {
  const entry = container.nodeType === Node.TEXT_NODE && index.byNode.get(container);
  if (entry) return entry.start + offset;
  const point = document.createRange();
  point.setStart(container, offset);
  for (const item of index.nodes) if (point.comparePoint(item.node, 0) >= 0) return item.start;
  return index.text.length;
}

function pointAt(index, offset, isEnd) {
  let found = index.nodes[0];
  for (const item of index.nodes) {
    if (isEnd ? item.start < offset : item.start <= offset) found = item;
    else break;
  }
  return [found.node, Math.min(offset - found.start, found.node.data.length)];
}

function rangeFor(index, start, end) {
  const range = document.createRange();
  range.setStart(...pointAt(index, start, false));
  range.setEnd(...pointAt(index, end, true));
  return range;
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
function anchor(index, selector) {
  if (selector.type !== 'RangeSelector') return anchorQuote(index, selector);
  const start = anchorQuote(index, selector.startSelector);
  if (!start) return null;
  const end = anchorQuote(index, selector.endSelector, start[1]);
  return end ? [start[0], end[1]] : null;
}

// Selections longer than LONG keep only their first and last EDGE characters.
const LONG = config.longQuote;
const EDGE = 80;

function selectorFor(text, start, end) {
  const exact = text.slice(start, end);
  const prefix = text.slice(Math.max(0, start - CONTEXT), start);
  const suffix = text.slice(end, end + CONTEXT);
  if (exact.length <= LONG) return { type: 'TextQuoteSelector', exact, prefix, suffix };
  return {
    type: 'RangeSelector',
    startSelector: { type: 'TextQuoteSelector', exact: exact.slice(0, EDGE), prefix },
    endSelector: { type: 'TextQuoteSelector', exact: exact.slice(-EDGE), suffix },
  };
}

// ---- The feature ----

async function start(root) {
  const page = pageKey();
  const initial = await backend.load(page);
  if (!initial) return; // No backend here: stay invisible.

  const state = {
    annotations: initial.annotations,
    user: initial.user,
    mode: initial.mode,
    index: null,
    anchors: new Map(), // id -> { start, end, range }
    pending: null, // the selector of the selection being annotated
    showResolved: false,
    active: null,
    error: '',
  };
  const supportsHighlights = 'highlights' in CSS && typeof Highlight === 'function';

  const ui = h('div', { class: 'annot-ui' });
  const selectButton = h(
    'button',
    {
      type: 'button',
      class: 'annot-select-button',
      hidden: true,
      onmousedown: (event) => event.preventDefault(),
      onclick: () => compose(),
    },
    T.annotate,
  );
  const count = h('span', { class: 'annot-count' });
  const toggle = h('button', { type: 'button', class: 'annot-toggle', onclick: () => setOpen(!drawer.classList.contains('open')) }, T.notes, count);
  const body = h('div', { class: 'annot-body' });
  const resolvedBox = h('input', {
    type: 'checkbox',
    onchange: (event) => {
      state.showResolved = event.target.checked;
      paint();
      render();
    },
  });
  const drawer = h(
    'aside',
    { class: 'annot-drawer', 'aria-label': T.notes },
    h(
      'header',
      {},
      h('strong', {}, T.notes),
      h(
        'label',
        { class: 'annot-resolved-toggle' },
        resolvedBox,
        T.showResolved,
      ),
      h('button', { type: 'button', class: 'annot-close', 'aria-label': T.close, onclick: () => setOpen(false) }, '×'),
    ),
    body,
  );
  ui.append(selectButton, toggle, drawer);
  document.body.append(ui);

  function setOpen(open) {
    drawer.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  const threads = () => state.annotations.filter((item) => !item.replyTo);
  const repliesOf = (id) => state.annotations.filter((item) => item.replyTo === id);
  const visible = (thread) => state.showResolved || !thread.resolved;

  function reanchor() {
    state.index = buildIndex(root);
    state.anchors.clear();
    for (const thread of threads()) {
      const found = anchor(state.index, thread.target.selector);
      if (found) state.anchors.set(thread.id, { start: found[0], end: found[1], range: rangeFor(state.index, ...found) });
    }
  }

  function paint() {
    if (!supportsHighlights) return;
    // Resolved notes are highlighted only while "Show resolved" is on,
    // and then like the others. The active note follows the same rule.
    const shown = threads().filter((thread) => visible(thread) && state.anchors.has(thread.id));
    CSS.highlights.set('annot', new Highlight(...shown.map((thread) => state.anchors.get(thread.id).range)));
    const active = shown.find((thread) => thread.id === state.active);
    if (active) CSS.highlights.set('annot-active', new Highlight(state.anchors.get(active.id).range));
    else CSS.highlights.delete('annot-active');
  }

  async function send(change) {
    state.error = '';
    const data = await backend.send(page, change);
    if (!data.ok) {
      state.error = data.error;
      // Not signed in, or the session ended because access was removed.
      if (data.status === 401 || data.signedOut) state.user = null;
      render();
      return null;
    }
    state.annotations = data.annotations;
    reanchor();
    paint();
    render();
    return data.annotation;
  }

  function loginLink() {
    return backend.loginUrl && initial.canSignIn !== false ? h('a', { class: 'annot-login', href: backend.loginUrl() }, T.login) : null;
  }

  function userLine() {
    if (state.mode === 'browser') return h('div', { class: 'annot-user' }, T.browserOnly);
    return h(
      'div',
      { class: 'annot-user' },
      state.user.name,
      state.mode === 'local' || !backend.logoutUrl ? ` (${T.local})` : h('a', { href: backend.logoutUrl() }, T.logout),
    );
  }

  function meta(item) {
    const when = new Date(item.created).toLocaleString(document.documentElement.lang || undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return h('div', { class: 'annot-meta' }, h('span', { class: 'annot-author', title: item.author.login }, item.author.name), ' · ', when);
  }

  function editor(placeholder, onSave, onCancel) {
    const area = h('textarea', { rows: 4, placeholder, maxlength: 5000, 'aria-label': placeholder });
    const preview = h('div', { class: 'annot-preview annot-md', hidden: true });
    const save = h('button', { type: 'button', class: 'annot-primary' }, T.save);
    const tools = h(
      'div',
      { class: 'annot-tools', role: 'toolbar', 'aria-label': T.formatting },
      TOOLS.map((tool) => {
        if (!tool) return h('span', { class: 'annot-tools-gap' });
        const [label, icon, run, key] = tool;
        const title = key ? `${label} (${mod}${key.toUpperCase()})` : label;
        const button = h('button', {
          type: 'button',
          title,
          'aria-label': title,
          // Keep the textarea selection when the button is pressed.
          onmousedown: (event) => event.preventDefault(),
          onclick: () => run(area),
        });
        button.innerHTML = icon;
        return button;
      }),
    );
    const tab = (label, showPreview) =>
      h('button', { type: 'button', class: 'annot-tab', role: 'tab', onclick: () => setPreview(showPreview) }, label);
    const writeTab = tab(T.write, false);
    const previewTab = tab(T.preview, true);
    function setPreview(on) {
      writeTab.setAttribute('aria-selected', String(!on));
      previewTab.setAttribute('aria-selected', String(on));
      area.hidden = on;
      preview.hidden = !on;
      tools.hidden = on;
      if (on) {
        if (area.value.trim()) renderMarkdown(preview, area.value);
        else preview.replaceChildren(h('p', { class: 'annot-empty' }, T.nothing));
      } else area.focus();
    }
    setPreview(false);
    const busy = (on) => {
      save.disabled = on;
      area.disabled = on;
    };
    save.addEventListener('click', async () => {
      if (!area.value.trim()) return area.focus();
      busy(true);
      const ok = await onSave(area.value);
      if (!ok) busy(false);
    });
    area.addEventListener('keydown', (event) => {
      const command = mac ? event.metaKey : event.ctrlKey;
      if (event.key === 'Enter' && command) return save.click();
      if (event.key === 'Escape') return onCancel();
      if (!command || event.altKey || event.shiftKey) return;
      const tool = TOOLS.find((item) => item && item[3] === event.key.toLowerCase());
      if (tool) {
        event.preventDefault();
        tool[2](area);
      }
    });
    queueMicrotask(() => area.focus());
    return h(
      'div',
      { class: 'annot-editor' },
      h('div', { class: 'annot-editor-bar' }, h('div', { class: 'annot-tabs', role: 'tablist' }, writeTab, previewTab), tools),
      area,
      preview,
      h(
        'div',
        { class: 'annot-actions' },
        save,
        h('button', { type: 'button', onclick: onCancel }, T.cancel),
        h('a', { class: 'annot-hint', href: 'https://www.markdownguide.org/basic-syntax/', target: '_blank', rel: 'noopener noreferrer' }, T.markdown),
      ),
    );
  }

  function quote(selector) {
    return h('blockquote', { class: 'annot-quote' }, quoteText(selector));
  }

  // A short plain-text preview of a Markdown message.
  function snippet(body) {
    const plain = body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`>#|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > 80 ? `${plain.slice(0, 80).trimEnd()}…` : plain;
  }

  // Scrolls the panel to a message and lights it up for a moment.
  function flash(id) {
    const target = body.querySelector(`[data-msg="${id}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    target.classList.remove('annot-flash');
    void target.offsetWidth; // restart the animation
    target.classList.add('annot-flash');
  }

  function threadCard(thread, anchored) {
    const card = h('article', {
      class: `annot-thread${thread.resolved ? ' resolved' : ''}${state.active === thread.id ? ' active' : ''}`,
      'data-id': thread.id,
    });
    const replyBox = h('div');
    const byId = new Map(state.annotations.map((item) => [item.id, item]));

    // One editor at a time at the bottom of the thread. Answering a reply
    // (not the first note) records it in `inReplyTo`.
    function openReply(answered) {
      const header = answered ? reference(answered.id, T.replyingTo) : null;
      replyBox.replaceChildren(
        ...(header ? [header] : []),
        editor(
          T.replyPlaceholder,
          (text) => send({ action: 'reply', replyTo: thread.id, inReplyTo: answered?.id, body: text }),
          () => replyBox.replaceChildren(),
        ),
      );
    }

    // "↪ in reply to Mario: «first words…»", a link to that message.
    function reference(id, label) {
      const target = byId.get(id);
      if (!target) return h('div', { class: 'annot-ref deleted' }, `↪ ${T.deletedMessage}`);
      return h(
        'button',
        { type: 'button', class: 'annot-ref', onclick: () => flash(id) },
        `↪ ${label} `,
        h('strong', {}, target.author.name),
        `: «${snippet(target.body)}»`,
      );
    }

    const ownDelete = (item, question) =>
      state.user && item.author.login === state.user.login
        ? h('button', { type: 'button', class: 'annot-danger', onclick: () => confirm(question) && send({ action: 'delete', id: item.id }) }, T.delete)
        : null;

    card.append(
      h(
        'button',
        { type: 'button', class: 'annot-quote-button', disabled: !anchored, onclick: () => focusThread(thread.id, true) },
        quote(thread.target.selector),
      ),
      ...(thread.resolved ? [h('span', { class: 'annot-badge' }, T.resolved)] : []),
      h('div', { class: 'annot-message', 'data-msg': thread.id }, meta(thread), renderMarkdown(h('div', { class: 'annot-text annot-md' }), thread.body)),
      ...repliesOf(thread.id).map((reply) =>
        h(
          'div',
          { class: 'annot-reply annot-message', 'data-msg': reply.id },
          reply.inReplyTo ? reference(reply.inReplyTo, T.inReplyTo) : null,
          meta(reply),
          renderMarkdown(h('div', { class: 'annot-text annot-md' }), reply.body),
          state.user
            ? h(
                'div',
                { class: 'annot-actions annot-reply-actions' },
                h('button', { type: 'button', onclick: () => openReply(reply) }, T.reply),
                ownDelete(reply, T.confirmDeleteReply),
              )
            : null,
        ),
      ),
      replyBox,
    );
    if (state.user) {
      card.append(
        h(
          'div',
          { class: 'annot-actions' },
          h('button', { type: 'button', onclick: () => openReply(null) }, T.reply),
          h('button', { type: 'button', onclick: () => send({ action: 'resolve', id: thread.id, resolved: !thread.resolved }) }, thread.resolved ? T.reopen : T.resolve),
          ownDelete(thread, T.confirmDelete),
        ),
      );
    }
    return card;
  }

  function render() {
    const all = threads();
    count.textContent = String(all.filter((thread) => !thread.resolved).length);
    const parts = [];
    if (state.user) parts.push(userLine());
    else parts.push(loginLink());
    if (state.error) parts.push(h('p', { class: 'annot-error', role: 'alert' }, state.error));
    if (state.pending) {
      parts.push(
        h(
          'section',
          { class: 'annot-new' },
          h('strong', {}, T.newNote),
          quote(state.pending),
          state.user
            ? editor(
                T.placeholder,
                async (text) => {
                  const created = await send({ action: 'create', target: state.pending, body: text });
                  if (!created) return false;
                  state.pending = null;
                  focusThread(created.id, false);
                  return true;
                },
                () => {
                  state.pending = null;
                  render();
                },
              )
            : loginLink(),
        ),
      );
    }
    const anchored = all
      .filter((thread) => visible(thread) && state.anchors.has(thread.id))
      .sort((a, b) => state.anchors.get(a.id).start - state.anchors.get(b.id).start);
    const orphans = all.filter((thread) => visible(thread) && !state.anchors.has(thread.id));
    if (all.length === 0 && !state.pending) parts.push(h('p', { class: 'annot-empty' }, T.empty));
    parts.push(...anchored.map((thread) => threadCard(thread, true)));
    if (orphans.length) parts.push(h('h3', { class: 'annot-orphans' }, T.orphans), ...orphans.map((thread) => threadCard(thread, false)));
    if (config.overview) parts.push(h('p', { class: 'annot-all' }, h('a', { href: `${BASE}/${config.overview}/` }, `${T.allNotes} →`)));
    body.replaceChildren(...parts.filter(Boolean));
  }

  function focusThread(id, scroll) {
    state.active = id;
    paint();
    render();
    setOpen(true);
    body.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    const at = state.anchors.get(id);
    if (scroll && at) {
      const rect = at.range.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 3, behavior: 'smooth' });
    }
  }

  // ---- Selection ----

  function currentSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    state.index = buildIndex(root);
    const text = state.index.text;
    let start = offsetOf(state.index, range.startContainer, range.startOffset);
    let end = offsetOf(state.index, range.endContainer, range.endOffset);
    // Leading and trailing blanks only make the quote harder to find later.
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (start === end) return null;
    return { range, selector: selectorFor(text, start, end) };
  }

  let selected = null;
  function onSelection() {
    selected = currentSelection();
    if (!selected) {
      selectButton.hidden = true;
      return;
    }
    const rect = selected.range.getBoundingClientRect();
    selectButton.hidden = false;
    selectButton.style.top = `${window.scrollY + rect.bottom + 6}px`;
    selectButton.style.left = `${Math.min(window.scrollX + rect.right - selectButton.offsetWidth, window.scrollX + document.documentElement.clientWidth - selectButton.offsetWidth - 8)}px`;
  }

  function compose() {
    if (!selected) return;
    loadMarkdown();
    state.pending = selected.selector;
    selectButton.hidden = true;
    window.getSelection()?.removeAllRanges();
    render();
    setOpen(true);
    drawer.querySelector('.annot-new textarea')?.focus();
  }

  document.addEventListener('mouseup', () => setTimeout(onSelection));
  document.addEventListener('keyup', (event) => {
    if (event.shiftKey || event.key === 'Shift') onSelection();
  });
  document.addEventListener('selectionchange', () => {
    if (window.getSelection()?.isCollapsed) selectButton.hidden = true;
  });

  // A click on highlighted text opens its thread.
  root.addEventListener('click', (event) => {
    if (!window.getSelection()?.isCollapsed) return;
    let node;
    let offset;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
      [node, offset] = pos ? [pos.offsetNode, pos.offset] : [];
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      [node, offset] = range ? [range.startContainer, range.startOffset] : [];
    }
    if (!node) return;
    for (const thread of threads()) {
      const at = state.anchors.get(thread.id);
      if (!at || !visible(thread)) continue;
      // isPointInRange is inclusive at both ends; skip a click just past the end.
      if (at.range.isPointInRange(node, offset) && at.range.comparePoint(node, offset) === 0 && !(node === at.range.endContainer && offset === at.range.endOffset)) {
        focusThread(thread.id, false);
        return;
      }
    }
  });

  // "#annotation-<id>", from the overview page or a shared link: open that
  // note, showing resolved notes if it is one, and scroll to its text.
  function openFromHash() {
    const id = decodeURIComponent(location.hash.match(/^#annotation-(.+)$/)?.[1] ?? '');
    const item = id && state.annotations.find((annotation) => annotation.id === id);
    if (!item) return;
    const thread = (item.replyTo && state.annotations.find((annotation) => annotation.id === item.replyTo)) || item;
    if (thread.resolved && !state.showResolved) {
      state.showResolved = true;
      resolvedBox.checked = true;
    }
    focusThread(thread.id, true);
    if (item !== thread) flash(item.id);
  }
  window.addEventListener('hashchange', openFromHash);

  reanchor();
  paint();
  render();
  openFromHash();
  // Fonts and late layout do not move text nodes, but a late script might.
  window.addEventListener('load', () => {
    reanchor();
    paint();
    render();
  });
}
