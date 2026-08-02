import { BadRequestError, ConflictError, NotFoundError, UserPayload, logger } from '@visin/backend-core';
import { LabelBundle, ILabelBundle } from '../models/LabelBundle';
import { ImportJob, IImportJob } from '../models/ImportJob';
import { LabelImage } from '../models/LabelImage';
import { LabelJob } from '../models/LabelJob';
import { runImport, bundleFileId } from './ingestService';
import { previewZip, ZipPreview } from './previewService';
import { ImportMapping } from '../utils/bundlePaths';
import * as files from '../clients/fileServiceClient';
import * as groups from '../clients/groupServiceClient';

// An import whose heartbeat (updatedAt) is older than this is considered dead —
// the process crashed or was redeployed mid-ingest. The live loop flushes
// progress at least every 5s, so this is very conservative.
const IMPORT_STALE_MS = Number(process.env.IMPORT_STALE_MINUTES || 10) * 60 * 1000;

const isStale = (importJob: IImportJob): boolean =>
  importJob.updatedAt.getTime() < Date.now() - IMPORT_STALE_MS;

export const createBundle = async (
  user: UserPayload,
  data: { name: string; groupId: string }
): Promise<ILabelBundle> => {
  return LabelBundle.create({
    ...data,
    createdBy: {
      userId: user.id,
      email: (user.email || '').toLowerCase(),
      name: user.name
    },
    status: 'empty'
  });
};

/** Bundles in any group the user belongs to. */
export const listBundlesForUser = async (userEmail: string): Promise<ILabelBundle[]> => {
  const myGroups = await groups.getMyGroups(userEmail);
  const groupIds = myGroups.map((g) => g.groupId);
  return LabelBundle.find({ groupId: { $in: groupIds } }).sort({ updatedAt: -1 });
};

export const getBundle = async (bundleId: string): Promise<ILabelBundle> => {
  const bundle = await LabelBundle.findById(bundleId);
  if (!bundle) {
    throw new NotFoundError('Bundle not found');
  }
  return bundle;
};

/** Signed PUT URL for the bundle zip; the returned zipFileId is what import expects. */
export const createUploadUrl = async (
  bundleId: string
): Promise<{ uploadUrl: string; zipFileId: string; expiresMs: number }> => {
  const zipFileId = bundleFileId(bundleId, `upload-${Date.now()}.zip`);
  const signed = await files.getUploadUrl(zipFileId);
  return { uploadUrl: signed.url, zipFileId, expiresMs: signed.expiresMs };
};

// Only zips uploaded for this bundle may be read or ingested for it.
const assertOwnedZip = (bundleId: string, zipFileId: string): void => {
  if (!zipFileId.startsWith(bundleFileId(bundleId, '')) || zipFileId.includes('..')) {
    throw new BadRequestError('zipFileId does not belong to this bundle');
  }
};

/**
 * Inspect an uploaded zip before importing it: the folder table and the
 * suggested mapping the client's mapping step starts from.
 */
export const previewImport = async (bundleId: string, zipFileId: string): Promise<ZipPreview> => {
  assertOwnedZip(bundleId, zipFileId);
  if (!(await files.fileExists(zipFileId))) {
    throw new BadRequestError('Uploaded zip not found — upload it first');
  }
  return previewZip(zipFileId);
};

export const startImport = async (
  bundleId: string,
  zipFileId: string,
  mapping?: ImportMapping
): Promise<IImportJob> => {
  assertOwnedZip(bundleId, zipFileId);
  const running = await ImportJob.findOne({ bundleId, status: { $in: ['pending', 'running'] } });
  if (running) {
    // A crashed/redeployed process leaves its import in `running` forever.
    // Once the heartbeat is stale, fail it and let the retry proceed —
    // ingest is idempotent, so the new run resumes where the dead one stopped.
    if (!isStale(running)) {
      throw new ConflictError('An import is already running for this bundle');
    }
    running.status = 'failed';
    running.fileErrors.push({ path: '(zip)', reason: 'Import went stale (process died?) — superseded by a retry' });
    running.finishedAt = new Date();
    await running.save();
  }
  if (!(await files.fileExists(zipFileId))) {
    throw new BadRequestError('Uploaded zip not found — upload it first');
  }

  const importJob = await ImportJob.create({ bundleId, zipFileId, status: 'pending', ...(mapping ? { mapping } : {}) });

  // Fire and forget: progress and errors land on the ImportJob the client polls.
  runImport(importJob._id.toString()).catch((err) =>
    logger.error('Import crashed', { bundleId, importJobId: importJob._id.toString(), error: (err as Error).message })
  );

  return importJob;
};

export const getImport = async (bundleId: string, importId: string): Promise<IImportJob> => {
  const importJob = await ImportJob.findOne({ _id: importId, bundleId });
  if (!importJob) {
    throw new NotFoundError('Import not found');
  }
  return importJob;
};

/**
 * Abandon/clean up an import record. Finished imports are removed; a dead
 * (stale) running import is marked failed. A live one is refused — wait for
 * it, or for its heartbeat to go stale.
 */
export const deleteImport = async (bundleId: string, importId: string): Promise<void> => {
  const importJob = await getImport(bundleId, importId);

  if (importJob.status === 'done' || importJob.status === 'failed') {
    await ImportJob.deleteOne({ _id: importJob._id });
    return;
  }
  if (!isStale(importJob)) {
    throw new ConflictError('Import is still running — wait for it to finish or go stale');
  }
  importJob.status = 'failed';
  importJob.fileErrors.push({ path: '(zip)', reason: 'Abandoned by admin after going stale' });
  importJob.finishedAt = new Date();
  await importJob.save();
};

/**
 * Delete a bundle: its images' metadata rows, import history, and every stored
 * file (frames, layers, thumbnails, uploaded zips). Refused while any job
 * references the bundle or an import is live.
 */
export const deleteBundle = async (bundleId: string): Promise<void> => {
  // Archived jobs tolerate a deleted bundle (their exports degrade to missing
  // image refs); anything else still needs the images.
  const jobCount = await LabelJob.countDocuments({ bundleId, status: { $ne: 'archived' } });
  if (jobCount > 0) {
    throw new ConflictError(`${jobCount} non-archived job(s) reference this bundle — archive them first`);
  }
  const running = await ImportJob.findOne({ bundleId, status: { $in: ['pending', 'running'] } });
  if (running && !isStale(running)) {
    throw new ConflictError('An import is running for this bundle — wait for it to finish or go stale');
  }

  await files.deleteFolder(bundleFileId(bundleId, ''));
  await LabelImage.deleteMany({ bundleId });
  await ImportJob.deleteMany({ bundleId });
  await LabelBundle.deleteOne({ _id: bundleId });
};
