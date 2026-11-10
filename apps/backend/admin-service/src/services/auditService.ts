import { Types } from 'mongoose';
import { AdminAudit, type AuditStatus } from '../models/AdminAudit';

export interface AuditPage {
  entries: Array<{
    _id: string;
    actorId: string;
    method: string;
    path: string;
    status: AuditStatus;
    responseStatus?: number;
    createdAt: Date;
  }>;
  /** Pass back as `before` for the next (older) page; absent on the last page. */
  nextBefore?: string;
}

/** Records a write before it is forwarded, so a crash mid-call still leaves a trace. */
export async function beginAudit(actorId: string, method: string, path: string): Promise<string> {
  const entry = await AdminAudit.create({ actorId, method, path, status: 'pending' });
  return entry.id as string;
}

export async function settleAudit(
  id: string,
  status: Exclude<AuditStatus, 'pending'>,
  responseStatus?: number
): Promise<void> {
  await AdminAudit.updateOne(
    { _id: id, status: 'pending' },
    { $set: { status, ...(responseStatus === undefined ? {} : { responseStatus }) } }
  );
}

/** Newest first, paged by id so a page boundary never repeats or skips an entry. */
export async function listAudit({ limit, before }: { limit: number; before?: string }): Promise<AuditPage> {
  const rows = await AdminAudit.find(before ? { _id: { $lt: new Types.ObjectId(before) } } : {})
    .select('actorId method path status responseStatus createdAt')
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const entries = rows.slice(0, limit).map((row) => ({
    _id: String(row._id),
    actorId: row.actorId,
    method: row.method,
    path: row.path,
    status: row.status as AuditStatus,
    ...(row.responseStatus == null ? {} : { responseStatus: row.responseStatus }),
    createdAt: row.createdAt
  }));
  return { entries, ...(rows.length > limit ? { nextBefore: entries[entries.length - 1]._id } : {}) };
}
