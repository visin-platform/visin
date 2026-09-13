import { BadGatewayError, BadRequestError, ConflictError, NotFoundError, UserPayload, logger } from '@visin/backend-core';
import { LabelBundle, ILabelBundle } from '../models/LabelBundle';
import { ImportJob, IImportJob } from '../models/ImportJob';
import { LabelImage, ILabelImage } from '../models/LabelImage';
import { LabelJob } from '../models/LabelJob';
import { LabelTask } from '../models/LabelTask';
import { LabelAnswer } from '../models/LabelAnswer';
import { bundleFileId } from './ingestService';
import { enqueueImport, removeQueuedImport } from '../queue/importQueue';
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
  data: { name: string; groupId: string; description?: string }
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
export const listBundlesForUser = async (userId: string): Promise<ILabelBundle[]> => {
  const myGroups = await groups.getMyGroups(userId);
  const groupIds = myGroups.map((g) => g.groupId);
  return LabelBundle.find({ groupId: { $in: groupIds } }).sort({ updatedAt: -1 });
};

/**
 * A bundle is visible outside its group while a job built on it is shared
 * publicly — the same rule that makes the job's frames public, so exposing the
 * bundle's metadata shares nothing the job has not already shared. There is no
 * separate flag to forget to clear: pausing, archiving or unsharing the last
 * such job makes the bundle private again.
 */
const PUBLIC_JOB_FILTER = { status: 'active', isPublic: true } as const;

/** A bundle as an outsider may see it: everything except who uploaded it. */
export const withoutCreatorIdentity = (bundle: ILabelBundle): Record<string, unknown> => {
  const { createdBy: _createdBy, ...rest } = bundle.toObject();
  return rest;
};

/** Bundles behind at least one publicly shared job — what an anonymous caller lists. */
export const listPublicBundles = async (): Promise<Record<string, unknown>[]> => {
  const bundleIds = await LabelJob.distinct('bundleId', PUBLIC_JOB_FILTER);
  const bundles = await LabelBundle.find({ _id: { $in: bundleIds } }).sort({ updatedAt: -1 });
  return bundles.map(withoutCreatorIdentity);
};

export const isBundlePublic = async (bundleId: string): Promise<boolean> =>
  (await LabelJob.exists({ bundleId, ...PUBLIC_JOB_FILTER })) !== null;

export const getBundle = async (bundleId: string): Promise<ILabelBundle> => {
  const bundle = await LabelBundle.findById(bundleId);
  if (!bundle) {
    throw new NotFoundError('Bundle not found');
  }
  return bundle;
};

// A field with more distinct values than this is an id or a score, not a group
// to slice a job by — offering it would flood the picker and select nothing
// useful. Values themselves are capped per field for the same reason.
const MAX_FIELD_VALUES = 40;

export interface MaskField {
  field: string;
  values: { value: string; count: number }[];
}

/**
 * The groupable mask fields in one annotation set, with a count per value.
 *
 * This is what lets one full-corpus bundle serve many jobs: the uploader ships
 * every mask with whatever metadata it carries, and the job wizard slices on
 * that metadata here rather than the uploader having to pre-cut a zip per job.
 * Only low-cardinality scalar fields are returned — `bbox` is an array, `id` is
 * unique per mask, and neither is something to group a job by.
 */
export const maskFields = async (bundleId: string, annotationSet: string): Promise<MaskField[]> => {
  // Name the document type: newer mongoose infers a nested projection as selecting no fields.
  const idmaps = await LabelImage.find<ILabelImage>(
    { bundleId, kind: 'idmap', annotationSet },
    { 'metadata.masks': 1 }
  );

  const tally = new Map<string, Map<string, number>>();
  const overflowed = new Set<string>();
  for (const idmap of idmaps) {
    for (const mask of idmap.metadata?.masks || []) {
      for (const [field, raw] of Object.entries(mask)) {
        if (field === 'id' || raw === null || raw === undefined || typeof raw === 'object') {
          continue;
        }
        if (overflowed.has(field)) {
          continue;
        }
        const counts = tally.get(field) || new Map<string, number>();
        const value = String(raw);
        counts.set(value, (counts.get(value) || 0) + 1);
        if (counts.size > MAX_FIELD_VALUES) {
          overflowed.add(field);
          tally.delete(field);
          continue;
        }
        tally.set(field, counts);
      }
    }
  }

  return [...tally]
    .map(([field, counts]) => ({
      field,
      values: [...counts]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
    }))
    .sort((a, b) => a.field.localeCompare(b.field));
};

