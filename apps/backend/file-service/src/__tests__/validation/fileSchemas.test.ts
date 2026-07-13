import {
  deleteFolderBodySchema,
  listFilesQuerySchema,
  generateUploadUrlBodySchema,
  generateDownloadUrlBodySchema,
} from '../../validation/fileSchemas';

describe('fileSchemas', () => {
  it('deleteFolderBodySchema requires a non-empty prefix', () => {
    expect(deleteFolderBodySchema.safeParse({ prefix: 'grp/alb' }).success).toBe(true);
    expect(deleteFolderBodySchema.safeParse({ prefix: '' }).success).toBe(false);
    expect(deleteFolderBodySchema.safeParse({}).success).toBe(false);
  });

  it('listFilesQuerySchema coerces maxKeys and defaults it to 1000', () => {
    expect(listFilesQuerySchema.parse({})).toEqual({ maxKeys: 1000 });
    expect(listFilesQuerySchema.parse({ prefix: 'a', maxKeys: '25' })).toEqual({
      prefix: 'a',
      maxKeys: 25,
    });
    expect(listFilesQuerySchema.safeParse({ maxKeys: '-1' }).success).toBe(false);
  });

  it('generateUploadUrlBodySchema requires fileId and defaults expiry to 15 minutes', () => {
    expect(generateUploadUrlBodySchema.parse({ fileId: 'f.jpg' })).toEqual({
      fileId: 'f.jpg',
      expiresInMinutes: 15,
    });
    expect(generateUploadUrlBodySchema.safeParse({}).success).toBe(false);
    expect(
      generateUploadUrlBodySchema.parse({ fileId: 'f.jpg', mimetype: 'image/jpeg', expiresInMinutes: '5' })
    ).toEqual({ fileId: 'f.jpg', mimetype: 'image/jpeg', expiresInMinutes: 5 });
  });

  it('generateDownloadUrlBodySchema requires fileId and defaults expiry to 60 minutes', () => {
    expect(generateDownloadUrlBodySchema.parse({ fileId: 'f.jpg' })).toEqual({
      fileId: 'f.jpg',
      expiresInMinutes: 60,
    });
    expect(generateDownloadUrlBodySchema.safeParse({ fileId: '' }).success).toBe(false);
  });
});
