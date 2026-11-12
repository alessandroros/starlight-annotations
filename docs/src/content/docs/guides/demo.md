---
title: Try it here
description: A page to play with. Notes you write here stay in your browser.
---

This site runs the plugin with the `browser` backend, so you can try everything here. Your notes are saved in this browser only; nobody else sees them.

The page starts with a few **example notes** from Ada and Grace, two made-up readers: the yellow highlights below. Click one to open its thread, or press **Notes** at the bottom right to see them all.

<button type="button" class="demo-reset" onclick="localStorage.removeItem('starlight-annotations:guides/demo'); location.reload()">↺ Reset the demo</button>

Then try it yourself:

1. **Select** a few words in the paragraph below.
2. Press **Annotate**, write a note, and press **Save** (or ⌘/Ctrl + Enter).
3. Click the highlighted text to open the thread. **Reply**, then reply to your reply.
4. **Resolve** the thread: the highlight goes away. Turn on **Show resolved** to see it again, together with the example note that is already resolved.

## Something to annotate

Documentation gets better when the people who read it can point at the exact sentence that confused them. A comment box at the bottom of the page loses that context: by the time someone reads "this is wrong", nobody remembers which line it was about. Annotations keep the note next to the words it talks about.

Select this whole section, several paragraphs at once, to see how a long passage is stored: only its first and last words are kept, so the note survives edits in the middle.

### A table and some code

| Backend | Server | Shared |
|---|---|---|
| `api` | yes | with everyone who can sign in |
| `browser` | no | no |

```js
starlightAnnotations({ backend: 'browser' });
```

Code blocks and tables can be annotated too. Buttons, heading anchors and diagrams are skipped.
