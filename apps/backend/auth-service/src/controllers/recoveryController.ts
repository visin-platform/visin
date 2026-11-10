import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { BadRequestError } from '@visin/backend-core';
import { User } from '../models/User';
import { hashPassword } from '../services/passwordService';
import { revokeAllCredentials } from '../services/adminCredentials';
export async function recoverAccount(req: Request, res: Response) {
  const { token, password } = req.body ?? {};
  if (
    typeof token !== 'string' ||
    !/^[a-f\d]{64}$/.test(token) ||
    typeof password !== 'string' ||
    password.length < 10 ||
    password.length > 200
  )
    throw new BadRequestError('A valid recovery link and a password of 10–200 characters are required');
  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    {
      recoveryHash: createHash('sha256').update(token).digest('hex'),
      recoveryExpiresAt: { $gt: new Date() },
      status: { $nin: ['suspended', 'deleted'] },
      kind: { $ne: 'assistant' }
    },
    {
      $set: { passwordHash, credentialsRevokedAt: new Date() },
      $unset: { recoveryHash: 1, recoveryExpiresAt: 1 },
      $inc: { tokenVersion: 1, adminRevision: 1 },
      $push: {
        adminHistory: {
          $each: [
            {
              actorId: 'account-recovery',
              at: new Date(),
              reason: 'Account recovery completed',
              changes: { passwordReset: true }
            }
          ],
          $slice: -100
        }
      }
    },
    { returnDocument: 'after' }
  );
  if (!user) throw new BadRequestError('Recovery link is invalid, expired or already used');
  await revokeAllCredentials(user.id);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { reset: true } });
}
