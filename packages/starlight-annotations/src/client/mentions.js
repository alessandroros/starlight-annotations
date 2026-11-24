// "@" in a note suggests the people who already write notes on these docs.
// Picking one writes "@login ", which the server reads as a mention
// (`event.mentions` for onChange).
import { h } from './shared.js';

const MAX = 6;

/**
 * Adds suggestions to a textarea. Returns the list element to place under it.
 * Its keydown listener must run before the editor's own, so Enter and Escape
 * pick or close a suggestion instead of saving or cancelling.
 * @param {HTMLTextAreaElement} area
 * @param {() => [string, string][]} people [login, name] pairs, the writer left out
 * @param {(area: HTMLTextAreaElement, text: string) => void} insert
 * @param {string} label
 */
export function attachMentions(area, people, insert, label) {
  const list = h('ul', { class: 'annot-mentions', role: 'listbox', 'aria-label': label, hidden: true });
  area.setAttribute('aria-autocomplete', 'list');
  let matches = [];
  let active = 0;
  let from = -1; // where the "@" is

  function query() {
    const before = area.value.slice(0, area.selectionStart);
    const match = area.selectionStart === area.selectionEnd && before.match(/(?:^|[\s(])@([a-z\d-]{0,39})$/i);
    if (!match) return null;
    from = before.length - match[1].length - 1;
    return match[1].toLowerCase();
  }

  function update() {
    const typed = query();
    matches =
      typed === null
        ? []
        : people()
            .filter(([login, name]) => login.toLowerCase().startsWith(typed) || name.toLowerCase().split(/\s+/).some((word) => word.startsWith(typed)))
            .slice(0, MAX);
    active = Math.min(active, Math.max(0, matches.length - 1));
    render();
  }

  function render() {
    list.hidden = matches.length === 0;
    area.setAttribute('aria-expanded', String(!list.hidden));
    list.replaceChildren(
      ...matches.map(([login, name], i) =>
        h(
          'li',
          {
            role: 'option',
            'aria-selected': String(i === active),
            // Keep the focus in the textarea.
            onmousedown: (event) => event.preventDefault(),
            onclick: () => pick(i),
          },
          h('strong', {}, name),
          name !== login ? h('span', {}, ` @${login}`) : null,
        ),
      ),
    );
  }

  function pick(i) {
    const [login] = matches[i];
    area.setSelectionRange(from, area.selectionStart);
    insert(area, `@${login} `);
    close();
  }

  function close() {
    matches = [];
    render();
  }

  area.addEventListener('input', update);
  area.addEventListener('click', update);
  area.addEventListener('blur', close);
  area.addEventListener('keyup', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) update();
  });
  area.addEventListener('keydown', (event) => {
    if (list.hidden) return;
    const keys = {
      ArrowDown: () => (active = (active + 1) % matches.length),
      ArrowUp: () => (active = (active - 1 + matches.length) % matches.length),
      Enter: () => pick(active),
      Tab: () => pick(active),
      Escape: close,
    };
    const run = keys[event.key];
    if (!run || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    run();
    if (!list.hidden) render();
  });
  return list;
}
