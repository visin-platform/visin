import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'visin-mongo-setup-'));
const binary = join(directory, 'mongod');
writeFileSync(binary, `#!${process.execPath}\nconsole.log('db version v' + process.env.MONGOMS_VERSION);\n`, { mode: 0o755 });
after(() => rmSync(directory, { recursive: true, force: true }));

function run(overrides = {}, vmModules = true) {
  const env = { ...process.env };
  // Make each subprocess independent of the caller's MongoDB and Node options.
  for (const key of Object.keys(env)) if (key.startsWith('MONGOMS_') || key === 'NODE_OPTIONS') delete env[key];
  Object.assign(env, { MONGOMS_SYSTEM_BINARY: binary, MONGOMS_RUNTIME_DOWNLOAD: 'false' }, overrides);
  const setup = new URL('./jest-mongo-setup.mjs', import.meta.url).href;
  return spawnSync(process.execPath, [
    ...(vmModules ? ['--experimental-vm-modules'] : []),
    '--input-type=module', '-e',
    `import setup from ${JSON.stringify(setup)};
     await setup();
     console.log(JSON.stringify({ version: process.env.MONGOMS_VERSION,
       binary: process.env.MONGOMS_SYSTEM_BINARY, download: process.env.MONGOMS_RUNTIME_DOWNLOAD }));`
  ], { env, encoding: 'utf8', timeout: 10_000 });
}

test('prepares the pinned executable and disables worker downloads', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { version: '8.3.9', binary, download: 'false' });
});

test('applies an explicit version override to preparation and suites', () => {
  const result = run({ MONGOMS_VERSION: '8.3.8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).version, '8.3.8');
});

test('rejects missing VM support before touching the executable', () => {
  const result = run({ MONGOMS_SYSTEM_BINARY: join(directory, 'missing') }, false);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /These tests need node's --experimental-vm-modules flag/);
  assert.doesNotMatch(result.stderr, /Could not prepare MongoDB/);
});

test('reports a preparation failure once with its original cause', () => {
  const missing = join(directory, 'missing');
  const result = run({ MONGOMS_SYSTEM_BINARY: missing });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not prepare MongoDB 8\.3\.9 before starting Jest suites/);
  assert.ok(result.stderr.includes(missing));
  assert.equal(result.stdout, '');
});
