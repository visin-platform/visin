import { Router } from 'express';
import mongoose from 'mongoose';
import {
  authenticateToken,
  BadRequestError,
  ConflictError,
  createRateLimiter,
  ForbiddenError,
  NotFoundError
} from '@visin/backend-core';
import { Group, type GroupRole } from '../models/Group';
import { saveGroup } from '../services/groupSupport';
const valid = (id: unknown): id is string => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
const view = (group: InstanceType<typeof Group>) => ({
  id: group.id,
  name: group.name,
  revision: group.__v ?? 0,
  members: group.members.map((m) => ({ userId: m.userId, role: m.role }))
});
export function createAdminGroupRoutes() {
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
  router.use(authenticateToken, adminLimit);
  router.use(async (req, _res, next) => {
    if (!valid(req.user?.id)) throw new ForbiddenError('Platform administrator required');
    const admin = await mongoose.connection
      .collection('users')
      .findOne(
        { _id: new mongoose.Types.ObjectId(req.user.id), roles: 'admin', status: { $nin: ['suspended', 'deleted'] } },
        { projection: { _id: 1 }, readPreference: 'primary' }
      );
    if (!admin) throw new ForbiddenError('Platform administrator required');
    if (req.method !== 'GET') {
      const origin = req.get('origin');
      if (
        origin &&
        !(process.env.CORS_ORIGIN || '')
          .split(',')
          .map((s) => s.trim())
          .includes(origin)
      )
        throw new ForbiddenError('Untrusted administrator origin');
      if (!req.is('application/json')) throw new BadRequestError('Use application/json');
    }
    next();
  });
  router.get('/groups/:id', async (req, res) => {
    if (!valid(req.params.id)) throw new BadRequestError('Invalid group ID');
    const group = await Group.findOne({ _id: req.params.id, deletedAt: null });
    if (!group) throw new NotFoundError('Group not found');
    res.json({ success: true, data: view(group) });
  });
  router.all('/memberships/:groupId/:userId', async (req, res) => {
    if (!['PUT', 'DELETE'].includes(req.method)) {
      res.status(405).json({ success: false, message: 'Use PUT or DELETE' });
      return;
    }
    if (!valid(req.params.groupId) || !valid(req.params.userId))
      throw new BadRequestError('Invalid membership identifiers');
    const { revision, reason, role } = req.body ?? {};
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      typeof reason !== 'string' ||
      !reason.trim() ||
      reason.length > 300
    )
      throw new BadRequestError('Current group revision and a reason are required');
    const removing = req.method === 'DELETE';
    if (!removing && !['owner', 'admin', 'member'].includes(role)) throw new BadRequestError('Invalid group role');
    const group = await Group.findOne({ _id: req.params.groupId, deletedAt: null });
    if (!group) throw new NotFoundError('Group not found');
    if ((group.__v ?? 0) !== revision) throw new ConflictError('Group changed; reload before editing');
    const previous = group.members.find((m) => m.userId === req.params.userId);
    if (
      previous?.role === 'owner' &&
      (removing || role !== 'owner') &&
      group.members.filter((m) => m.role === 'owner').length < 2
    )
      throw new ConflictError('The last group owner cannot be removed; assign another owner first');
    if (removing) group.members = group.members.filter((m) => m.userId !== req.params.userId);
    else {
      const user = await mongoose.connection
        .collection('users')
        .findOne(
          {
            _id: new mongoose.Types.ObjectId(req.params.userId),
            kind: { $ne: 'assistant' },
            status: { $nin: ['suspended', 'deleted'] }
          },
          { projection: { email: 1 } }
        );
      if (!user) throw new NotFoundError('Active human account not found');
      if (previous) previous.role = role as GroupRole;
      else
        group.members.push({
          userId: req.params.userId,
          email: user.email,
          role: role as GroupRole,
          joinedAt: new Date()
        });
    }
    const events = mongoose.connection.collection('admin_group_events');
    const audit = await events.insertOne({
      actorId: req.user!.id,
      groupId: group.id,
      userId: req.params.userId,
      role: removing ? null : role,
      reason: reason.trim(),
      at: new Date(),
      status: 'pending'
    });
    await saveGroup(group);
    await events.updateOne({ _id: audit.insertedId }, { $set: { status: 'completed' } });
    res.json({ success: true, data: view(group) });
  });
  return router;
}
