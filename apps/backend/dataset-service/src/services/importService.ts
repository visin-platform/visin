import sharp from 'sharp';
import { Types } from 'mongoose';
import { logger } from '@visin/backend-core';
import { Dataset, IDataset, ImportError, ManifestRow } from '../models/Dataset';
import { DatasetItem } from '../models/DatasetItem';
import * as files from '../clients/fileServiceClient';
import { importZipLimits, NonRetryableImportError, readZipEntries, ZipData } from '../utils/boundedZip';
import { createClassifier, EntryClassification, StoredEntry } from '../utils/mapping';
import { parseManifest } from '../utils/manifest';
import { mimetypeFor } from '../utils/zipPaths';

const THUMBNAIL_WIDTH = 320;
const HEARTBEAT_MS = 5000;
const MAX_ERRORS = 1000;
const MAX_ERROR_BYTES = 1024 * 1024;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

const concurrency = (): number => Math.max(1, Number(process.env.DATASET_IMPORT_CONCURRENCY || 4));
const maxJsonBytes = (): number => Number(process.env.DATASET_IMPORT_MAX_JSON_BYTES || 1024 * 1024);

/** Where one import's extracted files go — its own folder, so replacing it is one folder delete. */
export const importFolder = (dataset: Pick<IDataset, 'storagePrefix'>, importId: string): string =>
  `${dataset.storagePrefix}items/${importId}/`;

interface ImportState {
  processed: number;
  skipped: number;
  errors: ImportError[];
  errorBytes: number;
  copiedBytes: number;
  manifest?: ManifestRow[];
}

class ImportStopped extends Error {}

// Keep the persisted error report comfortably below MongoDB's document limit.
// Abort rather than silently dropping diagnostics from a hostile archive.
const recordError = (state: ImportState, error: ImportError): void => {
  const bytes = Buffer.byteLength(error.path) + Buffer.byteLength(error.reason);
  if (state.errors.length >= MAX_ERRORS || state.errorBytes + bytes > MAX_ERROR_BYTES) {
    throw new NonRetryableImportError('Zip exceeds the import diagnostic limit');
  }
  state.errorBytes += bytes;
  state.errors.push(error);
};

const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;

/** Run `task` over `values` with at most `limit` in flight. */
const eachLimit = async <T>(values: T[], limit: number, task: (value: T) => Promise<void>): Promise<void> => {
  for (let i = 0; i < values.length; i += limit) {
    await Promise.all(values.slice(i, i + limit).map(task));
  }
};

/**
 * Remove what earlier imports left: their rows, and their files — one folder
 * per import, or file by file for items that arrived without one (migrated).
 */
const clearPreviousImports = async (dataset: IDataset, importId: string): Promise<void> => {
  const stale = { datasetId: dataset._id, importId: { $ne: importId } };
  const staleImportIds = (await DatasetItem.distinct('importId', stale)).filter(Boolean) as string[];
  for (const staleId of staleImportIds) {
    await files.deleteFolder(importFolder(dataset, staleId));
  }
  const unfoldered = await DatasetItem.find(
    { datasetId: dataset._id, importId: { $exists: false }, kind: 'image' },
    { fileId: 1, thumbnailFileId: 1 }
  );
  const fileIds = unfoldered.flatMap((item) => [item.fileId, item.thumbnailFileId]).filter(Boolean) as string[];
  await eachLimit(fileIds, 8, (fileId) => files.deleteFile(fileId));
  await DatasetItem.deleteMany(stale);
};

const storeImage = async (
  dataset: IDataset,
  importId: string,
  classified: StoredEntry,
  data: Buffer,
  state: ImportState
): Promise<void> => {
  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(data).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    recordError(state, { path: classified.path, reason: 'Not a readable image' });
    return;
  }

  const folder = importFolder(dataset, importId);
  const fileId = `${folder}${classified.path}`;
  // Stored exactly as it came out of the zip: an id map's pixel values are data.
  await files.putFile(fileId, data);
  const thumbnail = await sharp(data).resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const thumbnailFileId = `${folder}.thumbs/${classified.path}.jpg`;
  await files.putFile(thumbnailFileId, thumbnail);

  try {
    await DatasetItem.create({
      datasetId: dataset._id,
      importId,
      group: classified.group,
      path: classified.path,
      stem: classified.stem,
      ...(classified.variant ? { variant: classified.variant } : {}),
      kind: 'image',
      fileId,
      thumbnailFileId,
      width,
      height,
      size: data.length,
      mimetype: mimetypeFor(classified.path)
    });
    state.processed += 1;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    state.skipped += 1;
  }
};

