// The part every Git host storage shares: read the page file, apply the
// change, write it back; on a concurrent save read again and retry; when the
// notes branch does not exist yet, create it once and retry.

import { AnnotationError, parseDocument, serializeDocument } from '../core.js';

/**
 * @param {{
 *   mode: string,
 *   commitMessage?: (message: string, page: string) => string,
 *   read: (page: string) => Promise<{ text: string, version?: string } | null>,
 *   write: (page: string, text: string, version: string | undefined, message: string, user: object) =>
 *     Promise<'ok' | 'conflict' | 'missing-branch'>,
 *   createBranch: () => Promise<void>,
 *   pages?: () => Promise<string[]>,
 * }} host
 */
export function gitStorage(host) {
  async function read(page) {
    const file = await host.read(page);
    return { doc: parseDocument(file?.text ?? '', page), version: file?.version };
  }

  return {
    mode: host.mode,
    async load(page) {
      return (await read(page)).doc;
    },
    // Every page with a notes file, for the overview. One request to list the
    // files, then one per page, a few at a time.
    ...(host.pages && {
      async list() {
        const pages = await host.pages();
        return mapLimit(pages, 6, async (page) => ({ page, annotations: (await read(page)).doc.annotations }));
      },
    }),
    async update(page, mutate, user) {
      let branchCreated = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const { doc, version } = await read(page);
        const { annotation, message } = mutate(doc);
        const outcome = await host.write(
          page,
          serializeDocument(doc),
          version,
          host.commitMessage ? host.commitMessage(message, page) : message,
          user,
        );
        if (outcome === 'ok') return { annotation, annotations: doc.annotations };
        if (outcome === 'missing-branch') {
          if (branchCreated) throw new Error(`${host.mode}: the notes branch is still missing after creating it.`);
          await host.createBranch();
          branchCreated = true;
        }
        // 'conflict': someone saved a moment ago; read again and apply on top.
      }
      throw new AnnotationError(409, 'Someone else is saving notes on this page. Try again.');
    },
  };
}

async function mapLimit(items, limit, run) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
