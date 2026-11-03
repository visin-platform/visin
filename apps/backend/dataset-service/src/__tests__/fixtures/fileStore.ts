import { vi } from 'vitest';
import { Readable } from 'stream';

/**
 * An in-memory stand-in for file-service, for `vi.mock` of the client:
 * files are kept as Buffers so a test can assert exactly what was stored.
 */
export const createFileStore = () => {
  const stored = new Map<string, Buffer>();
  return {
    stored,
    client: {
      getUploadUrl: vi.fn(async function (fileId: string) {
        return { url: `upload:${fileId}`, expiresMs: Date.now() + 60_000 };
      }),
      getDownloadUrls: vi.fn(async function (fileIds: string[]) {
        return {
          urls: Object.fromEntries(fileIds.map((fileId) => [fileId, `signed:${fileId}`])),
          expiresMs: Date.now() + 60_000
        };
      }),
      putFile: vi.fn(async function (fileId: string, data: Buffer) {
        stored.set(fileId, Buffer.from(data));
      }),
      getFileStream: vi.fn(async function (fileId: string) {
        const data = stored.get(fileId);
        if (!data) throw new Error(`missing ${fileId}`);
        return Readable.from([data]);
      }),
      getFileSize: vi.fn(async function (fileId: string) {
        return stored.get(fileId)?.length ?? null;
      }),
      getFileRange: vi.fn(async function (fileId: string, start: number, end: number) {
        return Readable.from([stored.get(fileId)!.subarray(start, end + 1)]);
      }),
      deleteFile: vi.fn(async function (fileId: string) {
        stored.delete(fileId);
      }),
      deleteFiles: vi.fn(async function (fileIds: string[]) {
        for (const fileId of fileIds) stored.delete(fileId);
      }),
      deleteFolder: vi.fn(async function (prefix: string) {
        for (const fileId of [...stored.keys()]) if (fileId.startsWith(prefix)) stored.delete(fileId);
      })
    }
  };
};

/**
 * One store per test file. Mock the client with
 * `vi.mock('../../clients/fileServiceClient', () => vi.requireActual('../fixtures/fileStore').fileStore.client)`
 * — required inside the factory, since `vi.mock` is hoisted above imports.
 */
export const fileStore = createFileStore();
