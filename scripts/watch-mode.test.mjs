import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('Node watch mode restarts when an imported TypeScript dependency changes', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'visin-watch-'));
  const dependency = join(dir, 'dependency.ts');
  writeFileSync(dependency, 'export const value = "first";\n');
  const entry = join(dir, 'entry.cjs');
  writeFileSync(entry, 'console.log(require("./dependency.ts").value); setInterval(() => {}, 1000);\n');
  const cwd = fileURLToPath(new URL('../apps/backend/auth-service/', import.meta.url));
  const child = spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', '-r', 'ts-node/register', entry], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  let changed = false;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Watch mode did not restart: ${output}`)), 12000);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Watcher exited ${code}: ${output}`));
      });
      child.stderr.on('data', (data) => {
        output += data;
      });
      child.stdout.on('data', (data) => {
        output += data;
        if (!changed && output.includes('first')) {
          changed = true;
          // Let Node finish registering the dependency before changing it.
          setTimeout(() => writeFileSync(dependency, 'export const value = "second";\n'), 200);
        }
        if (output.includes('second')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    assert.ok(changed);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('close', resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
