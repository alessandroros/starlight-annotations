import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Storage } from './server';

/** Notes as JSON files under `dir`. */
export function fsStorage(options: { dir: string }): Storage;

/** Wraps a Web handler as Node/Connect/Express middleware. */
export function toNodeMiddleware(
  handler: (request: Request) => Promise<Response | null>,
): (req: IncomingMessage, res: ServerResponse, next?: (error?: unknown) => void) => Promise<void>;
