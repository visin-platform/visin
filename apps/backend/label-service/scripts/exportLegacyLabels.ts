/**
 * One-off, READ-ONLY freeze of the legacy image-labeling data.
 *
 * The old vision-front labeling tool stored its verdicts as 'good'/'bad'
 * strings inside `DatasetImage.tags`. This script exports them to a JSONL
 * archive so the labels survive the tool's removal. It deliberately makes NO
 * writes: the tags stay in the vision database untouched, so rolling back the
 * vision-front code restores a fully working legacy tool.
 *
 * Usage (from the repo root):
 *   npm run export:legacy-labels --workspace=label-service -- [outFile.jsonl]
 *
 * Requires MONGODB_URI (falls back to the local dev database).
 */
import { createWriteStream } from 'fs';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/visin';

interface LegacyRow {
  datasetImageId: string;
  datasetId: string | null;
  filename: string;
  label: 'good' | 'bad';
  /** Best available timestamp — the legacy tool kept no explicit labeled-at. */
  imageUpdatedAt: string | null;
}

const main = async (): Promise<void> => {
  const outFile = process.argv[2] || `legacy-labels-${new Date().toISOString().slice(0, 10)}.jsonl`;

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No database handle after connect');
  }

  const cursor = db
    .collection('datasetimages')
    .find(
      { tags: { $in: ['good', 'bad'] } },
      { projection: { filename: 1, datasetId: 1, tags: 1, updatedAt: 1 } }
    );

  const out = createWriteStream(outFile);
  const counts = { good: 0, bad: 0, conflicting: 0 };

  for await (const doc of cursor) {
    const tags: string[] = doc.tags || [];
    const hasGood = tags.includes('good');
    const hasBad = tags.includes('bad');
    if (hasGood && hasBad) {
      counts.conflicting += 1; // both tags present — export both facts, flag it
    }
    const labels = [hasGood ? 'good' : null, hasBad ? 'bad' : null].filter(Boolean) as ('good' | 'bad')[];
    for (const label of labels) {
      counts[label] += 1;
      const row: LegacyRow = {
        datasetImageId: String(doc._id),
        datasetId: doc.datasetId ? String(doc.datasetId) : null,
        filename: doc.filename,
        label,
        imageUpdatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null
      };
      out.write(JSON.stringify(row) + '\n');
    }
  }

  await new Promise((resolve) => out.end(resolve));
  await mongoose.disconnect();

  console.log(`Exported to ${outFile}: ${counts.good} good, ${counts.bad} bad` +
    (counts.conflicting ? `, ${counts.conflicting} images carried BOTH tags` : ''));
  console.log('Read-only export — the tags remain in the database for rollback.');
};

main().catch((err) => {
  console.error('Export failed:', (err as Error).message);
  process.exitCode = 1;
});
