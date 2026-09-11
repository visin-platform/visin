import mongoose, { Document, Schema } from 'mongoose';
import type { ApiKeyScope } from '../apiKeys/types';

/**
 * A client registered through RFC 7591 Dynamic Client Registration.
 *
 * Assistants register themselves — nobody is going to pre-provision Claude,
 * ChatGPT and Gemini by hand, and the MCP spec expects a server to accept
 * registrations. Clients are public (no secret): the caller is a browser-driven
 * flow that cannot keep one, which is exactly why PKCE is mandatory here.
 */
export interface IOAuthClient extends Document {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: Date;
  updatedAt: Date;
}

const OAuthClientSchema = new Schema<IOAuthClient>(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    clientName: { type: String, required: true, maxlength: 200 },
    redirectUris: { type: [String], required: true }
  },
  { timestamps: true, collection: 'oauth_clients' }
);

export const OAuthClient = mongoose.models.OAuthClient
  ? (mongoose.models.OAuthClient as mongoose.Model<IOAuthClient>)
  : mongoose.model<IOAuthClient>('OAuthClient', OAuthClientSchema);

/**
 * A one-time authorization code, alive for the seconds between the user
 * approving and the client exchanging it.
 *
 * Everything the token will assert is fixed here, at the moment consent is
 * given: which scopes, which resource. The exchange cannot widen any of it, so
 * a client that asks for more at the token endpoint than the user agreed to
 * gets what the user agreed to.
 */
export interface IAuthorizationCode extends Document {
  code: string;
  clientId: string;
  userId: string;
  userEmail: string;
  userName: string;
  redirectUri: string;
  scopes: ApiKeyScope[];
  /** RFC 8707: the MCP server this will be minted for */
  resource: string;
  /** PKCE, always S256 — OAuth 2.1 does not allow `plain` */
  codeChallenge: string;
  /** set once the code is exchanged, so a replay is detectable rather than silent */
  usedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const AuthorizationCodeSchema = new Schema<IAuthorizationCode>(
  {
    code: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true },
    userId: { type: String, required: true },
    userEmail: { type: String, required: true },
    userName: { type: String, default: '' },
    redirectUri: { type: String, required: true },
    scopes: { type: [String], default: [] },
    resource: { type: String, required: true },
    codeChallenge: { type: String, required: true },
    usedAt: { type: Date },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'oauth_authorization_codes' }
);

// Codes are short-lived and never read after expiry; let Mongo sweep them so a
// replay cannot be attempted against a record nobody is cleaning up.
AuthorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthorizationCode = mongoose.models.AuthorizationCode
  ? (mongoose.models.AuthorizationCode as mongoose.Model<IAuthorizationCode>)
  : mongoose.model<IAuthorizationCode>('AuthorizationCode', AuthorizationCodeSchema);

/** One authoritative connection per user/client; rotation changes only its current digest. */
export interface IOAuthGrant extends Document<string> {
  _id: string;
  clientId: string;
  userId: string;
  generation: string;
  currentTokenHash: string;
  scopes: ApiKeyScope[];
  resource: string;
  grantedAt: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OAuthGrantSchema = new Schema<IOAuthGrant>(
  {
    // Deterministic user/client identity uses MongoDB's built-in unique _id index.
    _id: { type: String, required: true },
    clientId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    generation: { type: String, required: true },
    currentTokenHash: { type: String, required: true },
    scopes: { type: [String], default: [] },
    resource: { type: String, required: true },
    grantedAt: { type: Date, required: true },
    revokedAt: { type: Date },
    lastUsedAt: { type: Date }
  },
  { timestamps: true, collection: 'oauth_grants' }
);

export const OAuthGrant = mongoose.models.OAuthGrant
  ? (mongoose.models.OAuthGrant as mongoose.Model<IOAuthGrant>)
  : mongoose.model<IOAuthGrant>('OAuthGrant', OAuthGrantSchema);

/**
 * Immutable digest history identifies replay's original grant generation.
 * A row can be prepared before issuance commits, so it never grants authority
 * by itself. Only OAuthGrant.currentTokenHash can authorize a refresh.
 */
export interface IRefreshToken extends Document {
  tokenHash: string;
  clientId: string;
  grantId: string;
  generation: string;
  createdAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true },
    grantId: { type: String, required: true },
    generation: { type: String, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'oauth_refresh_tokens' }
);

export const RefreshToken = mongoose.models.RefreshToken
  ? (mongoose.models.RefreshToken as mongoose.Model<IRefreshToken>)
  : mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
