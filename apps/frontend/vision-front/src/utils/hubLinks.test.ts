import { beforeEach, describe, it, expect, vi } from 'vitest';

const getGlobalConfig = vi.hoisted(() => vi.fn());
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig }));

import { hubDatasetUrl, hubModelUrl, hubSpaceUrl, parseSpace, shortRevision } from './hubLinks';

describe('hubLinks', () => {
  beforeEach(() => {
    getGlobalConfig.mockReset();
    getGlobalConfig.mockReturnValue({});
  });

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

  it('opens a model inside its repo: a file as a blob, a folder as a tree', () => {
    const revision = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
    expect(hubModelUrl({ repo: 'acme/m', revision, path: 'checkpoints/epoch 12.pth' }))
      .toBe(`https://huggingface.co/acme/m/blob/${revision}/checkpoints/epoch%2012.pth`);
    expect(hubModelUrl({ repo: 'acme/m', revision, path: 'checkpoints/best' }))
      .toBe(`https://huggingface.co/acme/m/tree/${revision}/checkpoints/best`);
  });

  it('points at this deployment’s Hub when one is configured, and at the public Hub before config loads', () => {
    const revision = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
    getGlobalConfig.mockReturnValue({ HF_ENDPOINT: 'https://hub.example.test/' });
    expect(hubModelUrl({ repo: 'acme/m', revision })).toBe(`https://hub.example.test/acme/m/tree/${revision}`);
    expect(hubDatasetUrl({ repo: 'acme/d', revision })).toBe(`https://hub.example.test/datasets/acme/d/tree/${revision}`);
    expect(hubSpaceUrl('acme/demo')).toBe('https://hub.example.test/spaces/acme/demo');

    getGlobalConfig.mockReturnValue({ HF_ENDPOINT: '  ' });
    expect(hubSpaceUrl('acme/demo')).toBe('https://huggingface.co/spaces/acme/demo');
    getGlobalConfig.mockImplementation(() => {
      throw new Error('not loaded');
    });
    expect(hubSpaceUrl('acme/demo')).toBe('https://huggingface.co/spaces/acme/demo');
  });
});
