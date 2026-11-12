import type { StarlightPlugin } from '@astrojs/starlight/types';

export type AnnotationStrings = {
  annotate: string;
  notes: string;
  newNote: string;
  placeholder: string;
  replyPlaceholder: string;
  save: string;
  cancel: string;
  reply: string;
  resolve: string;
  reopen: string;
  delete: string;
  confirmDelete: string;
  confirmDeleteReply: string;
  inReplyTo: string;
  replyingTo: string;
  deletedMessage: string;
  close: string;
  showResolved: string;
  empty: string;
  orphans: string;
  login: string;
  logout: string;
  local: string;
  browserOnly: string;
  you: string;
  resolved: string;
  write: string;
  preview: string;
  nothing: string;
  markdown: string;
  formatting: string;
  bold: string;
  italic: string;
  strike: string;
  code: string;
  link: string;
  quote: string;
  bullets: string;
  numbers: string;
  tasks: string;
  codeBlock: string;
};

export interface StarlightAnnotationsOptions {
  /**
   * Where notes are read and written.
   * - `"api"` (default): the annotation handler on the same origin
   *   (see `starlight-annotations/server`). The UI stays hidden when it does not answer.
   * - `"browser"`: localStorage only. No server and no sign-in; notes stay on the device.
   */
  backend?: 'api' | 'browser';
  /** Path of the handler, relative to the site base. Default `"/_annotations"`. */
  apiBase?: string;
  /** The element whose text can be annotated. Default `".sl-markdown-content"`. */
  content?: string;
  /** More selectors whose text is ignored, on top of diagrams, buttons and heading anchors. */
  exclude?: string[];
  /** Selections longer than this (characters) are stored by their start and end. Default 400. */
  longQuote?: number;
  /** Override UI strings per language, e.g. `{ it: { annotate: 'Commenta' } }`. */
  translations?: Record<string, Partial<AnnotationStrings>>;
  /** localStorage key prefix for the `"browser"` backend. Default `"starlight-annotations"`. */
  storageKey?: string;
  /**
   * The API served by `astro dev` for the `"api"` backend: notes on disk, author from
   * `git config user.name`. `false` turns it off (for example to proxy a real API).
   */
  dev?: false | { dir?: string; user?: { login: string; name?: string } };
}

export default function starlightAnnotations(options?: StarlightAnnotationsOptions): StarlightPlugin;
