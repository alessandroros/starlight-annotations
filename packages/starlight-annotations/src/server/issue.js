// The issue a thread becomes: a title from its first words, the quoted
// passage, a link back to the note, and the whole conversation.
import { quoteOf } from './notify.js';

// GitHub labels for the kinds of note.
const LABELS = { question: 'question', issue: 'problem', proposal: 'proposal', decision: 'decision' };

/**
 * @param {{
 *   page: string,
 *   thread: Record<string, any>,
 *   replies: Record<string, any>[],
 *   url: string,
 *   user: { login: string, name?: string },
 *   profile: (login: string) => string,
 * }} input
 * @returns {{ title: string, body: string, labels: string[] }}
 */
export function issueContent({ page, thread, replies, url, user, profile }) {
  // People are links to their profile, not "@login": opening an issue should
  // not notify everyone in the thread. Mentions they wrote themselves stay.
  const person = (who) => `[${who.name || who.login}](${profile(who.login)})`;
  const quote = quoteOf(thread);
  const message = (item) => `**${person(item.author)}** · ${when(item.created)}${item.edited ? ' (edited)' : ''}${item.body ? `\n\n${item.body}` : ''}`;
  const body = [
    quote ? quote.split('\n').map((line) => `> ${line}`).join('\n') : '**Whole page**',
    ...(typeof thread.suggestion === 'string' ? [suggestedEdit(thread)] : []),
    `[Open the note on ${page}](${url})`,
    ...[thread, ...replies].map(message),
    `<sub>Opened by ${person(user)} from the review notes.</sub>`,
  ].join('\n\n---\n\n');
  return {
    title: titleOf(thread.body) || `${typeof thread.suggestion === 'string' ? 'Suggested edit' : 'Note'} on ${page}`,
    body,
    labels: thread.kind && LABELS[thread.kind] ? [LABELS[thread.kind]] : [],
  };
}

// The whole passage and its replacement, as a diff block.
function suggestedEdit(thread) {
  const lines = (sign, value) => (value ? value.split('\n').map((line) => `${sign} ${line}`) : []);
  const fence = '```';
  return ['**Suggested edit**', '', `${fence}diff`, ...lines('-', thread.target.selector.exact.trim()), ...lines('+', thread.suggestion), fence].join('\n');
}

// The first line of a Markdown message, as plain text, cut at a word.
function titleOf(markdown) {
  const line =
    String(markdown ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .split('\n')
      .map((value) => value.trim())
      .find(Boolean) ?? '';
  const plain = line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[>#\-*+\s]+|^\d+\.\s+/g, '')
    .replace(/[*_~`]/g, '')
    .trim();
  if (plain.length <= 80) return plain;
  const cut = plain.slice(0, 80);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 80).trimEnd()}…`;
}

// "2026-11-24T10:05:00Z" -> "2026-11-24 10:05 UTC"
function when(iso) {
  return `${String(iso).slice(0, 10)} ${String(iso).slice(11, 16)} UTC`;
}
