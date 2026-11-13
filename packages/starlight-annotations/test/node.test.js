import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAnnotationsHandler, staticAuth } from '../src/server/index.js';
import { fsStorage, toNodeMiddleware } from '../src/server/node.js';

let dir;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'annotations-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('fsStorage', () => {
  it('keeps every one of many concurrent saves', async () => {
    const storage = fsStorage({ dir });
    const user = { login: 'a', name: 'A' };
    const { applyChange } = await import('../src/core.js');
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        storage.update('guides/x', (doc) => applyChange(doc, { action: 'create', target: { exact: `q${i}` }, body: 'n' }, user), user),
      ),
    );
    const saved = JSON.parse(await readFile(path.join(dir, 'guides/x.json'), 'utf8'));
    expect(saved.annotations).toHaveLength(20);
  });
});

describe('the overview route', () => {
  it('lists the pages on disk and skips other files', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const handle = createAnnotationsHandler({ storage: fsStorage({ dir }), auth: staticAuth({ login: 'a', name: 'A' }) });
    expect(await (await handle(new Request('http://x/_annotations/api/all'))).json()).toEqual({ pages: [], mode: 'local' });
    const save = (page) =>
      handle(new Request('http://x/_annotations/api', { method: 'POST', body: JSON.stringify({ page, change: { action: 'create', target: { exact: 'x' }, body: 'n' } }) }));
    await save('guides/x');
    await save('index');
    await mkdir(path.join(dir, 'notes'), { recursive: true });
    await writeFile(path.join(dir, 'README.md'), 'x');
    await writeFile(path.join(dir, 'empty.json'), JSON.stringify({ version: 1, page: 'empty', annotations: [] }));
    const { pages } = await (await handle(new Request('http://x/_annotations/api/all'))).json();
    expect(pages.map((entry) => entry.page)).toEqual(['guides/x', 'index']);
  });

  it('answers 501 for a storage that cannot list', async () => {
    const handle = createAnnotationsHandler({ storage: { load: async () => ({ annotations: [] }), update: async () => ({}) } });
    expect((await handle(new Request('http://x/_annotations/api/all'))).status).toBe(501);
  });
});

describe('toNodeMiddleware', () => {
  it('serves the handler over node:http and passes other paths on', async () => {
    const handler = createAnnotationsHandler({ storage: fsStorage({ dir }), auth: staticAuth({ login: 'dev', name: 'Dev' }) });
    const middleware = toNodeMiddleware(handler);
    const server = createServer((req, res) => middleware(req, res, () => res.end('next')));
    await new Promise((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      expect(await (await fetch(`${base}/other`)).text()).toBe('next');
      const created = await fetch(`${base}/_annotations/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({ page: 'index', change: { action: 'create', target: { exact: 'x' }, body: 'hello' } }),
      });
      expect(created.status).toBe(200);
      const listed = await (await fetch(`${base}/_annotations/api?page=index`)).json();
      expect(listed).toMatchObject({ mode: 'local', user: { login: 'dev' }, annotations: [{ body: 'hello' }] });
    } finally {
      server.close();
    }
  });
});
