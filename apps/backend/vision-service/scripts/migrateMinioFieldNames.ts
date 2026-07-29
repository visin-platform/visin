/**
 * One-off migration: drop the legacy `minio*` field names from vision-service
 * collections.
 *
 * Files stopped living in MinIO when the platform moved to file-service disk
 * storage, but the Mongo field names kept the old vendor's name. The *values*
 * were already file-service paths (`vision/...`, `camera_only_annotation/...`,
 * `visualizations/...`) — only the keys are legacy. This renames the keys:
 *
 *   datasetimages.minioFileId          -> fileId
 *   datasetimages.minioThumbnailFileId -> thumbnailFileId
 *   epoch_visualizations.minioFileId   -> fileId
 *   dataset_analyses.files[].minioFileId -> fileId
 *
 * It is idempotent (matches only docs that still carry the legacy key) and
 * skips any document that somehow has *both* keys, reporting those instead of
 * guessing which one wins.
 *
 * Deliberately out of scope: the `photos` collection. It carries the same
 * legacy names but belongs to a different application sharing this database —
 * not ours to migrate.
 *
 * Usage (from the repo root) — dry-run first, it writes nothing without --apply:
 *   npm run migrate:minio --workspace=vision-service
 *   npm run migrate:minio --workspace=vision-service -- --apply
 *
 * Requires MONGODB_URI (falls back to the local dev database).
 *
 * ORDERING: this is not independent of the deploy. Code before this change
 * reads `minioFileId` and code after it reads `fileId`, so whichever runs
 * against the other's data sees an image with no file id. Run --apply as part
 * of the vision-service deploy (it is a `$rename` over ~107k documents and
 * takes seconds), not as a separate scheduled task.
 */
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/visin';

/** Legacy key -> new key, per collection. */
const RENAMES: { collection: string; from: string; to: string }[] = [
  { collection: 'datasetimages', from: 'minioFileId', to: 'fileId' },
  { collection: 'datasetimages', from: 'minioThumbnailFileId', to: 'thumbnailFileId' },
  { collection: 'epoch_visualizations', from: 'minioFileId', to: 'fileId' }
];

interface StepResult {
  collection: string;
  from: string;
  to: string;
  legacyOnly: number;
  conflicting: number;
  alreadyMigrated: number;
  renamed: number;
}

const main = async (): Promise<void> => {
  const apply = process.argv.includes('--apply');

  // Reported before connecting: `npm run ... --apply` without the `--`
  // separator is swallowed by npm and silently downgrades to a dry run, so the
  // mode needs to be visible without waiting on the connection.
  console.log(apply ? 'mode: APPLY (writing)' : 'mode: DRY RUN (no writes — pass --apply to migrate)');
  console.log(`host: ${MONGODB_URI.replace(/\/\/[^@/]*@/, '//<credentials>@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No database handle after connect');
  }

  console.log(`database: ${db.databaseName}`);
  console.log('');

  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));
  const results: StepResult[] = [];

  for (const { collection, from, to } of RENAMES) {
    if (!existing.has(collection)) {
      console.log(`- ${collection}: collection does not exist, skipping`);
      continue;
    }

    const col = db.collection(collection);

    // A doc with both keys is ambiguous: $rename would fail on it anyway.
    const conflicting = await col.countDocuments({ [from]: { $exists: true }, [to]: { $exists: true } });
    const legacyOnly = await col.countDocuments({ [from]: { $exists: true }, [to]: { $exists: false } });
    const alreadyMigrated = await col.countDocuments({ [from]: { $exists: false }, [to]: { $exists: true } });

    let renamed = 0;
    if (apply && legacyOnly > 0) {
      const res = await col.updateMany(
        { [from]: { $exists: true }, [to]: { $exists: false } },
        { $rename: { [from]: to } }
      );
      renamed = res.modifiedCount;
    }

    results.push({ collection, from, to, legacyOnly, conflicting, alreadyMigrated, renamed });

    const verb = apply ? `renamed ${renamed}` : `would rename ${legacyOnly}`;
    console.log(
      `- ${collection}.${from} -> ${to}: ${verb}` +
        ` (already migrated: ${alreadyMigrated}, conflicting: ${conflicting})`
    );
    if (conflicting > 0) {
      const samples = await col
        .find({ [from]: { $exists: true }, [to]: { $exists: true } }, { projection: { [from]: 1, [to]: 1 } })
        .limit(5)
        .toArray();
      console.log(`    !! ${conflicting} doc(s) carry both keys and were left untouched. Samples:`);
      samples.forEach(d => console.log(`       _id=${String(d._id)} ${from}=${d[from]} ${to}=${d[to]}`));
    }
  }

  // `dataset_analyses.files[]` is an array element, so $rename can't reach it
  // (no positional-all support) — read/modify/write instead. The array is
  // orphaned: it is not in the DatasetAnalysis schema and no code reads or
  // writes it, left behind by the removed dataset-zip-upload feature. Renamed
  // rather than dropped so the migration stays non-destructive.
  let analysesRenamed = 0;
  if (existing.has('dataset_analyses')) {
    const col = db.collection('dataset_analyses');
    const docs = await col.find({ 'files.minioFileId': { $exists: true } }).toArray();

    for (const doc of docs) {
      const files = (doc.files as Record<string, unknown>[]).map(f => {
        if (!('minioFileId' in f)) return f;
        const { minioFileId, ...rest } = f;
        return { ...rest, fileId: 'fileId' in f ? f.fileId : minioFileId };
      });
      if (apply) {
        await col.updateOne({ _id: doc._id }, { $set: { files } });
      }
      analysesRenamed += 1;
    }

    const verb = apply ? `rewrote ${analysesRenamed}` : `would rewrite ${docs.length}`;
    console.log(`- dataset_analyses.files[].minioFileId -> fileId: ${verb} doc(s) (orphaned data — safe to drop entirely)`);
  }

  // Report-only: legacy names we deliberately do not rewrite.
  console.log('');
  console.log('=== reported, not migrated ===');

  if (existing.has('photos')) {
    const photos = await db.collection('photos').countDocuments({ minioFileId: { $exists: true } });
    console.log(`- photos: ${photos} doc(s) with minioFileId — different application, intentionally untouched`);
  }

  // Post-migration verification: nothing left behind in our own collections.
  if (apply) {
    console.log('');
    console.log('=== verification ===');
    let clean = true;
    for (const { collection, from, to } of RENAMES) {
      if (!existing.has(collection)) continue;
      const leftover = await db.collection(collection).countDocuments({ [from]: { $exists: true } });
      const migrated = await db.collection(collection).countDocuments({ [to]: { $exists: true } });
      console.log(`- ${collection}: ${leftover} doc(s) still have ${from}, ${migrated} have ${to}`);
      if (leftover > 0) clean = false;
    }
    if (existing.has('dataset_analyses')) {
      const leftover = await db.collection('dataset_analyses').countDocuments({ 'files.minioFileId': { $exists: true } });
      console.log(`- dataset_analyses: ${leftover} doc(s) still have files[].minioFileId`);
      if (leftover > 0) clean = false;
    }
    console.log(clean ? 'OK — no legacy keys remain.' : 'INCOMPLETE — legacy keys remain (see conflicts above).');
  }

  const totalPending = results.reduce((sum, r) => sum + r.legacyOnly, 0);
  if (!apply) {
    console.log('');
    console.log(`Dry run complete. ${totalPending} document(s) would be modified. Re-run with --apply to migrate.`);
  }

  await mongoose.disconnect();
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
