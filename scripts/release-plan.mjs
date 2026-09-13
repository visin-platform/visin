#!/usr/bin/env node
/**
 * Decides what a release has to publish, for .github/workflows/release.yml.
 *
 *   node scripts/release-plan.mjs libs
 *     JSON array of the libs/* packages with publishable changes since their
 *     version last changed, e.g. ["frontend-core"].
 *
 *   node scripts/release-plan.mjs services <from> <to>
 *     { "changed": [...], "unchanged": [...] } over every app with a Dockerfile,
 *     comparing two refs — normally the previous v* tag and the new one.
 *
 * "Publishable" leaves out what never reaches a package or an image: unit tests,
 * end-to-end suites and Markdown. A change to those alone republishes nothing.
 * Everything else counts, package.json and lockfiles included — which is how a
 * library release reaches its consumers: re-pinning them changes their files, so
 * the release rebuilds them against it.
 *
 * JSON goes to stdout for the workflow; the reasons go to stderr for the log.
 */
import { execFileSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

const NOT_PUBLISHED = [/(^|\/)__tests__\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /(^|\/)e2e\//, /\.md$/i];

const publishable = (file) => !NOT_PUBLISHED.some((pattern) => pattern.test(file));

const changedFiles = (from, to, dir) =>
  git('diff', '--name-only', from, to, '--', dir).split('\n').filter(Boolean).filter(publishable);

/** Directory names under `group` that contain `marker`, sorted. */
const dirsWith = (group, marker) =>
  readdirSync(join(ROOT, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, group, entry.name, marker)))
    .map((entry) => entry.name)
    .sort();

const describe = (files) => `${files.length} file(s): ${files.slice(0, 5).join(', ')}${files.length > 5 ? ', …' : ''}`;

function libs() {
  return dirsWith('libs', 'package.json').filter((lib) => {
    const dir = `libs/${lib}`;
    // The last commit that touched the version line is the last release; what
    // changed after it is what the next release would ship. Same base the
    // publish workflow uses to derive the bump.
    const base = git('log', '-1', '--format=%H', '-G"version"', '--', `${dir}/package.json`);
    const files = base ? changedFiles(base, 'HEAD', dir) : [`${dir} (never released)`];
    console.error(files.length ? `${lib}: release — ${describe(files)}` : `${lib}: nothing to publish`);
    return files.length > 0;
  });
}

function services(from, to) {
  const apps = ['apps/backend', 'apps/frontend'].flatMap((group) =>
    dirsWith(group, 'Dockerfile').map((name) => ({ name, dir: `${group}/${name}` }))
  );
  const plan = { changed: [], unchanged: [] };
  for (const app of apps) {
    const files = changedFiles(from, to, app.dir);
    console.error(files.length ? `${app.name}: build — ${describe(files)}` : `${app.name}: unchanged`);
    plan[files.length ? 'changed' : 'unchanged'].push(app.name);
  }
  return plan;
}

const [command, ...args] = process.argv.slice(2);

if (command === 'libs' && args.length === 0) {
  console.log(JSON.stringify(libs()));
} else if (command === 'services' && args.length === 2) {
  console.log(JSON.stringify(services(args[0], args[1])));
} else {
  console.error('usage: release-plan.mjs libs\n       release-plan.mjs services <from-ref> <to-ref>');
  process.exit(2);
}
