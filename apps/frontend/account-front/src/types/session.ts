/** How the user proved who they were; `unknown` for a session from before sessions were recorded. */
export type SignInMethod = 'password' | 'google' | 'unknown';

/** One browser signed in to the account, as auth-service lists it. */
export interface Session {
  id: string;
  /** A label from the browser's User-Agent, e.g. "Chrome on Android". A hint, not an identity. */
  device: string;
  method: SignInMethod;
  createdAt: string;
  /** Last renewal — to within a few minutes, which is as fine as the server records it. */
  lastSeenAt: string;
  /** When it ends if unused. */
  expiresAt: string;
  /** The browser making this request. */
  current: boolean;
}
