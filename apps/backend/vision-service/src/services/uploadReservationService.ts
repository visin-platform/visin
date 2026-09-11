import { Types } from 'mongoose';
import { BadRequestError, ForbiddenError, getUploadPolicy } from '@visin/backend-core';
import UploadReservation from '../models/UploadReservation';
import { deleteFile, getFileMetadata } from './fileServiceClient';
import { requireActor } from './writeAccessService';

type UploadKind = 'archive' | 'image' | 'visualization';
type ResourceKind = 'analysis' | 'dataset' | 'image' | 'visualization';

export async function reserveUpload(fileId: string, kind: UploadKind, parentId: string, mimetype: string, userId?: string, allocationId = new Types.ObjectId().toString()) {
  const policy = getUploadPolicy(fileId, mimetype, kind);
  return UploadReservation.create({ fileId, kind, parentId, mimetype, maxBytes: policy.maxBytes,
    ownerId: requireActor(userId), allocationId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
}

export async function claimUpload(fileId: string, kind: UploadKind, parentId: string, resourceKind: ResourceKind,
  userId?: string, resourceId?: string, expectedSize?: number, mimetype?: string) {
  const ownerId = requireActor(userId);
  const reservation = await UploadReservation.findOne({ fileId, kind, parentId, ownerId, retired: false });
  if (!reservation) throw new ForbiddenError('File was not reserved for this upload');
  const target = resourceId || reservation.allocationId;
  if (reservation.resourceId && (reservation.resourceId !== target || reservation.resourceKind !== resourceKind)) {
    throw new ForbiddenError('Upload is already attached to another resource');
  }
  if (!reservation.resourceId && reservation.expiresAt.getTime() <= Date.now()) throw new ForbiddenError('Upload reservation expired');
  if (mimetype && mimetype !== reservation.mimetype) throw new BadRequestError('Upload media type does not match its reservation');
  let size: number;
  try {
    size = (await getFileMetadata(fileId)).size;
  } catch {
    throw new BadRequestError('Uploaded file is not available');
  }
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(reservation.maxBytes) || size <= 0 || size > reservation.maxBytes! || (expectedSize !== undefined && size !== expectedSize)) {
    throw new BadRequestError('Uploaded file size does not match');
  }
  const claimed = await UploadReservation.findOneAndUpdate({ _id: reservation._id, retired: false,
    $or: [
      { resourceId: { $exists: false }, expiresAt: { $gt: new Date() } },
      { resourceId: target, resourceKind }
    ]
  }, { $set: { resourceId: target, resourceKind } }, { new: true });
  if (!claimed) throw new ForbiddenError('Upload reservation is no longer available');
  return { resourceId: target, size };
}

/** Legacy paths have no trustworthy provenance. Retain those bytes for explicit
 * operator reconciliation; ownership of a wrapper is not ownership of a file. */
export async function deleteReservedFile(fileId: string, resourceKind: ResourceKind, resourceId: string) {
  const reservation = await UploadReservation.findOneAndUpdate({ fileId, resourceKind, resourceId },
    { $set: { retired: true } }, { new: true });
  if (reservation) await deleteFile(fileId);
}

export function isExternalUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}
