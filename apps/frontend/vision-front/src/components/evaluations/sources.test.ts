import { describe, expect, it } from 'vitest';
import { checkpointFormComplete, checkpointForms } from './checkpointForms';
import { checkpointLabel, checkpointSource, checkpointSources, describeData } from './sources';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';

describe('checkpoint sources', () => {
  it('have a view and a form for the same kinds', () => {
    expect(Object.keys(checkpointSources).sort()).toEqual(Object.keys(checkpointForms).sort());
  });

  it('read a Hub checkpoint as a link to its pinned commit, and a local one as a label with its digest', () => {
    const hub = { kind: 'hf', repo: 'acme/clft', commit: COMMIT, path: 'best.safetensors' } as const;
    const local = { kind: 'local', sha256: 'a'.repeat(64), label: 'clftv2-e40' } as const;
    expect(checkpointLabel(hub)).toBe('acme/clft @ 3f2a1c9 · best.safetensors');
    expect(checkpointSource(hub).href?.(hub)).toBe(`https://huggingface.co/acme/clft/blob/${COMMIT}/best.safetensors`);
    expect(checkpointSource(hub).detail).toBeUndefined();
    expect(checkpointLabel(local)).toBe('clftv2-e40');
    expect(checkpointSource(local).href).toBeUndefined();
    expect(checkpointSource(local).detail?.(local)).toBe(`sha256 ${'a'.repeat(64)}`);
    expect(checkpointSource(local).note).toBe('Held outside Visin');
    expect(checkpointLabel(undefined)).toBe('Unknown checkpoint');
  });
});

describe('describeData', () => {
  it('names each kind of data by what pins it, with a short commit unless the whole is asked for', () => {
    expect(describeData({ kind: 'hf', repo: 'acme/frames', commit: COMMIT })).toBe('Hub dataset acme/frames @ 3f2a1c9');
    expect(describeData({ kind: 'hf', repo: 'acme/frames', commit: COMMIT }, { full: true })).toBe(`Hub dataset acme/frames @ ${COMMIT}`);
    expect(describeData({ kind: 'external', label: 'Road frames', manifestSha256: 'b'.repeat(64) })).toBe('Road frames');
    expect(describeData({ kind: 'external', manifestSha256: 'b'.repeat(64) })).toBe(`Sample manifest ${'b'.repeat(64)}`);
    expect(describeData({ kind: 'external' })).toBe('External data');
    expect(describeData({ kind: 'visin', datasetId: 'd1' })).toBe('Visin dataset d1');
    expect(describeData({ kind: 'visin', archiveSha256: 'c'.repeat(64) })).toBe(`Visin dataset archive ${'c'.repeat(64)}`);
    expect(describeData({ kind: 'visin' })).toBe('A Visin dataset');
  });
});

describe('checkpoint forms', () => {
  it('build the checkpoint each kind describes, leaving out an empty optional field', () => {
    expect(checkpointForms.local.build({ sha256: ' abc ', label: ' x ' })).toEqual({ kind: 'local', sha256: 'abc', label: 'x' });
    expect(checkpointForms.hf.build({ repo: 'a/b', commit: COMMIT, path: ' ' })).toEqual({ kind: 'hf', repo: 'a/b', commit: COMMIT });
    expect(checkpointForms.hf.build({ repo: 'a/b', commit: COMMIT, path: 'w.pt' })).toMatchObject({ path: 'w.pt' });
  });

  it('are complete only when every required answer is given', () => {
    expect(checkpointFormComplete('local', { sha256: 'a' })).toBe(false);
    expect(checkpointFormComplete('local', { sha256: 'a', label: 'x' })).toBe(true);
    expect(checkpointFormComplete('hf', { repo: 'a/b', commit: '' })).toBe(false);
    expect(checkpointFormComplete('hf', { repo: 'a/b', commit: COMMIT })).toBe(true);
  });
});
