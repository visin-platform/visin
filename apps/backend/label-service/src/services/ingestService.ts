import { ingestZipLimits, readZipEntries, ZipData, NonRetryableIngestError } from '../utils/boundedZip';
export { NonRetryableIngestError } from '../utils/boundedZip';
import sharp from 'sharp';
import { logger } from '@visin/backend-core';
import { ImportJob, IImportError } from '../models/ImportJob';
import { LabelBundle } from '../models/LabelBundle';
import { LabelImage, IMaskMeta, ImageKind } from '../models/LabelImage';
import { EntryClassification, createEntryClassifier } from '../utils/bundlePaths';
import { parseManifest } from '../utils/manifest';
import * as files from '../clients/fileServiceClient';

// Metadata is retained until id maps are available; bound its cumulative input
// separately from image bytes, which are stored one entry at a time.
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const THUMBNAIL_WIDTH = 320;

export const bundleFileId = (bundleId: string, relativePath: string): string =>
  `label-bundles/${bundleId}/${relativePath}`;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const mimetypeFor = (relativePath: string): string => {
  const extension = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase();
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream';
};

interface IngestState {
  metadataBytes: number;
  errorBytes: number;
  processed: number;
  skipped: number;
  errors: IImportError[];
  manifest?: { stem: string; stratum?: string }[];
  // `${set}\0${stem}` → the parsed masks and the zip path they came from (kept
  // for error reporting, since with a mapping the folder name is the user's).
  masks: Map<string, { masks: IMaskMeta[]; path: string }>;
}

// Keep the terminal error report comfortably below MongoDB's document limit.
// Abort rather than silently dropping diagnostics from a hostile archive.
const recordError = (state: IngestState, error: IImportError): void => {
  const bytes = Buffer.byteLength(error.path) + Buffer.byteLength(error.reason);
  if (state.errors.length >= 1000 || state.errorBytes + bytes > 1024 * 1024) {
    throw new NonRetryableIngestError('Zip exceeds the import diagnostic limit');
  }
  state.errorBytes += bytes;
  state.errors.push(error);
};

const storeImage = async (
  bundleId: string,
  kind: ImageKind,
  entryPath: string,
  stem: string,
  set: string | undefined,
  data: Buffer,
  state: IngestState
): Promise<void> => {
  const existing = await LabelImage.exists({ bundleId, path: entryPath });
  if (existing) {
    state.skipped += 1;
    state.processed += 1;
    return;
  }

  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(data).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    recordError(state, { path: entryPath, reason: 'Not a readable image' });
    return;
  }

  const fileId = bundleFileId(bundleId, entryPath);
  await files.putFile(fileId, data);

  let thumbnailFileId: string | undefined;
  if (kind === 'frame') {
    const thumbnail = await sharp(data).resize({ width: THUMBNAIL_WIDTH }).jpeg({ quality: 80 }).toBuffer();
    thumbnailFileId = bundleFileId(bundleId, `thumbs/${stem}.jpg`);
    await files.putFile(thumbnailFileId, thumbnail);
  }

  await LabelImage.create({
    bundleId,
    path: entryPath,
    stem,
    kind,
    ...(set ? { annotationSet: set } : {}),
    fileId,
    ...(thumbnailFileId ? { thumbnailFileId } : {}),
    width,
    height,
    size: data.length,
    mimetype: mimetypeFor(entryPath)
  });
  state.processed += 1;
};

const handleEntry = async (
  bundleId: string,
  entry: ZipData,
  classify: (rawPath: string) => EntryClassification,
  state: IngestState
): Promise<void> => {
  if (entry.type === 'Directory') {
    return;
  }

  const classified = classify(entry.path);

  if (classified.type === 'ignored') {
    return;
  }
  if (classified.type === 'invalid') {
    recordError(state, { path: classified.path, reason: classified.reason });
    return;
  }

  const { data } = entry;
  if (classified.type === 'manifest' || classified.type === 'masksJson') {
    state.metadataBytes += data.length;
    if (state.metadataBytes > MAX_METADATA_BYTES) {
      throw new NonRetryableIngestError(`Zip metadata exceeds ${MAX_METADATA_BYTES} bytes`);
    }
  }

  if (classified.type === 'manifest') {
    state.manifest = parseManifest(data.toString('utf8'), classified.format);
    state.processed += 1;
    return;
  }

  if (classified.type === 'masksJson') {
    try {
      const masks = JSON.parse(data.toString('utf8')) as IMaskMeta[];
      if (!Array.isArray(masks)) throw new Error('not an array');
      state.masks.set(`${classified.set}\0${classified.stem}`, { masks, path: classified.path });
      state.processed += 1;
    } catch {
      recordError(state, { path: classified.path, reason: 'masks.json is not a JSON array' });
    }
    return;
  }

  await storeImage(bundleId, classified.type, classified.path, classified.stem, 'set' in classified ? classified.set : undefined, data, state);
};