/**
 * Rename / re-describe a bundle. Metadata only, on purpose: the images are
 * referenced by existing tasks and answers, so changing what a bundle *is*
 * means uploading another zip (additive) or creating a new bundle.
 */
export const updateBundle = async (
  bundleId: string,
  data: { name?: string; description?: string }
): Promise<ILabelBundle> => {
  const bundle = await getBundle(bundleId);
  if (data.name !== undefined) {
    bundle.name = data.name;
  }
  if (data.description !== undefined) {
    // Empty string clears it rather than storing a blank.
    bundle.description = data.description || undefined;
  }
  await bundle.save();
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

export interface BundleUpload {
  zipFileId: string;
  size: number;
  uploadedAt: string;
}

/**
 * Zips already uploaded for this bundle, newest first.
 *
 * Upload and import are separate steps for a reason: a zip can be hundreds of
 * megabytes, while importing it is where things realistically go wrong (a bad
 * mapping, a dependency hiccup, a crashed process). Re-running the import must
 * not mean re-sending the bytes, so the uploads stay listable until the bundle
 * is deleted.
 */
export const listUploads = async (bundleId: string): Promise<BundleUpload[]> => {
  const stored = await files.listFiles(bundleFileId(bundleId, ''));
  return stored
    .filter((file) => /\/upload-\d+\.zip$/.test(file.name))
    .map((file) => ({
      zipFileId: file.name,
      size: file.size,
      uploadedAt: file.lastModified
    }))
    .sort((a, b) => b.zipFileId.localeCompare(a.zipFileId));
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
    // If it never left the queue (rather than dying mid-ingest), drop it, or a
    // worker picks it up later and races the retry over the same zip.
    await removeQueuedImport(running._id.toString());
  }
  if (!(await files.fileExists(zipFileId))) {
    throw new BadRequestError('Uploaded zip not found — upload it first');
  }

  const importJob = await ImportJob.create({ bundleId, zipFileId, status: 'pending', ...(mapping ? { mapping } : {}) });

  // Handed to the queue rather than run in the request: the ingest outlives the
  // HTTP response by minutes, and a redeploy mid-ingest must not lose it.
  // Progress and errors land on the ImportJob the client polls, as before.
  try {
    await enqueueImport({ importJobId: importJob._id.toString(), bundleId });
  } catch (err) {
    // Nothing will ever pick this job up, so don't leave it polling as `pending`.
    importJob.status = 'failed';
    importJob.fileErrors.push({ path: '(zip)', reason: `Could not queue the import: ${(err as Error).message}` });
    importJob.finishedAt = new Date();
    await importJob.save();
    logger.error('Could not enqueue import', { bundleId, importJobId: importJob._id.toString(), error: (err as Error).message });
    throw new BadGatewayError('Import queue is unavailable — try again shortly');
  }

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
    await removeQueuedImport(importJob._id.toString());
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
  await removeQueuedImport(importJob._id.toString());
};

/**
 * Delete a bundle: its images' metadata rows, import history, and every stored
 * file (frames, layers, thumbnails, uploaded zips). Refused while any job
 * references the bundle or an import is live.
 */
/**
 * Hard-delete a bundle and everything that hangs off it: its jobs, their tasks
 * and answers, its images, its imports, and the uploaded zip plus extracted
 * files on file-service.
 *
 * This used to refuse while any non-archived job referenced the bundle, which
 * pushed callers into archiving instead — and archiving deletes nothing, so the
 * tasks survived a bundle they could no longer resolve. Nothing here is
 * recoverable and nothing is left behind; a caller that wants the labels must
 * export before deleting.
 */
export const deleteBundle = async (bundleId: string): Promise<void> => {
  const running = await ImportJob.findOne({ bundleId, status: { $in: ['pending', 'running'] } });
  if (running && !isStale(running)) {
    throw new ConflictError('An import is running for this bundle — wait for it to finish or go stale');
  }

  if (running) {
    await removeQueuedImport(running._id.toString());
  }

  const jobIds = (await LabelJob.find({ bundleId }, { _id: 1 })).map((job) => job._id);
  if (jobIds.length > 0) {
    await LabelAnswer.deleteMany({ jobId: { $in: jobIds } });
    await LabelTask.deleteMany({ jobId: { $in: jobIds } });
    await LabelJob.deleteMany({ _id: { $in: jobIds } });
  }

  await files.deleteFolder(bundleFileId(bundleId, ''));
  await LabelImage.deleteMany({ bundleId });
  await ImportJob.deleteMany({ bundleId });
  await LabelBundle.deleteOne({ _id: bundleId });
};
