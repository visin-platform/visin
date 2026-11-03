import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const script = fileURLToPath(new URL('./release.mjs', import.meta.url));
function fixture(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'visin-release-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release@example.test');
    git('remote', 'add', 'origin', 'https://github.com/visin-platform/visin.git');
    const pkg = {
      name: 'release-fixture',
      version: '1.2.3',
      repository: 'https://github.com/visin-platform/visin.git'
    };
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg));
    writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify({ version: '1.2.3', packages: { '': { ...pkg } } }));
    writeFileSync(join(cwd, 'CHANGELOG.md'), '# Visin Changelog\n\nExisting history\n');
    mkdirSync(join(cwd, '.github'));
    writeFileSync(
      join(cwd, '.github/.versionrc.json'),
      JSON.stringify({
        header: '# Visin Changelog',
        types: [
          { type: 'feat', section: 'Features' },
          { type: 'chore', section: 'Chores', hidden: false }
        ]
      })
    );
    git('add', '.');
    git('commit', '-qm', 'chore: initial');
    git('tag', 'v1.2.3');
    const release = (...args) => execFileSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
    const read = (file) => readFileSync(join(cwd, file), 'utf8');
    run({ cwd, git, release, read });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
test('conventional feature commits bump minor, preserve history and create a release tag', () =>
  fixture(({ git, release, read }) => {
    git('commit', '--allow-empty', '-qm', 'feat: add widgets');
    release();
    assert.equal(JSON.parse(read('package.json')).version, '1.3.0');
    assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, '1.3.0');
    assert.match(read('CHANGELOG.md'), /Features[\s\S]*add widgets/);
    assert.match(read('CHANGELOG.md'), /Existing history/);
    assert.equal(git('rev-parse', 'v1.3.0^{}'), git('rev-parse', 'HEAD'));
  }));
test('breaking commits recommend a major; dry run does not write, commit or tag', () =>
  fixture(({ git, release, read }) => {
    git('commit', '--allow-empty', '-qm', 'feat!: change protocol');
    const before = read('package.json');
    const head = git('rev-parse', 'HEAD');
    assert.match(release('--dry-run'), /1\.2\.3 → 2\.0\.0/);
    assert.equal(read('package.json'), before);
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.equal(git('tag', '--list'), 'v1.2.3');
  }));
test('library mode updates versions without changing history, changelog or tags', () =>
  fixture(({ git, release, read }) => {
    const head = git('rev-parse', 'HEAD');
    const changelog = read('CHANGELOG.md');
    release('--library', '--release-as', 'patch');
    assert.equal(JSON.parse(read('package.json')).version, '1.2.4');
    assert.equal(JSON.parse(read('package-lock.json')).version, '1.2.4');
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.equal(read('CHANGELOG.md'), changelog);
    assert.equal(git('tag', '--list'), 'v1.2.3');
  }));
test('library prereleases advance the beta identifier', () =>
  fixture(({ release, read }) => {
    release('--library', '--release-as', 'patch', '--prerelease', 'beta');
    assert.equal(JSON.parse(read('package.json')).version, '1.2.4-beta.0');
    release('--library', '--release-as', 'patch', '--prerelease', 'beta');
    assert.equal(JSON.parse(read('package.json')).version, '1.2.4-beta.1');
  }));