const applyMaskMetadata = async (bundleId: string, state: IngestState): Promise<void> => {
  for (const [key, entry] of state.masks) {
    const [set, stem] = key.split('\0');
    const updated = await LabelImage.updateOne(
      { bundleId, kind: 'idmap', annotationSet: set, stem },
      { $set: { 'metadata.masks': entry.masks } }
    );
    if (updated.matchedCount === 0) {
      recordError(state, { path: entry.path, reason: 'No matching .ids.png in this set' });
    }
  }
};

const finalizeBundle = async (bundleId: string, state: IngestState): Promise<void> => {
  const [frames, layers, sets] = await Promise.all([
    LabelImage.countDocuments({ bundleId, kind: 'frame' }),
    LabelImage.countDocuments({ bundleId, kind: { $in: ['layer', 'idmap'] } }),
    LabelImage.distinct('annotationSet', { bundleId, kind: { $in: ['layer', 'idmap'] } })
  ]);

  await LabelBundle.updateOne(
    { _id: bundleId },
    {
      $set: {
        counts: { frames, layers },
        annotationSets: sets.filter(Boolean).sort(),
        ...(state.manifest ? { manifest: state.manifest } : {}),
        status: frames > 0 ? 'ready' : 'failed'
      }
    }
  );
};

/**
 * Mark an import terminally failed. Called by the queue worker once the attempt
 * budget is spent — `runImport` itself never decides this, because from inside
 * one attempt a transient failure is indistinguishable from a final one.
 */
export const markImportFailed = async (importJobId: string, reason: string): Promise<void> => {
  const importJob = await ImportJob.findById(importJobId);
  if (!importJob) {
    return;
  }
  importJob.status = 'failed';
  importJob.fileErrors.push({ path: '(zip)', reason });
  importJob.finishedAt = new Date();
  await importJob.save();
  await LabelBundle.updateOne({ _id: importJob.bundleId }, { $set: { status: 'failed' } });
};

/**
 * Run one import attempt end to end. Invoked by the queue worker — all progress
 * and per-file errors land on the ImportJob document the client polls.
 *
 * A fatal error is persisted and rethrown rather than marked failed here: the
 * worker owns the retry decision, and flipping the document to `failed` between
 * attempts would tell the polling client the import is over when it isn't.
 */
export const runImport = async (importJobId: string): Promise<void> => {
  const importJob = await ImportJob.findById(importJobId);
  if (!importJob) {
    throw new Error(`ImportJob ${importJobId} not found`);
  }
  const bundleId = importJob.bundleId.toString();
  const state: IngestState = { metadataBytes: 0, errorBytes: 0, processed: 0, skipped: 0, errors: [], masks: new Map() };
  // No mapping on the job = the zip claims the default layout.
  const classify = createEntryClassifier(importJob.mapping || undefined);

  importJob.status = 'running';
  importJob.startedAt = new Date();
  await importJob.save();
  await LabelBundle.updateOne({ _id: bundleId }, { $set: { status: 'importing' } });

  try {
    const limits = ingestZipLimits();
    let lastFlush = Date.now();
    const flushProgress = async (force = false): Promise<void> => {
      if (force || Date.now() - lastFlush > 5000) {
        await ImportJob.updateOne(
          { _id: importJob._id },
          { $set: { processed: state.processed, skipped: state.skipped } }
        );
        lastFlush = Date.now();
      }
    };
    const zipStream = await files.getFileStream(importJob.zipFileId);
    // Downloading a large archive must also keep the import heartbeat live.
    for await (const entry of readZipEntries(zipStream, limits, flushProgress)) {
      await handleEntry(bundleId, entry, classify, state);
      await flushProgress(state.processed % 25 === 0);
    }

    await applyMaskMetadata(bundleId, state);
    await finalizeBundle(bundleId, state);

    // Per-file problems are reported in `errors`, not fatal; only an empty result fails.
    // An empty result is terminal on its own — nothing threw, so nothing retries.
    importJob.status = state.processed > 0 ? 'done' : 'failed';
    importJob.total = state.processed + state.errors.length;
  } catch (err) {
    state.errors.push({ path: '(zip)', reason: (err as Error).message });
    logger.error('Bundle import attempt failed', { bundleId, importJobId, error: (err as Error).message });
    // Keep the partial progress (a resumed attempt skips what landed) but leave
    // `status` and `finishedAt` alone — see markImportFailed above.
    importJob.processed = state.processed;
    importJob.skipped = state.skipped;
    importJob.fileErrors = state.errors;
    await importJob.save();
    throw err;
  }

  importJob.processed = state.processed;
  importJob.skipped = state.skipped;
  importJob.fileErrors = state.errors;
  importJob.finishedAt = new Date();
  await importJob.save();
};
