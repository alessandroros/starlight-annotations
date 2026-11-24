// What this browser remembers for the reader, in localStorage: when they last
// looked at each page's notes, and the people they have seen write notes.
// Nothing here reaches the server. Without storage (private mode, blocked
// site data) every function still works, it just remembers nothing.
//
// The keys use "~", not ":", so the browser backend, which stores notes under
// "<storageKey>:<page>", never mistakes them for a page.

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') ?? {};
  } catch {
    return {};
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked: forget quietly.
  }
}

// The time of the latest message the reader saw on each page:
// { "guides/demo": "2026-11-24T10:00:00Z" }. It is a note's own time, not the
// reader's clock, so a wrong clock cannot hide notes.
export function seenTimes(storageKey) {
  return read(`${storageKey}~seen`);
}

export function markSeen(storageKey, page, annotations) {
  const latest = annotations.reduce((max, item) => (stamp(item) > max ? stamp(item) : max), '');
  if (!latest) return;
  const seen = seenTimes(storageKey);
  if ((seen[page] ?? '') >= latest) return;
  seen[page] = latest;
  write(`${storageKey}~seen`, seen);
}

// When a message last changed: its edit, else its creation.
export function stamp(item) {
  return item.edited && item.edited > item.created ? item.edited : item.created;
}

// Whether a message is new to this reader: written or edited by someone else
// after the last time they looked at the page. A page never opened has
// everything new.
export function isNew(item, since, login) {
  if (login && item.author?.login === login) return false;
  return !since || stamp(item) > since;
}

// Everyone seen writing notes, for @mention suggestions: { login: name }.
export function knownPeople(storageKey) {
  return read(`${storageKey}~people`);
}

export function rememberPeople(storageKey, annotations) {
  const people = knownPeople(storageKey);
  let changed = false;
  for (const { author } of annotations) {
    if (!author?.login || people[author.login] === (author.name || author.login)) continue;
    people[author.login] = author.name || author.login;
    changed = true;
  }
  if (changed) write(`${storageKey}~people`, people);
}