const storeJson = async (
  dataset: IDataset,
  importId: string,
  classified: StoredEntry,
  data: Buffer,
  state: ImportState
): Promise<void> => {
  if (data.length > maxJsonBytes()) {
    recordError(state, { path: classified.path, reason: `JSON exceeds ${maxJsonBytes()} bytes` });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString('utf8'));
  } catch {
    recordError(state, { path: classified.path, reason: 'Not valid JSON' });
    return;
  }
  try {
    await DatasetItem.create({
      datasetId: dataset._id,
      importId,
      group: classified.group,
      path: classified.path,
      stem: classified.stem,
      ...(classified.variant ? { variant: classified.variant } : {}),
      kind: 'json',
      size: data.length,
      data: parsed
    });
    state.processed += 1;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    state.skipped += 1;
  }
};

const handleEntry = async (
  dataset: IDataset,
  importId: string,
  entry: ZipData,
  classified: EntryClassification,
  state: ImportState
): Promise<void> => {
  if (classified.type === 'manifest') {
    if (entry.data.length > MAX_MANIFEST_BYTES) {
      recordError(state, { path: classified.path, reason: `Manifest exceeds ${MAX_MANIFEST_BYTES} bytes` });
      return;
    }
    try {
      state.manifest = parseManifest(entry.data.toString('utf8'), classified.format);
    } catch (err) {
      recordError(state, { path: classified.path, reason: (err as Error).message });
    }
    return;
  }
  if (classified.type === 'image') {
    await storeImage(dataset, importId, classified, entry.data, state);
  } else if (classified.type === 'json') {
    await storeJson(dataset, importId, classified, entry.data, state);
  }
};

/** Group counts, total images and a cover thumbnail, from what is actually stored. */
export const summarizeItems = async (datasetId: Types.ObjectId) => {
  const rows = await DatasetItem.aggregate<{ _id: { group: string; kind: string }; count: number }>([
    { $match: { datasetId } },
    { $group: { _id: { group: '$group', kind: '$kind' }, count: { $sum: 1 } } }
  ]);
  const groups = new Map<string, { name: string; images: number; jsons: number }>();
  for (const row of rows) {
    const group = groups.get(row._id.group) || { name: row._id.group, images: 0, jsons: 0 };
    if (row._id.kind === 'image') group.images += row.count;
    else group.jsons += row.count;
    groups.set(row._id.group, group);
  }
  const cover = await DatasetItem.findOne({ datasetId, kind: 'image', variant: { $exists: false } }, { thumbnailFileId: 1, fileId: 1 }).sort({ group: 1, path: 1 });
  return {
    groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
    imageCount: [...groups.values()].reduce((sum, group) => sum + group.images, 0),
    coverFileId: cover?.thumbnailFileId || cover?.fileId
  };
};

/**
 * After an import: the image a user picked, if the import stored it again,
 * otherwise the automatic one — and a pick the new images no longer hold is
 * forgotten rather than left pointing at deleted files.
 */
