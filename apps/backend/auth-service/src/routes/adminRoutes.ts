import { createHash, randomBytes } from 'node:crypto';
import { revokeAllCredentials as revokeAll } from '../services/adminCredentials';
import { Router } from 'express';
import mongoose from 'mongoose';
import {
  ApiKey,
  BadRequestError,
  ConflictError,
  createRateLimiter,
  ForbiddenError,
  NotFoundError
} from '@visin/backend-core';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { User } from '../models/User';
import { Session } from '../models/Session';
import { hashPassword } from '../services/passwordService';
import { escapeRegex } from '../utils/escapeRegex';

const fields = '_id email firstName lastName handle kind roles status adminRevision createdAt lastLoginAt';
export function objectId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new BadRequestError('Invalid identifier');
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BadRequestError('Invalid text value');
  return value.trim();
}
async function account(id: unknown) {
  const user = await User.findOne({ _id: objectId(id), kind: { $ne: 'assistant' } }).select(fields);
  if (!user) throw new NotFoundError('User not found');
  return user;
}

// A durable lease serializes account/role edits across replicas on standalone MongoDB, so two
// concurrent edits cannot each see another administrator and both remove theirs. The lease
// expires, so a crashed holder delays edits for at most LOCK_LEASE_MS instead of blocking them
// until someone repairs the database; one edit finishes in well under that.
const LOCK_LEASE_MS = 30_000;
const AdminMutationLock = mongoose.model(
  'AdminMutationLock',
  new mongoose.Schema({ _id: String, held: Boolean, holder: String, actorId: String, acquiredAt: Date, expiresAt: Date })
);
async function lockUsers(actorId: string): Promise<string> {
  const holder = randomBytes(16).toString('hex');
  const now = new Date();
  try {
    await AdminMutationLock.findOneAndUpdate(
      { _id: 'users', $or: [{ held: false }, { expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] },
      { $set: { held: true, holder, actorId, acquiredAt: now, expiresAt: new Date(now.getTime() + LOCK_LEASE_MS) } },
      { upsert: true }
    );
    return holder;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ConflictError('Another account change is in progress');
    throw error;
  }
}
/**
 * Confirms, just before the write, that this edit still holds a live lease (renewing it), so an edit stalled past
 * its lease can never write after another administrator has taken the lock over.
 */
async function confirmLease(holder: string): Promise<void> {
  const now = new Date();
  const renewed = await AdminMutationLock.findOneAndUpdate(
    { _id: 'users', holder, held: true, expiresAt: { $gt: now } },
    { $set: { expiresAt: new Date(now.getTime() + LOCK_LEASE_MS) } }
  );
  if (!renewed) throw new ConflictError('The account change took too long; reload and try again');
}
/** Releases only this holder's lease, never one taken over after it expired. */
async function unlockUsers(holder: string): Promise<void> {
  await AdminMutationLock.updateOne({ _id: 'users', holder }, { $set: { held: false } });
}
const INACTIVE = ['suspended', 'deleted'];

export function createAdminRoutes() {
  const router = Router();
  /**
   * Per administrator, not per address: behind the admin gateway every request arrives from the gateway's address, so
   * a per-address limit would make all administrators share one small bucket. Sized for a person using the pages.
   */
  const adminLimit = createRateLimiter({
    windowMs: 60_000,
    max: 300,
    // After authentication, so there is always an administrator to count against.
    keyGenerator: (req) => `admin:${(req as unknown as { user: { id: string } }).user.id}`
  });
  router.use(authenticateToken, requireRole('admin'), adminLimit);
  router.use((req, _res, next) => {
    if (req.method !== 'GET') {
      const origin = req.get('origin');
      const allowed = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim());
      if (origin && !allowed.includes(origin)) return next(new ForbiddenError('Untrusted administrator origin'));
      if (!req.is('application/json')) return next(new BadRequestError('Use application/json'));
    }
    next();
  });
  router.get('/users', async (req, res) => {
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new BadRequestError('Invalid page');
    const q = req.query.q == null ? '' : text(req.query.q, 120);
    const filter = {
      kind: { $ne: 'assistant' as const },
      ...(q
        ? { $or: ['email', 'firstName', 'lastName', 'handle'].map((k) => ({ [k]: new RegExp(escapeRegex(q), 'i') })) }
        : {})
    };
    const [users, total] = await Promise.all([
      User.find(filter)
        .select(fields)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 30)
        .limit(30)
        .lean(),
      User.countDocuments(filter)
    ]);
    res.json({ success: true, data: { users, total, page, pageSize: 30 } });
  });
  router.post('/users', async (req, res) => {
    const email = text(req.body.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestError('Invalid email');
    // Passwords are kept exactly as typed: trimming would silently change the credential.
    const password = req.body.password;
    if (typeof password !== 'string' || password.length > 200) throw new BadRequestError('Invalid password');
    if (password.length < 10) throw new BadRequestError('Password must contain at least 10 characters');
    const firstName = req.body.firstName ? text(req.body.firstName, 100) : '';
    const lastName = req.body.lastName ? text(req.body.lastName, 100) : '';
    try {
      const user = await User.create({
        email,
        firstName,
        lastName,
        signupMethod: 'password',
        passwordHash: await hashPassword(password),
        roles: [],
        adminHistory: [
          { actorId: req.user!.id, at: new Date(), reason: 'Administrator created account', changes: { created: true } }
        ]
      });
      res.status(201).json({
        success: true,
        data: { _id: user.id, email, firstName, lastName, roles: [], status: 'active', adminRevision: 0 }
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictError('Email already exists');
      throw error;
    }
  });
  // Names for the ids a report shows (a run, an audit entry), in one request. Declared before `/users/:id`, which would
  // otherwise take "lookup" for an id. Only the few fields a label needs; an unknown id is simply absent.
  router.get('/users/lookup', async (req, res) => {
    const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').filter(Boolean) : [];
    if (!ids.length || ids.length > 50) throw new BadRequestError('Give 1 to 50 user IDs');
    const users = await User.find({ _id: { $in: [...new Set(ids.map(objectId))] }, kind: { $ne: 'assistant' } })
      .select('_id email firstName lastName')
      .lean();
    res.json({
      success: true,
      data: users.map((user) => ({
        id: String(user._id),
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ')
      }))
    });
  });
  router.get('/users/:id', async (req, res) => {
    const user = await User.findOne({ _id: objectId(req.params.id), kind: { $ne: 'assistant' } })
      .select(`${fields} +adminHistory`)
      .lean();
    if (!user) throw new NotFoundError('User not found');
    const { adminHistory, ...profile } = user;
    res.json({ success: true, data: { ...profile, history: adminHistory ?? [] } });
  });
  router.put('/users/:id', async (req, res) => {
    const lock = await lockUsers(req.user!.id);
    try {
      if (
        !(await User.exists({
          _id: req.user!.id,
          roles: 'admin',
          status: { $nin: ['suspended', 'deleted'] },
          tokenVersion: req.user!.tokenVersion
        }))
      )
        throw new ForbiddenError('Administrator authority changed; sign in again');
      const user = await account(req.params.id);
      const { revision, reason } = req.body;
      if (!Number.isSafeInteger(revision) || revision < 0) throw new BadRequestError('Revision required');
      const why = text(reason, 300);
      const changes: Record<string, unknown> = {};
      for (const k of Object.keys(req.body))
        if (!['revision', 'reason', 'firstName', 'lastName', 'status', 'admin'].includes(k))
          throw new BadRequestError('Unknown user setting');
      // Only what actually differs is written and recorded, so the history says what changed.
      for (const k of ['firstName', 'lastName'] as const)
        if (k in req.body) {
          if (typeof req.body[k] !== 'string' || req.body[k].length > 100) throw new BadRequestError('Invalid name');
          if (req.body[k].trim() !== (user[k] ?? '')) changes[k] = req.body[k].trim();
        }
      const isAdmin = user.roles.includes('admin');
      if ('admin' in req.body) {
        if (typeof req.body.admin !== 'boolean') throw new BadRequestError('Invalid admin role');
        if (req.body.admin !== isAdmin)
          changes.roles = req.body.admin ? [...user.roles, 'admin'] : user.roles.filter((role) => role !== 'admin');
      }
      const currentStatus = user.status ?? 'active';
      if ('status' in req.body) {
        if (!['active', ...INACTIVE].includes(req.body.status)) throw new BadRequestError('Invalid status');
        if (req.body.status !== currentStatus) {
          changes.status = req.body.status;
          if (INACTIVE.includes(req.body.status)) changes.profilePublic = false;
        }
      }
      if (!Object.keys(changes).length) throw new BadRequestError('Nothing to change');
      // Suspending or deactivating ends every way in; a name or role change leaves the person signed in
      // (roles are read from the account on each request, so a removed role applies at once anyway).
      const deactivating = typeof changes.status === 'string' && INACTIVE.includes(changes.status);
      if (isAdmin && (changes.roles || deactivating)) {
        const remaining = await User.countDocuments({
          _id: { $ne: user._id },
          roles: 'admin',
          status: { $nin: ['suspended', 'deleted'] }
        });
        if (remaining < 1) throw new ConflictError('The last active platform administrator cannot be removed');
      }
      await confirmLease(lock);
      const updated = await User.findOneAndUpdate(
        {
          _id: user.id,
          $or: [{ adminRevision: revision }, ...(revision === 0 ? [{ adminRevision: { $exists: false } }] : [])]
        },
        {
          $set: { ...changes, ...(deactivating ? { credentialsRevokedAt: new Date() } : {}) },
          $inc: { adminRevision: 1, ...(deactivating ? { tokenVersion: 1 } : {}) },
          $push: {
            adminHistory: { $each: [{ actorId: req.user!.id, at: new Date(), reason: why, changes }], $slice: -100 }
          }
        },
        { returnDocument: 'after', runValidators: true }
      ).select(fields);
      if (!updated) throw new ConflictError('Account changed; reload before editing');
      if (deactivating) await revokeAll(user.id);
      res.json({ success: true, data: updated });
    } finally {
      await unlockUsers(lock);
    }
  });
  router.post('/users/:id/password', async (req, res) => {
    const user = await account(req.params.id);
    const reason = text(req.body.reason, 300);
    if (user.status === 'suspended' || user.status === 'deleted')
      throw new ConflictError('Reactivate the account before issuing recovery');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60000);
    await User.updateOne(
      { _id: user.id, status: { $nin: ['suspended', 'deleted'] } },
      {
        $set: { recoveryHash: createHash('sha256').update(token).digest('hex'), recoveryExpiresAt: expiresAt },
        $push: {
          adminHistory: {
            $each: [{ actorId: req.user!.id, at: new Date(), reason, changes: { recoveryIssued: true } }],
            $slice: -100
          }
        }
      }
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { token, expiresAt } });
  });
  router.get('/users/:id/sessions', async (req, res) => {
    const user = await account(req.params.id);
    res.json({
      success: true,
      data: await Session.find({ userId: user.id, expiresAt: { $gt: new Date() } })
        .select('_id method createdAt lastSeenAt expiresAt')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    });
  });
  router.post('/users/:id/revoke-sessions', async (req, res) => {
    const user = await account(req.params.id);
    await User.updateOne(
      { _id: user.id },
      {
        $inc: { tokenVersion: 1 },
        $push: {
          adminHistory: {
            $each: [
              {
                actorId: req.user!.id,
                at: new Date(),
                reason: 'Revoked all credentials',
                changes: { credentialsRevoked: true }
              }
            ],
            $slice: -100
          }
        }
      }
    );
    await revokeAll(user.id);
    res.json({ success: true, data: { revoked: true } });
  });
  router.delete('/users/:id/sessions/:sessionId', async (req, res) => {
    const user = await account(req.params.id);
    await Session.deleteOne({ _id: objectId(req.params.sessionId), userId: user.id });
    res.json({ success: true, data: { revoked: true } });
  });
  router.get('/users/:id/keys', async (req, res) => {
    const user = await account(req.params.id);
    res.json({
      success: true,
      data: await ApiKey.find({ userId: user.id })
        .select('_id name scopes projectId createdAt expiresAt revokedAt lastUsedAt')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    });
  });
  router.delete('/users/:id/keys/:keyId', async (req, res) => {
    const user = await account(req.params.id);
    await ApiKey.updateOne({ _id: objectId(req.params.keyId), userId: user.id }, { $set: { revokedAt: new Date() } });
    res.json({ success: true, data: { revoked: true } });
  });
  router.get('/users/:id/memberships', async (req, res) => {
    const user = await account(req.params.id);
    const groups = await mongoose.connection
      .collection('groups')
      .find(
        { 'members.userId': user.id, deletedAt: null },
        { projection: { name: 1, members: { $elemMatch: { userId: user.id } } } }
      )
      .limit(100)
      .toArray();
    res.json({ success: true, data: groups });
  });
  return router;
}
