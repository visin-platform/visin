import { ApiKeyScope } from './apiKey';

/**
 * An assistant a user has connected through OAuth.
 *
 * Read from refresh tokens on the server: a refresh token *is* the connection.
 * While one is live the app can keep minting access tokens; once it is revoked
 * the connection is over.
 */
export interface Connection {
  id: string;
  clientId: string;
  clientName: string;
  scopes: ApiKeyScope[];
  /** when the user approved it — not when it last refreshed */
  createdAt: string;
  /**
   * When the app last exchanged its refresh token.
   *
   * Not when a tool last ran: access tokens are validated statelessly, so the
   * server never sees ordinary use. It means "still connected and active",
   * roughly to the hour.
   */
  lastRenewedAt: string | null;
  revokedAt: string | null;
}
