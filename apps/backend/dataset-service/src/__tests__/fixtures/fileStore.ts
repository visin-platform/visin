import { Readable } from 'stream';

/**
 * An in-memory stand-in for file-service, for `jest.mock` of the client:
 * files are kept as Buffers so a test can assert exactly what was stored.
 */
export const createFileStore = () => {
  const stored = new Map<string, Buffer>();
  return {
    stored,
    client: {
      getUploadUrl: jest.fn(async (fileId: string) => ({ url: `upload:${fileId}`, expiresMs: Date.now() + 60_000 })),
      getDownloadUrls: jest.fn(async (fileIds: string[]) => ({
        urls: Object.fromEntries(fileIds.map((fileId) => [fileId, `signed:${fileId}`])),
        expiresMs: Date.now() + 60_000
      })),
      putFile: jest.fn(async (fileId: string, data: Buffer) => {
        stored.set(fileId, Buffer.from(data));
      }),
      getFileStream: jest.fn(async (fileId: string) => {
        const data = stored.get(fileId);
        if (!data) throw new Error(`missing ${fileId}`);
        return Readable.from([data]);
      }),
      getFileSize: jest.fn(async (fileId: string) => stored.get(fileId)?.length ?? null),
      getFileRange: jest.fn(async (fileId: string, start: number, end: number) =>
        Readable.from([stored.get(fileId)!.subarray(start, end + 1)])
      ),
      deleteFile: jest.fn(async (fileId: string) => {
        stored.delete(fileId);
      }),
      deleteFiles: jest.fn(async (fileIds: string[]) => {
        for (const fileId of fileIds) stored.delete(fileId);
      }),
      deleteFolder: jest.fn(async (prefix: string) => {
        for (const fileId of [...stored.keys()]) if (fileId.startsWith(prefix)) stored.delete(fileId);
      })
    }
  };
};

/**
 * One store per test file. Mock the client with
 * `jest.mock('../../clients/fileServiceClient', () => jest.requireActual('../fixtures/fileStore').fileStore.client)`
 * — required inside the factory, since `jest.mock` is hoisted above imports.
 */
export const fileStore = createFileStore();
