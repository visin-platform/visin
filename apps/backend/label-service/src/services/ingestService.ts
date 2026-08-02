import unzipper from 'unzipper';
import sharp from 'sharp';
import { logger } from '@visin/backend-core';
import { ImportJob, IImportError } from '../models/ImportJob';
import { LabelBundle } from '../models/LabelBundle';
import { LabelImage, IMaskMeta, ImageKind } from '../models/LabelImage';
import { EntryClassification, createEntryClassifier } from '../utils/bundlePaths';
import { parseManifest } from '../utils/manifest';
import * as files from '../clients/fileServiceClient';

const MAX_ENTRY_BYTES = Number(process.env.INGEST_MAX_ENTRY_BYTES || 50 * 1024 * 1024);
const MAX_ENTRIES = Number(process.env.INGEST_MAX_ENTRIES || 100_000);
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

interface ZipEntry {
  path: string;
  type: 'File' | 'Directory';
  buffer(): Promise<Buffer>;
  autodrain(): { promise(): Promise<void> };
}

interface IngestState {
  processed: number;
  skipped: number;
  errors: IImportError[];
  manifest?: { stem: string; stratum?: string }[];
  // `${set}\0${stem}` → the parsed masks and the zip path they came from (kept
  // for error reporting, since with a mapping the folder name is the user's).
  masks: Map<string, { masks: IMaskMeta[]; path: string }>;
}

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
    state.errors.push({ path: entryPath, reason: 'Not a readable image' });
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
  entry: ZipEntry,
  classify: (rawPath: string) => EntryClassification,
  state: IngestState
): Promise<void> => {
  if (entry.type === 'Directory') {
    await entry.autodrain().promise();
    return;
  }

  const classified = classify(entry.path);

  if (classified.type === 'ignored') {
    await entry.autodrain().promise();
    return;
  }
  if (classified.type === 'invalid') {
    state.errors.push({ path: classified.path, reason: classified.reason });
    await entry.autodrain().promise();
    return;
  }

  const data = await entry.buffer();
  if (data.length > MAX_ENTRY_BYTES) {
    state.errors.push({ path: classified.path, reason: `File exceeds ${MAX_ENTRY_BYTES} bytes` });
    return;
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
      state.errors.push({ path: classified.path, reason: 'masks.json is not a JSON array' });
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
      state.errors.push({ path: entry.path, reason: 'No matching .ids.png in this set' });
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
 * Run one import end to end. Fire-and-forget from the controller — all progress
 * and errors land on the ImportJob document the client polls.
 */
export const runImport = async (importJobId: string): Promise<void> => {
  const importJob = await ImportJob.findById(importJobId);
  if (!importJob) {
    throw new Error(`ImportJob ${importJobId} not found`);
  }
  const bundleId = importJob.bundleId.toString();
  const state: IngestState = { processed: 0, skipped: 0, errors: [], masks: new Map() };
  // No mapping on the job = the zip claims the default layout.
  const classify = createEntryClassifier(importJob.mapping || undefined);

  importJob.status = 'running';
  importJob.startedAt = new Date();
  await importJob.save();
  await LabelBundle.updateOne({ _id: bundleId }, { $set: { status: 'importing' } });

  try {
    const zipStream = await files.getFileStream(importJob.zipFileId);
    const parser = unzipper.Parse({ forceStream: true });
    // `pipe` does not forward source errors, so a failed read (peer restart,
    // aborted transfer) would emit an unhandled 'error' and take the whole
    // process down with it. Hand it to the parser instead: the `for await`
    // below then rejects and this import fails on its own, like any other.
    zipStream.on('error', (err) => parser.destroy(err));
    const entries = zipStream.pipe(parser);

    let entryCount = 0;
    let lastFlush = Date.now();
    for await (const entry of entries as AsyncIterable<ZipEntry>) {
      entryCount += 1;
      if (entryCount > MAX_ENTRIES) {
        throw new Error(`Zip exceeds ${MAX_ENTRIES} entries`);
      }
      await handleEntry(bundleId, entry, classify, state);
      // Progress + heartbeat: `updatedAt` staleness is how a dead import is
      // detected (see bundleService), so flush on a time interval, not just count.
      if (state.processed % 25 === 0 || Date.now() - lastFlush > 5000) {
        lastFlush = Date.now();
        await ImportJob.updateOne(
          { _id: importJob._id },
          { $set: { processed: state.processed, skipped: state.skipped } }
        );
      }
    }

    await applyMaskMetadata(bundleId, state);
    await finalizeBundle(bundleId, state);

    // Per-file problems are reported in `errors`, not fatal; only an empty result fails.
    importJob.status = state.processed > 0 ? 'done' : 'failed';
    importJob.total = state.processed + state.errors.length;
  } catch (err) {
    state.errors.push({ path: '(zip)', reason: (err as Error).message });
    importJob.status = 'failed';
    await LabelBundle.updateOne({ _id: bundleId }, { $set: { status: 'failed' } });
    logger.error('Bundle import failed', { bundleId, importJobId, error: (err as Error).message });
  }

  importJob.processed = state.processed;
  importJob.skipped = state.skipped;
  importJob.fileErrors = state.errors;
  importJob.finishedAt = new Date();
  await importJob.save();
};
