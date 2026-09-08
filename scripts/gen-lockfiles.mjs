#!/usr/bin/env node
/**
 * Give every service and front its own `package-lock.json`, so its Docker build
 * can use `npm ci`.
 *
 * Why they cannot just be committed by hand: this is an npm workspace, so the
 * only lockfile `npm install` writes is the hoisted one at the root, describing
 * every workspace at once. A service's build context is its own directory and
 * never contains that file — which is why the Dockerfiles ran `npm i` and
 * resolved every range afresh on every build. Two builds of the same commit
 * could therefore install different code, and an image could not be rebuilt as
 * it shipped.
 *
 * Each lockfile is resolved in a scratch directory outside the workspace,
 * because npm walks up to the workspace root and would otherwise write the
 * hoisted lockfile again.
 *
 * These files describe published versions of `@visin/*`, so they go stale the
 * moment a library is published and consumers are re-pinned. `publish-libs.yml`
 * runs this straight after `sync-lib-versions.mjs` for that reason, and CI fails
 * on drift.
 *
 *   node scripts/gen-lockfiles.mjs          # write them
 *   node scripts/gen-lockfiles.mjs --check  # fail if any is out of step
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const targets = ['apps/backend', 'apps/frontend'].flatMap((group) =>
  readdirSync(join(ROOT, group), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(ROOT, group, e.name, 'package.json')))
    .map((e) => join(group, e.name))
);

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * What `npm ci` actually enforces: the lockfile's root entry must declare the
 * same dependency ranges the package.json does. Comparing that is deterministic,
 * where regenerating and diffing would report drift merely because the registry
 * gained a patch release matching an existing range.
 */
const inStep = (pkgPath, lockPath) => {
  if (!existsSync(lockPath)) return 'no lockfile';
  const pkg = read(pkgPath);
  const lock = read(lockPath);
  const rootEntry = lock.packages?.[''];
  if (!rootEntry) return 'lockfile has no root entry';
  for (const field of ['dependencies', 'devDependencies']) {
    const want = pkg[field] ?? {};
    const have = rootEntry[field] ?? {};
    for (const [name, range] of Object.entries(want)) {
      if (have[name] !== range) return `${name} is ${have[name] ?? 'absent'}, package.json says ${range}`;
    }
    for (const name of Object.keys(have)) {
      if (!(name in want)) return `${name} is in the lockfile but not package.json`;
    }
  }
  return null;
};

let stale = 0;
for (const rel of targets) {
  const dir = join(ROOT, rel);
  const pkgPath = join(dir, 'package.json');
  const lockPath = join(dir, 'package-lock.json');

  if (checkOnly) {
    const why = inStep(pkgPath, lockPath);
    console.log(`  ${why ? '✗' : '✓'} ${rel}${why ? ` — ${why}` : ''}`);
    if (why) stale++;
    continue;
  }

  const tmp = mkdtempSync(join(tmpdir(), 'visin-lock-'));
  try {
    copyFileSync(pkgPath, join(tmp, 'package.json'));
    execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
      cwd: tmp,
      stdio: 'pipe'
    });
    copyFileSync(join(tmp, 'package-lock.json'), lockPath);
    // A written-but-ignored lockfile is invisible until the image build fails,
    // and reads as "no lockfile" everywhere in between.
    let ignored = false;
    try {
      execFileSync('git', ['check-ignore', '-q', lockPath], { cwd: ROOT, stdio: 'pipe' });
      ignored = true;
    } catch {
      /* exit 1 means not ignored, which is what we want */
    }
    console.log(`  wrote ${rel}/package-lock.json${ignored ? '  ← IGNORED BY GIT, it will not be committed' : ''}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (checkOnly && stale) {
  console.error(`\n${stale} lockfile(s) out of step. Run: node scripts/gen-lockfiles.mjs`);
  process.exit(1);
}
if (checkOnly) console.log('\nAll lockfiles match their package.json.');
