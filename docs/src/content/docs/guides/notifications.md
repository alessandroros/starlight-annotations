---
title: Notifications
description: Post new notes, replies and resolved threads to Slack, Microsoft Teams, email or anything else.
---

The plugin sends no notifications by itself: a reply is a commit on the notes branch, and GitHub does not notify anyone about pushes. Give the handler an `onChange` listener and it is called after every saved change.

```js ins={6}
import { createAnnotationsHandler, github, slackWebhook } from 'starlight-annotations/server';

const annotations = createAnnotationsHandler({
  ...github(options),
  onChange: slackWebhook(env.SLACK_WEBHOOK_URL),
});
```

A failing listener is logged and never fails the save. `onChange` also takes a list, to post to several places.

## Do not make the reader wait

On Cloudflare Workers, Vercel and Netlify, pass the platform context to the handler. The note is saved, the response goes back at once, and the notification is sent after it:

```js title="worker.js" "ctx"
export default {
  async fetch(request, env, ctx) {
    const response = await annotations(request, ctx);
    return response ?? env.ASSETS.fetch(request);
  },
};
```

Without it, the handler waits for the listeners before answering. That is right on Node, where the process keeps running anyway.

## Slack

1. At [api.slack.com/apps](https://api.slack.com/apps), **Create New App → From scratch**, in your workspace.
2. **Incoming Webhooks**: turn them on, then **Add New Webhook to Workspace** and pick the channel.
3. Copy the webhook URL and store it as a secret, for example `npx wrangler secret put SLACK_WEBHOOK_URL`.

```js
onChange: slackWebhook(env.SLACK_WEBHOOK_URL),
```

Each change becomes one message: a linked title ("Grace replied on rfc/0002"), the quoted passage and the message.

## Microsoft Teams

1. In the channel, open **Workflows** and create a flow from the template that posts to a channel when a webhook request is received.
2. Pick the team and channel, and copy the URL the flow gives you. Store it as a secret.

```js
onChange: teamsWebhook(env.TEAMS_WEBHOOK_URL),
```

Each change becomes an Adaptive Card with an **Open the note** button.

## Only some changes

Both senders take the actions to post. By default they post everything except `edit` and `anchor`. To hear about new notes and replies but not resolve, reopen and delete:

```js
onChange: slackWebhook(env.SLACK_WEBHOOK_URL, { actions: ['create', 'reply'] }),
```

## Email, or anything else

`onChange` is any function. `describeChange(event)` turns an event into plain text (`title`, `quote`, `body`, and all of them with the link as `text`). For example with [Resend](https://resend.com):

```js
import { describeChange } from 'starlight-annotations/server';

async function email(event) {
  const { title, text } = describeChange(event);
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'docs@example.com', to: ['reviewers@example.com'], subject: title, text }),
  });
}
```

## Email the author of a note

To tell the person who opened a note that someone answered it or resolved it, turn on `emails` in the auth:

```js ins={3}
github({
  ...options,
  emails: true,
});
```

- **At sign-in** the reader is asked for their email address too. With a GitHub **OAuth app** the plugin asks for the `user:email` scope by itself. With a **GitHub App**, give it the account permission *Email addresses: Read-only* (*Permissions & events → Account permissions*). GitLab, Gitea and Forgejo already return it.
- **Every new note and reply** stores its writer's email in the notes file, **encrypted** (AES-GCM, with a key derived from the session secret). The repository and its history only ever see an unreadable `contact` field, and the API never sends it to the browser.
- **When someone else answers or resolves** a note, the event has `threadAuthor: { login, name, email }`, the person who opened it. It is `null` when they act on their own note.

```js
import { describeChange } from 'starlight-annotations/server';

async function emailTheAuthor(event) {
  if (!['reply', 'resolve'].includes(event.action) || !event.threadAuthor?.email) return;
  const { title, text } = describeChange(event);
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'docs@example.com', to: [event.threadAuthor.email], subject: title, text }),
  });
}
```

Good to know:

- **Changing the session secret** makes the stored emails unreadable: those notes simply stop sending emails (`email: null`); new notes work again.
- **Notes written before** `emails` was turned on carry no email.
- **Tell your readers.** Their email is stored, encrypted, so that they can be notified. Say so where they sign in, for example in your docs' privacy note.

## Reaching people

The plugin knows readers by their login and name, not their email. The event lists the people concerned by login, so a map you keep yourself can reach them:

```js
const people = { grace: 'grace@example.com', 'alan-t': 'alan@example.com' };

async function notifyPeople(event) {
  const to = [...event.participants, ...event.mentions].map((login) => people[login.toLowerCase()]).filter(Boolean);
  if (to.length) await sendEmail(to, describeChange(event));
}
```

- `participants`: everyone else who wrote in the thread.
- `mentions`: logins written as `@login` in a new note or reply.

The person who made the change is never in either list.

## The event

| Field | |
|---|---|
| `action` | `create`, `reply`, `resolve`, `reopen`, `edit` (the author changed a message), `anchor` (a thread moved to another passage), `issue` (a thread became a GitHub issue, in `annotation.issue`) or `delete` |
| `page` | The page key, e.g. `rfc/0002-user-data-model` |
| `url` | Opens the note on its page. After a whole thread is deleted, the page alone |
| `user` | `{ login, name }` of who made the change |
| `annotation` | The note created, answered, resolved, reopened, edited, moved or deleted |
| `thread` | The first note of the thread, with the quoted passage in `thread.target` |
| `inReplyTo` | For a reply, the message it answers |
| `threadAuthor` | `{ login, name, email }` of who opened the thread, when it is someone else; `email` needs `emails: true` |
| `participants`, `mentions` | Logins, see above |

`url` is built from the page the reader saved from. To build it yourself, pass ``pageUrl: (page) => `https://docs.example.com/${page}/` `` to the handler.
