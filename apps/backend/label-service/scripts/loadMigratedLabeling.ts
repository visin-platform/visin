/**
 * Load a migrated backup into MongoDB, before the new code is deployed.
 *
 *   MONGODB_URI=... npm run load:datasets --workspace=label-service -- <backup-dir> [--force]
 *
 * Refuses unless the target collections are empty, and unless the live labeling
 * data still matches the backup the migration was built from — if anyone has
 * labeled since, the backup is stale and must be retaken.
 *
 * Only the new collections are written; the old ones are left exactly as they
 * are, so the running release keeps working until the deploy, and rolling back
 * is redeploying it. Delete this script once the migration has run.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;
const COLLECTIONS = ['datasets', 'dataset_items', 'label_jobs', 'label_tasks', 'label_answers'] as const;

const read = (directory: string, name: string): Record<string, unknown>[] => {
  const file = join(directory, `${name}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => EJSON.parse(line) as Record<string, unknown>);
};

const main = async (): Promise<void> => {
  const source = process.argv[2];
  const force = process.argv.includes('--force');
  if (!source) throw new Error('Usage: loadMigratedLabeling <backup-dir> [--force]');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  const migrated = join(source, 'migrated');
  const summaryFile = join(source, 'summary.json');
  const summary = existsSync(summaryFile) ? (JSON.parse(readFileSync(summaryFile, 'utf8')) as { jobs?: { _id: unknown; answers: number; latestAnswerAt: unknown }[] }) : undefined;

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  try {
    // Has anyone labeled since the backup? Then it no longer describes the work.
    const liveAnswers = await db.collection('labelanswers').countDocuments();
    const backedUpAnswers = read(source, 'labelanswers').length;
    const latest = (await db.collection('labelanswers').find({}).sort({ updatedAt: -1 }).limit(1).toArray())[0]?.updatedAt;
    const backupLatest = summary?.jobs?.reduce<string | undefined>((newest, job) => {
      const value = EJSON.serialize(job.latestAnswerAt) as { $date?: string } | undefined;
      const iso = value?.$date;
      return iso && (!newest || iso > newest) ? iso : newest;
    }, undefined);
    const drifted = liveAnswers !== backedUpAnswers || (latest && backupLatest && new Date(latest).toISOString() !== backupLatest);
    if (drifted && !force) {
      throw new Error(
        `Labeling has changed since the backup (live: ${liveAnswers} answers, latest ${latest}; backup: ${backedUpAnswers}, latest ${backupLatest}). ` +
          'Take a fresh backup and migrate again, or pass --force if you are certain.'
      );
    }

    for (const name of COLLECTIONS) {
      const existing = await db.collection(name).countDocuments();
      if (existing > 0) throw new Error(`${name} already holds ${existing} document(s) — drop it or use a clean database`);
    }

    for (const name of COLLECTIONS) {
      const rows = read(migrated, name);
      if (rows.length === 0) continue;
      // Ordered so a failure stops at the first bad document rather than
      // leaving an unpredictable subset behind.
      const { insertedCount } = await db.collection(name).insertMany(rows, { ordered: true });
      console.log(`${name}: ${insertedCount}`);
    }
    console.log('\nLoaded. Deploy the new release, then verify before dropping the old collections.');
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