export const refreshCover = async (datasetId: Types.ObjectId, coverPath: string | undefined, automatic: string | undefined): Promise<void> => {
  const picked = coverPath ? await DatasetItem.findOne({ datasetId, path: coverPath, kind: 'image' }) : null;
  const coverFileId = picked ? picked.thumbnailFileId || picked.fileId : automatic;
  const unset: Record<string, ''> = {};
  if (!coverFileId) unset.coverFileId = '';
  if (coverPath && !picked) unset.coverPath = '';
  await Dataset.updateOne(
    { _id: datasetId },
    { ...(coverFileId ? { $set: { coverFileId } } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }
  );
};

/**
 * Close an import out as failed. Called by the queue worker once the attempt
 * budget is spent — `runImport` never decides this, because from inside one
 * attempt a transient failure is indistinguishable from a final one.
 */
export const markImportFailed = async (datasetId: string, importId: string, reason: string): Promise<void> => {
  const dataset = await Dataset.findById(datasetId);
  if (!dataset?.import || dataset.import.id !== importId || dataset.import.status === 'cancelled') return;
  await Dataset.updateOne(
    { _id: datasetId, 'import.id': importId },
    {
      $set: { 'import.status': 'failed', 'import.finishedAt': new Date() },
      $push: { 'import.errors': { path: '(zip)', reason } }
    }
  );
  await showStoredItems(dataset._id, dataset.coverPath);
};

/**
 * Show what an import that stopped early did store — counts, groups and cover
 * from the rows that exist. Resuming it skips those and stores the rest.
 */
const showStoredItems = async (datasetId: Types.ObjectId, coverPath: string | undefined): Promise<void> => {
  const summary = await summarizeItems(datasetId);
  await Dataset.updateOne({ _id: datasetId }, { $set: { groups: summary.groups, imageCount: summary.imageCount } });
  await refreshCover(datasetId, coverPath, summary.coverFileId);
};

/**
 * Run one import attempt end to end: clear what earlier imports left, extract
 * every mapped image and JSON file from the zip, then record group counts.
 * Progress and per-file errors land on the dataset's `import`, which the client
 * polls. A retried attempt skips what the dead one already stored.
 */
export const runImport = async (datasetId: string, importId: string): Promise<void> => {
  const dataset = await Dataset.findById(datasetId);
  const current = dataset?.import;
  if (!dataset || !current || current.id !== importId) {
    throw new NonRetryableImportError('Import no longer belongs to its dataset (deleted or superseded)');
  }
  if (current.status === 'cancelled') return;

  const state: ImportState = { processed: 0, skipped: 0, errors: [], errorBytes: 0, copiedBytes: 0 };
  const now = new Date();
  await Dataset.updateOne(
    { _id: dataset._id, 'import.id': importId },
    {
      $set: {
        'import.status': 'running',
        'import.startedAt': current.startedAt || now,
        'import.heartbeatAt': now,
        'import.folder': importFolder(dataset, importId)
      }
    }
  );

  let lastFlush = Date.now();
  const flush = async (force = false): Promise<void> => {
    if (!force && Date.now() - lastFlush < HEARTBEAT_MS) return;
    lastFlush = Date.now();
    const updated = await Dataset.findOneAndUpdate(
      { _id: dataset._id, 'import.id': importId },
      {
        $set: {
          'import.processed': state.processed,
          'import.skipped': state.skipped,
          'import.copiedBytes': state.copiedBytes,
          'import.heartbeatAt': new Date()
        }
      },
      { returnDocument: 'after', projection: { 'import.status': 1 } }
    );
    if (!updated) throw new NonRetryableImportError('Import no longer belongs to its dataset (deleted or superseded)');
    if (updated.import?.status === 'cancelled') throw new ImportStopped();
  };

  // Declared outside the try: whatever stops the loop, entries already being
  // stored must land before cleanup runs, or they would outlive it.
  const inFlight = new Set<Promise<void>>();
  try {
    await clearPreviousImports(dataset, importId);
    const existing = new Set<string>(await DatasetItem.distinct('path', { datasetId: dataset._id, importId }));
    const classify = createClassifier(current.mapping);
    const classified = new Map<string, EntryClassification>();
    const shouldRead = (rawPath: string): boolean => {
      const result = classify(rawPath);
      if (result.type === 'invalid') {
        recordError(state, { path: result.path, reason: result.reason });
        return false;
      }
      if (result.type === 'skipped') return false;
      if ((result.type === 'image' || result.type === 'json') && existing.has(result.path)) {
        state.skipped += 1;
        return false;
      }
      classified.set(rawPath, result);
      return true;
    };

    const zipStream = await files.getFileStream(current.archiveFileId);
    let failure: unknown;
    const limit = concurrency();
    for await (const entry of readZipEntries(zipStream, importZipLimits(), shouldRead, (copied) => {
      state.copiedBytes = copied;
      return flush();
    })) {
      const result = classified.get(entry.path)!;
      classified.delete(entry.path);
      const task: Promise<void> = handleEntry(dataset, importId, entry, result, state)
        .catch((err: unknown) => {
          failure ??= err;
        })
        .finally(() => inFlight.delete(task));
      inFlight.add(task);
      if (inFlight.size >= limit) await Promise.race(inFlight);
      if (failure) throw failure;
      await flush();
    }
    await Promise.all(inFlight);
    if (failure) throw failure;
    await flush(true);

    const summary = await summarizeItems(dataset._id);
    const status = state.processed === 0 && state.errors.length > 0 ? 'failed' : 'done';
    const finished = await Dataset.findOneAndUpdate(
      { _id: dataset._id, 'import.id': importId, 'import.status': { $ne: 'cancelled' } },
      {
        $set: {
          groups: summary.groups,
          imageCount: summary.imageCount,
          ...(state.manifest ? { manifest: state.manifest } : {}),
          'import.status': status,
          'import.processed': state.processed,
          'import.skipped': state.skipped,
          'import.total': state.processed + state.skipped + state.errors.length,
          'import.errors': state.errors,
          'import.finishedAt': new Date()
        }
      },
      { returnDocument: 'after' }
    );
    if (!finished) throw new ImportStopped();
    await refreshCover(dataset._id, finished.coverPath, summary.coverFileId);
    logger.info('Dataset import finished', { datasetId, importId, status, processed: state.processed, errors: state.errors.length });
  } catch (err) {
    await Promise.allSettled(inFlight);
    if (err instanceof ImportStopped) {
      // Cancelled: what landed stays and shows, and resuming stores the rest.
      await Dataset.updateOne(
        { _id: dataset._id, 'import.id': importId },
        { $set: { 'import.processed': state.processed, 'import.skipped': state.skipped, 'import.errors': state.errors } }
      );
      await showStoredItems(dataset._id, dataset.coverPath);
      logger.info('Dataset import cancelled', { datasetId, importId, processed: state.processed });
      return;
    }
    logger.error('Dataset import attempt failed', { datasetId, importId, error: (err as Error).message });
    // Keep the partial progress (a retry skips what landed) but leave `status`
    // alone — see markImportFailed.
    await Dataset.updateOne(
      { _id: dataset._id, 'import.id': importId },
      { $set: { 'import.processed': state.processed, 'import.skipped': state.skipped, 'import.errors': state.errors } }
    );
    throw err;
  }
};
