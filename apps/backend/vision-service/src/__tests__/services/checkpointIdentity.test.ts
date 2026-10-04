import { checkpointKey } from '../../services/checkpointIdentity';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';

describe('checkpointKey', () => {
  it('names a Hub checkpoint by repo, commit and file, and treats no file as an empty one', () => {
    expect(checkpointKey({ kind: 'hf', repo: 'Acme/CLFT', commit: COMMIT })).toBe(`hf:acme/clft@${COMMIT}:`);
    expect(checkpointKey({ kind: 'hf', repo: 'acme/clft', commit: COMMIT, path: 'best.safetensors' })).toBe(`hf:acme/clft@${COMMIT}:best.safetensors`);
  });

  it('names a local checkpoint by the digest of its weights alone, so its label and place do not matter', () => {
    const a = checkpointKey({ kind: 'local', sha256: 'a'.repeat(64), label: 'epoch 40' });
    expect(a).toBe(`sha256:${'a'.repeat(64)}`);
    expect(checkpointKey({ kind: 'local', sha256: 'a'.repeat(64), label: 'renamed' })).toBe(a);
    expect(checkpointKey({ kind: 'local', sha256: 'b'.repeat(64), label: 'epoch 40' })).not.toBe(a);
  });
});
