// Node-only pieces: a storage on disk, and a bridge from Node's
// IncomingMessage/ServerResponse to the Web-standard handler (used by the dev
// server, and usable with Express, Fastify or plain node:http).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { filePath, parseDocument, serializeDocument } from '../core.js';

/**
 * Notes as JSON files in a folder. Good for development, or for a Node
 * server whose folder is a Git checkout that something else commits.
 * @param {{ dir: string }} options
 */
export function fsStorage({ dir }) {
  const fileFor = (page) => path.join(dir, filePath(page, ''));

  async function load(page) {
    try {
      return parseDocument(await readFile(fileFor(page), 'utf8'), page);
    } catch (error) {
      if (error.code === 'ENOENT') return parseDocument('', page);
      throw error;
    }
  }

  // One write at a time per file, so two quick saves do not lose each other.
  const queues = new Map();

  return {
    mode: 'local',
    load,
    update(page, mutate) {
      const run = async () => {
        const doc = await load(page);
        const { annotation } = mutate(doc);
        const target = fileFor(page);
        await mkdir(path.dirname(target), { recursive: true });
        const temporary = `${target}.${process.pid}.tmp`;
        await writeFile(temporary, serializeDocument(doc));
        await rename(temporary, target);
        return { annotation, annotations: doc.annotations };
      };
      const next = (queues.get(page) ?? Promise.resolve()).then(run, run);
      queues.set(page, next.catch(() => {}));
      return next;
    },
  };
}

/**
 * Wraps a Web handler as Node middleware: (req, res, next).
 * @param {(request: Request) => Promise<Response | null>} handler
 */
export function toNodeMiddleware(handler) {
  return async (req, res, next) => {
    try {
      const host = req.headers.host ?? 'localhost';
      const url = new URL(req.url, `http://${host}`);
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const request = new Request(url, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([key, value]) =>
          Array.isArray(value) ? value.map((item) => [key, item]) : value == null ? [] : [[key, value]],
        ),
        body: hasBody ? await readBody(req) : undefined,
      });
      const response = await handler(request);
      if (!response) return next?.();
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie?.() ?? [];
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      next ? next(error) : res.end();
    }
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}
