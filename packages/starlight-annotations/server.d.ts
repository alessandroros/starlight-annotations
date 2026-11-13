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
  /** Whether a signed-in user may still write. Called before every save and on page loads. */
  allowed?(user: User): Promise<boolean>;
  /** The message for a user who may no longer write. */
  noAccess?(login: string): string;
  /** A `Set-Cookie` value that ends the session, sent with a refusal. */
  clearSession?: string;
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
  /** Token with Contents read/write (and Metadata read) on `repo`. Or use `app`. */
  token?: string | (() => Promise<string>);
  /** A GitHub App installed on `repo`, instead of `token`. */
  app?: GitHubAppOptions;
  /** Branch for the notes. Created from the default branch on the first save. Default `"annotations"`. */
  branch?: string;
  /** Folder for the notes in the branch. Default `"annotations"`. */
  dir?: string;
  /** Rewrite the commit message, e.g. to fit your commit convention. */
  commitMessage?: (message: string, page: string) => string;
}

export interface GitHubAppOptions {
  /** The App ID, on the app's General page. */
  appId: string | number;
  /** The app's private key: the `.pem` file, PKCS#1 or PKCS#8. Line breaks may be written as `\n`. */
  privateKey: string;
  /** The installation on `repo`. Looked up when omitted. */
  installationId?: string | number;
}

/** Installation tokens of a GitHub App, limited to `repo` and renewed before they expire. */
export function githubAppToken(options: GitHubAppOptions & { repo: string }): () => Promise<string>;

export interface GitHubAuthOptions {
  /** The OAuth app's client ID, or the GitHub App's. */
  clientId: string;
  clientSecret: string;
  /** A long random string that signs the session cookie. */
  sessionSecret: string;
  /**
   * Who may write. `"collaborators"` (default) accepts people with write, maintain or admin
   * access to `repo`, checked with `token`. `"anyone"` accepts every GitHub user.
   */
  writers?: 'collaborators' | 'anyone' | string[] | ((profile: { login: string; id: number }) => boolean | Promise<boolean>);
  repo?: string;
  token?: string | (() => Promise<string>);
  app?: GitHubAppOptions;
  /**
   * Seconds between checks that a signed-in user may still write, on saves and page loads.
   * `false` checks only at sign-in. Default 60.
   */
  recheck?: number | false;
  /** Set to false only for plain-http local testing. Default true. */
  cookieSecure?: boolean;
}

export type GitHubOptions = GitHubStorageOptions & GitHubAuthOptions;

export function githubStorage(options: GitHubStorageOptions): Storage;
export function githubAuth(options: GitHubAuthOptions): Auth;
export function github(options: GitHubOptions): { storage: Storage; auth: Auth };

interface CommonStorageOptions {
  /** Branch for the notes. Created from the default branch on the first save. Default `"annotations"`. */
  branch?: string;
  /** Folder for the notes in the branch. Default `"annotations"`. */
  dir?: string;
  /** Rewrite the commit message, e.g. to fit your commit convention. */
  commitMessage?: (message: string, page: string) => string;
}

interface CommonAuthOptions {
  /** OAuth application id and secret. */
  clientId: string;
  clientSecret: string;
  /** A long random string that signs the session cookie. */
  sessionSecret: string;
  /**
   * Who may write. `"collaborators"` (default) checks the reader's role on the repository with
   * `token`. `"anyone"` accepts every signed-in user.
   */
  writers?: 'collaborators' | 'anyone' | string[] | ((profile: { login: string; id: number }) => boolean | Promise<boolean>);
  /**
   * Seconds between checks that a signed-in user may still write, on saves and page loads.
   * `false` checks only at sign-in. Default 60.
   */
  recheck?: number | false;
  /** Set to false only for plain-http local testing. Default true. */
  cookieSecure?: boolean;
}

export interface GitLabStorageOptions extends CommonStorageOptions {
  /** Your GitLab, e.g. `"https://gitlab.example.com"`. Default `"https://gitlab.com"`. */
  host?: string;
  /** Project path (`"group/project"`) or numeric id. */
  project: string | number;
  /** Project, group or personal access token with the `api` scope and the Developer role. */
  token: string;
}

/** `"collaborators"` means project members with the Developer role or higher. */
export interface GitLabAuthOptions extends CommonAuthOptions {
  host?: string;
  project?: string | number;
  token?: string;
}

export type GitLabOptions = GitLabStorageOptions & GitLabAuthOptions;

/** Experimental: tested against a simulated GitLab API. */
export function gitlabStorage(options: GitLabStorageOptions): Storage;
export function gitlabAuth(options: GitLabAuthOptions): Auth;
export function gitlab(options: GitLabOptions): { storage: Storage; auth: Auth };

export interface GiteaStorageOptions extends CommonStorageOptions {
  /** Your Gitea or Forgejo server, e.g. `"https://codeberg.org"`. */
  host: string;
  /** `owner/name` of the repository. */
  repo: string;
  /** Access token with `write:repository` on the repository. */
  token: string;
}

/** `"collaborators"` means people with write, admin or owner permission on the repository. */
export interface GiteaAuthOptions extends CommonAuthOptions {
  host: string;
  repo?: string;
  token?: string;
}

export type GiteaOptions = GiteaStorageOptions & GiteaAuthOptions;

/** Experimental: tested against a simulated Gitea API. Works with Forgejo and Codeberg. */
export function giteaStorage(options: GiteaStorageOptions): Storage;
export function giteaAuth(options: GiteaAuthOptions): Auth;
export function gitea(options: GiteaOptions): { storage: Storage; auth: Auth };
/** The same as `gitea`: Forgejo speaks the Gitea API. */
export const forgejo: typeof gitea;

/** A fixed identity: for local development, or a site behind its own login. */
export function staticAuth(user: User): Auth;

export class AnnotationError extends Error {
  status: number;
}
