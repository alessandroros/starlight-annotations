// Example notes for the demo page, so a visitor sees the plugin at work before
// trying it. Inlined in <head> as a classic script: it runs before the plugin
// reads localStorage. It only writes when this browser has no notes for the
// page yet, so a visitor's own notes are never overwritten.
(() => {
  if (!/\/guides\/demo\/?$/.test(location.pathname)) return;
  const key = 'starlight-annotations:guides/demo';
  try {
    if (localStorage.getItem(key) !== null) return;
  } catch {
    return;
  }
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ada = { login: 'ada', name: 'Ada (example)' };
  const grace = { login: 'grace', name: 'Grace (example)' };
  const quote = (exact, prefix = '', suffix = '') => ({ selector: { type: 'TextQuoteSelector', exact, prefix, suffix } });
  const doc = {
    version: 1,
    page: 'guides/demo',
    annotations: [
      {
        id: 'demo-1',
        created: ago(180),
        author: ada,
        target: quote('point at the exact sentence that confused them', 'the people who read it can ', '. A comment box'),
        body: 'Could we show an **example** here? A short clip of selecting text would make it obvious.',
        resolved: false,
      },
      { id: 'demo-2', created: ago(150), author: grace, replyTo: 'demo-1', body: 'Good idea. This page now starts with a few example notes, like this one.' },
      { id: 'demo-3', created: ago(120), author: ada, replyTo: 'demo-1', inReplyTo: 'demo-2', body: 'Perfect, thanks! 🙌' },
      {
        id: 'demo-4',
        created: ago(90),
        author: grace,
        target: quote('with everyone who can sign in'),
        body: 'Who is *everyone*? By default, the **collaborators** of the repository. See `writers` in the [server reference](../../reference/server/).',
        resolved: false,
      },
      {
        id: 'demo-5',
        created: ago(60),
        author: ada,
        target: quote('Code blocks and tables can be annotated too'),
        body: 'Typo fixed. ✅',
        resolved: true,
        resolvedBy: grace,
        resolvedAt: ago(30),
      },
    ],
  };
  try {
    localStorage.setItem(key, JSON.stringify(doc));
  } catch {
    // Storage blocked: the demo simply starts empty.
  }
})();
