import { describe, it, expect } from 'vitest';
import { hubDatasetUrl, hubModelUrl, hubSpaceUrl, parseSpace, shortRevision } from './hubLinks';

describe('hubLinks', () => {
  it('links the repo at the exact commit, never at a branch', () => {
    expect(hubModelUrl({ repo: 'acme/clftv2-zod', revision: '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433' }))
      .toBe('https://huggingface.co/acme/clftv2-zod/tree/3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433');
  });

  it('shortens a commit to seven characters', () => {
    expect(shortRevision('3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433')).toBe('3f2a1c9');
  });

  it('links a dataset under /datasets, at its commit', () => {
    expect(hubDatasetUrl({ repo: 'acme/zod-png', revision: '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433' }))
      .toBe('https://huggingface.co/datasets/acme/zod-png/tree/3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433');
  });

  it('links a demo Space', () => {
    expect(hubSpaceUrl('acme/clft-demo')).toBe('https://huggingface.co/spaces/acme/clft-demo');
  });

  it('reads a Space from its id or its address, and refuses anything else', () => {
    expect(parseSpace(' acme/clft-demo ')).toBe('acme/clft-demo');
    expect(parseSpace('https://huggingface.co/spaces/acme/clft-demo/')).toBe('acme/clft-demo');
    expect(parseSpace('https://example.test/spaces/acme/clft-demo')).toBe('acme/clft-demo');
    for (const bad of ['', 'clft-demo', 'a/b/c', 'https://example.test/x', 'acme/']) expect(parseSpace(bad)).toBeNull();
  });
});
