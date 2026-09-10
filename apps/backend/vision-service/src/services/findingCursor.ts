import { BadRequestError } from '@visin/backend-core';

/** A position, never an access grant; visibility is reapplied on every page. */
export function parseFindingCursor(cursor: string): { createdAt: Date; id: string } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-f\d]{24}$/.test(cursor)) {
    throw new BadRequestError('Invalid findings cursor');
  }
  const [timestamp, id] = cursor.split('_');
  const createdAt = new Date(timestamp);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== timestamp) {
    throw new BadRequestError('Invalid findings cursor');
  }
  return { createdAt, id };
}
