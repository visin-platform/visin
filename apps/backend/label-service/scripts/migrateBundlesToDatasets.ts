/**
 * Convert a backup of the labeling collections into the new structure, offline.
 *
 *   npm run migrate:datasets --workspace=label-service -- <backup-dir>
 *
 * Reads the `.jsonl` files `scripts/backup-collections.mjs` wrote, and writes
 * `<backup-dir>/migrated/*.jsonl` plus a `report.json`. It connects to nothing:
 * check the report, load it with `loadMigratedLabeling.ts`, then deploy.
 *
 * Delete this script once the migration has run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import { BackupData, migrateBundlesToDatasets } from '../src/migration/bundlesToDatasets';

const { EJSON } = mongoose.mongo.BSON;

const read = <T>(directory: string, name: string): T[] => {
  const file = join(directory, `${name}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => EJSON.parse(line) as T);
};

const write = (directory: string, name: string, rows: unknown[]): void => {
  writeFileSync(join(directory, `${name}.jsonl`), rows.map((row) => EJSON.stringify(row, { relaxed: false })).join('\n') + '\n', {
    mode: 0o600
  });
};

const source = process.argv[2];
if (!source) {
  console.error('Usage: migrateBundlesToDatasets <backup-dir>');
  process.exit(1);
}

const backup: BackupData = {
  bundles: read(source, 'labelbundles'),
  images: read(source, 'labelimages'),
  imports: read(source, 'importjobs'),
  jobs: read(source, 'labeljobs'),
  tasks: read(source, 'labeltasks'),
  answers: read(source, 'labelanswers')
};

const result = migrateBundlesToDatasets(backup);
const target = join(source, 'migrated');
mkdirSync(target, { recursive: true, mode: 0o700 });
for (const name of ['datasets', 'dataset_items', 'label_jobs', 'label_tasks', 'label_answers'] as const) {
  write(target, name, result[name]);
}
writeFileSync(join(target, 'report.json'), `${JSON.stringify(result.report, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify(result.report, null, 2));
console.log(`\nWritten to ${target}`);
if (result.report.warnings.length > 0) {
  console.log(`\n${result.report.warnings.length} warning(s) — read them before loading.`);
}
