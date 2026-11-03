import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const cli = fileURLToPath(new URL('../node_modules/oxlint/bin/oxlint', import.meta.url));
const config = fileURLToPath(new URL('../apps/frontend/account-front/.oxlintrc.json', import.meta.url));
function lint(source, check) {
  const dir = mkdtempSync(join(tmpdir(), 'visin-lint-'));
  try {
    const file = join(dir, 'Example.tsx');
    writeFileSync(file, source);
    const result = spawnSync(process.execPath, [cli, '--config', config, file], { encoding: 'utf8' });
    check(result.status, result.stdout + result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('rejects literal colors and template colors', () =>
  lint(
    'export function Example() { return <div style={{ color: "#ff0000", boxShadow: `0 0 rgb(1, 2, 3)` }} />; }',
    (status, output) => {
      assert.notEqual(status, 0);
      assert.match(output, /visin\(no-color-literals\)/);
    }
  ));
test('accepts theme palette paths', () =>
  lint('export function Example() { return <div style={{ color: "text.primary" }} />; }', (status, output) =>
    assert.equal(status, 0, output)
  ));
test('preserves React hook ordering checks', () =>
  lint(
    'import { useState } from "react"; export function Example({ flag }: { flag: boolean }) { if (flag) useState(0); return null; }',
    (status, output) => {
      assert.notEqual(status, 0);
      assert.match(output, /rules-of-hooks/);
    }
  ));
test('preserves React refresh export boundaries', () =>
  lint('export const value = 42; export function Example() { return null; }', (status, output) => {
    assert.notEqual(status, 0);
    assert.match(output, /only-export-components/);
  }));
