import { User } from '../models/User';
import { ApiKey, revokeRefreshTokensForUser } from '@visin/backend-core';
import { Session } from '../models/Session';

/**
 * Ends every way into an account: sessions, API keys, OAuth refresh tokens and a pending recovery link, and stamps
 * the time so access tokens and keys issued before it are refused too. The four are independent, so they run at once.
 */
export async function revokeAllCredentials(id: string) {
  await Promise.all([
    User.updateOne(
      { _id: id },
      { $set: { credentialsRevokedAt: new Date() }, $unset: { recoveryHash: 1, recoveryExpiresAt: 1 } }
    ),
    Session.deleteMany({ userId: id }),
    ApiKey.updateMany({ userId: id, revokedAt: null }, { $set: { revokedAt: new Date() } }),
    revokeRefreshTokensForUser(id)
  ]);
}
