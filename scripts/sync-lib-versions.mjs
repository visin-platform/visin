#!/usr/bin/env node
/**
 * Point every workspace that consumes a `libs/*` package at that lib's current
 * version, exactly.
 *
 * Why exact, and why automated:
 *
 * Services install the shared libs from npm (`npm i` inside their Dockerfile),
 * never from the monorepo. Their `package.json` is therefore the only thing
 * Docker's layer cache can key the install on. A floating `"*"` — or even a
 * caret range — never changes when a lib is published, so buildx happily
 * restores a months-old `node_modules` and compiles fresh source against a
 * stale lib. That failure looks like "has no exported member X" and is
 * thoroughly confusing, because the registry *does* have the export.
 *
 * An exact version changes the file on every release, which busts that layer,
 * and makes an image built from a given commit reproducible — rebuilding an old
 * commit installs the lib it was written against, so a rollback is a real
 * rollback.
 *
 * Run automatically by each lib's `npm run release`. `--check` fails instead of
 * writing, for CI.
 *
 *   node scripts/sync-lib-versions.mjs
 *   node scripts/sync-lib-versions.mjs --check
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_DIRS = ['apps/backend', 'apps/frontend', 'libs'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

const checkOnly = process.argv.includes('--check');

/** Every workspace package.json path, by convention `<group>/<name>/package.json`. */
const workspaces = () =>
  WORKSPACE_DIRS.flatMap((group) => {
    const groupPath = join(ROOT, group);
    if (!existsSync(groupPath)) {
      return [];
    }
    return readdirSync(groupPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(groupPath, entry.name, 'package.json'))
      .filter(existsSync);
  });

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const packages = workspaces().map((path) => ({ path, manifest: read(path) }));

// The libs are the publishable source of truth for their own version.
const libVersions = new Map(
  packages
    .filter(({ path }) => path.startsWith(join(ROOT, 'libs')))
    .map(({ manifest }) => [manifest.name, manifest.version])
);

if (libVersions.size === 0) {
  console.error('No libs/* packages found — nothing to sync.');
  process.exit(1);
}

const drifted = [];

for (const { path, manifest } of packages) {
  if (libVersions.has(manifest.name)) {
    continue; // a lib does not pin itself
  }

  let changed = false;
  for (const field of DEPENDENCY_FIELDS) {
    for (const [lib, version] of libVersions) {
      const current = manifest[field]?.[lib];
      if (current === undefined || current === version) {
        continue;
      }
      drifted.push(`${manifest.name}: ${lib} ${current} → ${version}`);
      manifest[field][lib] = version;
      changed = true;
    }
  }

  if (changed && !checkOnly) {
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

if (drifted.length === 0) {
  console.log('All workspaces already pin the current lib versions.');
  process.exit(0);
}

if (checkOnly) {
  console.error('Lib versions are out of sync — run `npm run sync:libs` and commit:');
  drifted.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}

console.log('Synced lib versions:');
drifted.forEach((line) => console.log(`  ${line}`));
console.log('\nCommit these package.json changes with the release.');
