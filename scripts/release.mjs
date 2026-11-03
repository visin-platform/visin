#!/usr/bin/env node
// Local release orchestration: never publishes or pushes. CI owns those steps.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { Bumper } from 'conventional-recommended-bump';
import { ConventionalChangelog } from 'conventional-changelog';

const { values } = parseArgs({
  options: {
    'release-as': { type: 'string' },
    prerelease: { type: 'string' },
    library: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false }
  }
});
const cwd = process.cwd();
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
let increment = values['release-as'];
if (!increment) {
  const bumper = new Bumper(cwd).loadPreset('conventionalcommits').tag({ prefix: 'v' });
  if (values.library) {
    // Match the publish workflow: only commits touching this library since its
    // last version change contribute to the recommendation.
    const base = git('log', '-1', '--format=%H', '-G"version"', '--', 'package.json');
    bumper.commits({ from: base || undefined, path: '.' });
  }
  increment = (await bumper.bump()).releaseType || 'patch';
}
let version = semver.valid(increment) || semver.inc(manifest.version, increment);
if (values.prerelease) {
  version = semver.prerelease(manifest.version)
    ? semver.inc(manifest.version, 'prerelease', values.prerelease)
    : semver.valid(`${version}-${values.prerelease}.0`);
}
if (!version || !semver.gt(version, manifest.version))
  throw new Error(`Invalid release ${increment}: must increase ${manifest.version}`);
let changelog;
if (!values.library) {
  const configFile = resolve('.github/.versionrc.json');
  const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
  const generator = new ConventionalChangelog(cwd)
    .loadPreset({ name: 'conventionalcommits', types: config.types })
    .package({ ...manifest, version })
    .readRepository()
    .context({ version, currentTag: `v${version}` })
    .tags({ prefix: 'v' });
  let entry = '';
  for await (const chunk of generator.writeStream()) entry += chunk;
  const previous = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8').replace(/^# [^\n]*\n\s*/, '') : '';
  changelog = `${config.header || '# Changelog'}\n\n${entry.trim()}\n\n${previous}`;
}
console.log(`${manifest.name}: ${manifest.version} → ${version}${values['dry-run'] ? ' (dry run)' : ''}`);
if (values['dry-run']) {
  if (changelog) console.log(changelog);
} else {
  manifest.version = version;
  writeFileSync('package.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const changed = ['package.json'];
  if (existsSync('package-lock.json')) {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
    changed.push('package-lock.json');
  }
  if (changelog) {
    writeFileSync('CHANGELOG.md', changelog);
    changed.push('CHANGELOG.md');
    git('add', '--', ...changed);
    git('commit', '-m', `chore(release): ${version}`, '--', ...changed);
    git('tag', '-a', `v${version}`, '-m', `chore(release): ${version}`);
  }
}
