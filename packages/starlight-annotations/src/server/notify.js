// Notifications: what the handler tells `onChange` after every saved change,
// and ready-made senders for Slack and Microsoft Teams.
//
//   createAnnotationsHandler({ ...github(options), onChange: slackWebhook(env.SLACK_WEBHOOK_URL) })
//
// The plugin knows readers by their login and name only, not their email, so
// these post to a channel. `event.participants` and `event.mentions` (logins)
// let you reach people too, with your own login -> address map.

const ACTIONS = ['create', 'reply', 'resolve', 'reopen', 'delete'];

// "@ada" and "@ada-l" in a message, not inside an email address or code span.
const MENTION = /(?<![\w`.@/])@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})(?![\w-])/gi;

/**
 * The event passed to `onChange`, built from a saved change.
 * @returns {import('../../server').AnnotationEvent}
 */
export function changeEvent({ change, result, page, user, url }) {
  const { annotation, annotations } = result;
  const action = change.action === 'resolve' ? (annotation.resolved ? 'resolve' : 'reopen') : change.action;
  const byId = new Map(annotations.map((item) => [item.id, item]));
  // A deleted thread is gone from `annotations`: it is its own thread.
  const thread = annotation.replyTo ? (byId.get(annotation.replyTo) ?? null) : annotation;
  const inReplyTo = annotation.inReplyTo ? (byId.get(annotation.inReplyTo) ?? null) : annotation.replyTo ? thread : null;
  const messages = thread ? [thread, ...annotations.filter((item) => item.replyTo === thread.id)] : [annotation];
  const others = (logins) => [...new Set(logins)].filter((login) => login && login.toLowerCase() !== user.login.toLowerCase());
  const written = action === 'create' || action === 'reply';
  return {
    action,
    page,
    url,
    user: { login: user.login, name: user.name || user.login },
    annotation,
    thread,
    inReplyTo,
    threadAuthor: null, // Filled in by the handler: it can open sealed emails.
    participants: others(messages.map((item) => item.author?.login)),
    mentions: written ? others([...annotation.body.matchAll(MENTION)].map((match) => match[1])) : [],
  };
}

/** The quoted passage of a thread, cut in the middle when it is long. */
export function quoteOf(thread) {
  const selector = thread?.target?.selector;
  if (!selector) return '';
  const squash = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  if (selector.type === 'RangeSelector') return `${squash(selector.startSelector.exact)} … ${squash(selector.endSelector.exact)}`;
  const exact = squash(selector.exact);
  return exact.length > 200 ? `${exact.slice(0, 120)} … ${exact.slice(-60)}` : exact;
}

/**
 * Plain text for any channel: a title line, the quote and the message.
 * @param {import('../../server').AnnotationEvent} event
 */
export function describeChange(event) {
  const who = event.user.name;
  const title = {
    create: `${who} added a note on ${event.page}`,
    reply: `${who} replied on ${event.page}`,
    resolve: `${who} resolved a note on ${event.page}`,
    reopen: `${who} reopened a note on ${event.page}`,
    delete: `${who} deleted a note on ${event.page}`,
  }[event.action];
  const quote = quoteOf(event.thread);
  const body = event.action === 'create' || event.action === 'reply' ? cut(event.annotation.body, 600) : '';
  const text = [title, quote && `> ${quote}`, body, event.url].filter(Boolean).join('\n\n');
  return { title, quote, body, text };
}

/**
 * Posts each change to a Slack incoming webhook.
 * @param {string} webhookUrl
 * @param {{ actions?: string[] }} [options] Which actions to post. Default: all.
 */
export function slackWebhook(webhookUrl, { actions = ACTIONS } = {}) {
  if (!webhookUrl) throw new Error('starlight-annotations: slackWebhook needs a webhook URL.');
  return async (event) => {
    if (!actions.includes(event.action)) return;
    const { title, quote, body } = describeChange(event);
    const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = [
      event.url ? `*<${event.url}|${escape(title)}>*` : `*${escape(title)}*`,
      quote && `> _${escape(quote)}_`,
      body && escape(body),
    ];
    await post(webhookUrl, { text: lines.filter(Boolean).join('\n') }, 'Slack');
  };
}

/**
 * Posts each change to a Microsoft Teams channel through a Workflows webhook
 * ("Post to a channel when a webhook request is received").
 * @param {string} webhookUrl
 * @param {{ actions?: string[] }} [options] Which actions to post. Default: all.
 */
export function teamsWebhook(webhookUrl, { actions = ACTIONS } = {}) {
  if (!webhookUrl) throw new Error('starlight-annotations: teamsWebhook needs a webhook URL.');
  return async (event) => {
    if (!actions.includes(event.action)) return;
    const { title, quote, body } = describeChange(event);
    const card = {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: title, weight: 'Bolder', wrap: true },
        quote && { type: 'TextBlock', text: quote, isSubtle: true, wrap: true },
        body && { type: 'TextBlock', text: body, wrap: true },
      ].filter(Boolean),
      actions: event.url ? [{ type: 'Action.OpenUrl', title: 'Open the note', url: event.url }] : [],
    };
    await post(
      webhookUrl,
      { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }] },
      'Teams',
    );
  };
}

async function post(url, payload, label) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`${label} webhook ${response.status}: ${await response.text()}`);
}

function cut(value, max) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
