import { createBundleBodySchema, startImportBodySchema } from '../../validation/bundleSchemas';

describe('createBundleBodySchema', () => {
  it('accepts name + groupId and trims', () => {
    expect(createBundleBodySchema.parse({ name: ' Paper set ', groupId: 'g1' })).toEqual({
      name: 'Paper set',
      groupId: 'g1',
    });
  });

  it('rejects missing fields', () => {
    expect(createBundleBodySchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(createBundleBodySchema.safeParse({ groupId: 'g1' }).success).toBe(false);
  });
});

describe('startImportBodySchema', () => {
  it('requires zipFileId', () => {
    expect(startImportBodySchema.parse({ zipFileId: 'label-bundles/b1/upload-1.zip' })).toEqual({
      zipFileId: 'label-bundles/b1/upload-1.zip',
    });
    expect(startImportBodySchema.safeParse({}).success).toBe(false);
  });
});
