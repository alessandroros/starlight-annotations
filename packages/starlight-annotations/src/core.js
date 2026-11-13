// starlight-annotations: the format and the rules, shared by the browser, the
// dev server and every storage.
//
// One JSON file per page: <dir>/<page>.json (dir defaults to "annotations"). An annotation follows the
// W3C Web Annotation model in a reduced form: the target is a TextQuoteSelector
// (the quoted text plus a little context on both sides), or for a long passage
// a RangeSelector made of a start quote and an end quote. Both survive small
// edits to the page. A reply has `replyTo` and no target.

export const ROUTE_PREFIX = '/_annotations';
export const FORMAT_VERSION = 1;

const MAX_BODY = 5000;
const MAX_EXACT = 2000;
const MAX_EDGE = 200;
const MAX_CONTEXT = 64;

export class AnnotationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// "rfc/0002-user-data-model", "it/rfc/0002-user-data-model" or "index".
export function checkPage(value) {
  const page = String(value ?? '');
  if (!/^[a-z0-9][a-z0-9/_.-]{0,199}$/i.test(page) || page.includes('..') || page.includes('//') || page.endsWith('/')) {
    throw new AnnotationError(400, 'Invalid page.');
  }
  return page;
}

export function filePath(page, dir = 'annotations') {
  const folder = String(dir).replace(/^\/+|\/+$/g, '');
  return folder ? `${folder}/${checkPage(page)}.json` : `${checkPage(page)}.json`;
}

// The page of a stored file, or null for anything else in the folder.
export function pageFromPath(file, dir = 'annotations') {
  const folder = String(dir).replace(/^\/+|\/+$/g, '');
  const prefix = folder ? `${folder}/` : '';
  if (!file.startsWith(prefix) || !file.endsWith('.json')) return null;
  try {
    return checkPage(file.slice(prefix.length, -'.json'.length));
  } catch {
    return null;
  }
}

export function emptyDocument(page) {
  return { version: FORMAT_VERSION, page, annotations: [] };
}

export function parseDocument(text, page) {
  if (!text) return emptyDocument(page);
  const doc = JSON.parse(text);
  if (!Array.isArray(doc.annotations)) throw new AnnotationError(500, 'Corrupt annotation file.');
  return doc;
}

export function serializeDocument(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function text(value, max, field) {
  if (typeof value !== 'string') throw new AnnotationError(400, `Missing ${field}.`);
  const trimmed = value.trim();
  if (!trimmed) throw new AnnotationError(400, `Empty ${field}.`);
  if (trimmed.length > max) throw new AnnotationError(400, `${field} is too long.`);
  return trimmed;
}

function context(value) {
  return typeof value === 'string' ? value.slice(0, MAX_CONTEXT) : '';
}

// A short selection keeps its whole text (TextQuoteSelector). A long one keeps
// only its first and last words (RangeSelector of two quotes): the file stays
// small, and an edit in the middle of the passage does not lose the note.
function selector(target) {
  if (target?.type === 'RangeSelector') {
    return {
      type: 'RangeSelector',
      startSelector: {
        type: 'TextQuoteSelector',
        exact: text(target.startSelector?.exact, MAX_EDGE, 'quote start'),
        prefix: context(target.startSelector?.prefix),
      },
      endSelector: {
        type: 'TextQuoteSelector',
        exact: text(target.endSelector?.exact, MAX_EDGE, 'quote end'),
        suffix: context(target.endSelector?.suffix),
      },
    };
  }
  return {
    type: 'TextQuoteSelector',
    exact: text(target?.exact, MAX_EXACT, 'quote'),
    prefix: context(target?.prefix),
    suffix: context(target?.suffix),
  };
}

// A change is one of:
//   { action: 'create', target: { exact, prefix, suffix }, body }
//   { action: 'reply', replyTo, body }
//   { action: 'resolve', id, resolved }
//   { action: 'delete', id }
// It returns the annotation it touched, and a commit message.
export function applyChange(doc, change, user, now = new Date()) {
  const created = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const author = { login: user.login, name: user.name || user.login };
  const find = (id) => {
    const found = doc.annotations.find((item) => item.id === id);
    if (!found) throw new AnnotationError(404, 'Annotation not found.');
    return found;
  };

  switch (change?.action) {
    case 'create': {
      const annotation = {
        id: crypto.randomUUID(),
        created,
        author,
        target: { selector: selector(change.target) },
        body: text(change.body, MAX_BODY, 'note'),
        resolved: false,
      };
      doc.annotations.push(annotation);
      return { annotation, message: `docs(annotations): note on ${doc.page}` };
    }
    case 'reply': {
      // Threads are flat: `replyTo` is always the first note of the thread.
      // `inReplyTo` optionally names the reply being answered, for the
      // "in reply to" reference in the panel.
      const parent = find(change.replyTo);
      if (parent.replyTo) throw new AnnotationError(400, 'Reply to the first note of the thread.');
      const annotation = { id: crypto.randomUUID(), created, author, replyTo: parent.id, body: text(change.body, MAX_BODY, 'reply') };
      if (change.inReplyTo && change.inReplyTo !== parent.id) {
        const answered = find(change.inReplyTo);
        if (answered.replyTo !== parent.id) throw new AnnotationError(400, 'That reply belongs to another thread.');
        annotation.inReplyTo = answered.id;
      }
      doc.annotations.push(annotation);
      return { annotation, message: `docs(annotations): reply on ${doc.page}` };
    }
    case 'resolve': {
      const annotation = find(change.id);
      if (annotation.replyTo) throw new AnnotationError(400, 'Only a thread can be resolved.');
      annotation.resolved = Boolean(change.resolved);
      annotation.resolvedBy = annotation.resolved ? author : undefined;
      annotation.resolvedAt = annotation.resolved ? created : undefined;
      return { annotation, message: `docs(annotations): ${annotation.resolved ? 'resolve' : 'reopen'} note on ${doc.page}` };
    }
    case 'delete': {
      const annotation = find(change.id);
      if (annotation.author?.login !== user.login) throw new AnnotationError(403, 'Only the author can delete a note.');
      // Deleting the first note of a thread deletes its replies too.
      doc.annotations = doc.annotations.filter((item) => item.id !== annotation.id && item.replyTo !== annotation.id);
      return { annotation, message: `docs(annotations): delete note on ${doc.page}` };
    }
    default:
      throw new AnnotationError(400, 'Unknown action.');
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
