export interface User {
  login: string;
  name?: string;
  id?: number;
}

export interface AnnotationDocument {
  version: number;
  page: string;
  annotations: Record<string, unknown>[];
}

export interface Storage {
  mode?: string;
  load(page: string): Promise<AnnotationDocument>;
  update(
    page: string,
    mutate: (doc: AnnotationDocument) => { annotation: Record<string, unknown>; message: string },
    user: User,
  ): Promise<{ annotation: Record<string, unknown>; annotations: Record<string, unknown>[] }>;
}

export interface Auth {
  mode?: string;
  user(request: Request): Promise<User | null>;
  route?(route: string, request: Request, url: URL, prefix: string): Promise<Response | null>;
}

export interface HandlerOptions {
  storage: Storage;
  auth?: Auth;
  /** Path the handler answers on, including the site base. Default `"/_annotations"`. */
  prefix?: string;
}

/** A Web-standard handler. Resolves to `null` when the path is not under `prefix`. */
export function createAnnotationsHandler(options: HandlerOptions): (request: Request) => Promise<Response | null>;

export interface GitHubStorageOptions {
  /** `owner/name` of the repository that stores the notes. */
  repo: string;
  /** Token with Contents read/write (and Metadata read) on `repo`. */
  token: string;
  /** Branch for the notes. Created from the default branch on the first save. Default `"annotations"`. */
  branch?: string;
  /** Folder for the notes in the branch. Default `"annotations"`. */
  dir?: string;
  /** Rewrite the commit message, e.g. to fit your commit convention. */
  commitMessage?: (message: string, page: string) => string;
}

export interface GitHubAuthOptions {
  clientId: string;
  clientSecret: string;
  /** A long random string that signs the session cookie. */
  sessionSecret: string;
  /**
   * Who may write. `"collaborators"` (default) checks the reader's permission on `repo`
   * with `token`. `"anyone"` accepts every GitHub user.
   */
  writers?: 'collaborators' | 'anyone' | string[] | ((profile: { login: string; id: number }) => boolean | Promise<boolean>);
  repo?: string;
  token?: string;
  /** Set to false only for plain-http local testing. Default true. */
  cookieSecure?: boolean;
}

export function githubStorage(options: GitHubStorageOptions): Storage;
export function githubAuth(options: GitHubAuthOptions): Auth;
export function github(options: GitHubStorageOptions & GitHubAuthOptions): { storage: Storage; auth: Auth };

/** A fixed identity: for local development, or a site behind its own login. */
export function staticAuth(user: User): Auth;

export class AnnotationError extends Error {
  status: number;
}
