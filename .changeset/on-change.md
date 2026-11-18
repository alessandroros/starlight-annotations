---
'starlight-annotations': minor
---

Adds notifications: `createAnnotationsHandler({ ..., onChange })` calls a listener (or a list) after every saved change, with the action (`create`, `reply`, `resolve`, `reopen`, `delete`), the page, a link that opens the note, who made the change, the note and its thread, and the logins of the other participants and of `@mentions`. `slackWebhook(url)` and `teamsWebhook(url)` post to a Slack or Microsoft Teams channel, and `describeChange(event)` gives plain text for email or anything else. A failing listener never fails the save; pass the platform context (`handler(request, ctx)`) and it runs after the response with `waitUntil`.
