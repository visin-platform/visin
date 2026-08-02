import {
  createBundleBodySchema,
  importMappingSchema,
  previewImportBodySchema,
  updateBundleBodySchema,
  startImportBodySchema,
} from '../../validation/bundleSchemas';

describe('createBundleBodySchema', () => {
  it('accepts name + groupId and trims', () => {
    expect(createBundleBodySchema.parse({ name: ' Paper set ', groupId: 'g1' })).toEqual({
      name: 'Paper set',
      groupId: 'g1',
    });
  });

  it('takes an optional description', () => {
    expect(createBundleBodySchema.parse({ name: 'B', groupId: 'g1', description: ' from zod_temp ' })).toEqual({
      name: 'B',
      groupId: 'g1',
      description: 'from zod_temp',
    });
  });

  it('rejects missing fields', () => {
    expect(createBundleBodySchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(createBundleBodySchema.safeParse({ groupId: 'g1' }).success).toBe(false);
  });
});

describe('updateBundleBodySchema', () => {
  it('accepts either field alone and trims', () => {
    expect(updateBundleBodySchema.parse({ name: ' Renamed ' })).toEqual({ name: 'Renamed' });
    expect(updateBundleBodySchema.parse({ description: ' notes ' })).toEqual({ description: 'notes' });
    expect(updateBundleBodySchema.parse({ description: '' })).toEqual({ description: '' }); // clears it
  });

  it('rejects an empty patch, a blank name, and over-long text', () => {
    expect(updateBundleBodySchema.safeParse({}).success).toBe(false);
    expect(updateBundleBodySchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(updateBundleBodySchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);
    expect(updateBundleBodySchema.safeParse({ description: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('previewImportBodySchema', () => {
  it('requires zipFileId', () => {
    expect(previewImportBodySchema.parse({ zipFileId: ' z.zip ' })).toEqual({ zipFileId: 'z.zip' });
    expect(previewImportBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('importMappingSchema', () => {
  it('accepts a full mapping and trims paths', () => {
    expect(
      importMappingSchema.parse({
        frames: ' run7/img ',
        annotations: [{ path: ' run7/seg ', set: ' sam ' }],
        manifest: 'run7/list.csv',
        idsSuffix: '_id.png',
        masksSuffix: '_meta.json',
      })
    ).toEqual({
      frames: 'run7/img',
      annotations: [{ path: 'run7/seg', set: 'sam' }],
      manifest: 'run7/list.csv',
      idsSuffix: '_id.png',
      masksSuffix: '_meta.json',
    });
  });

  it('allows frames at the zip root but nothing else empty', () => {
    expect(importMappingSchema.parse({ frames: '' })).toEqual({ frames: '' });
    expect(importMappingSchema.safeParse({}).success).toBe(false);
    expect(importMappingSchema.safeParse({ frames: 'img', annotations: [{ path: '', set: 'a' }] }).success).toBe(false);
    expect(importMappingSchema.safeParse({ frames: 'img', annotations: [{ path: 'p', set: '' }] }).success).toBe(false);
    expect(importMappingSchema.safeParse({ frames: 'img', idsSuffix: '' }).success).toBe(false);
  });
});

describe('startImportBodySchema', () => {
  it('requires zipFileId and takes an optional mapping', () => {
    expect(startImportBodySchema.parse({ zipFileId: 'label-bundles/b1/upload-1.zip' })).toEqual({
      zipFileId: 'label-bundles/b1/upload-1.zip',
    });
    expect(
      startImportBodySchema.parse({ zipFileId: 'z.zip', mapping: { frames: 'img' } }).mapping
    ).toEqual({ frames: 'img' });
    expect(startImportBodySchema.safeParse({}).success).toBe(false);
    expect(startImportBodySchema.safeParse({ zipFileId: 'z.zip', mapping: {} }).success).toBe(false);
  });
});
