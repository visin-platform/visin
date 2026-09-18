import { PassThrough } from 'stream';
import unzipper from 'unzipper';
import * as files from '../clients/fileServiceClient';
import type { ZipIndexEntry } from './contents';

interface CentralDirectoryEntry {
  path: string;
  type: 'File' | 'Directory';
  uncompressedSize: number;
}

/**
 * Entry names and sizes of a stored zip, read from its central directory — the
 * index at the tail of the archive — through byte-range requests. Nothing is
 * decompressed and the archive is never downloaded whole, so a multi-GB zip
 * answers in the time it takes to fetch its index.
 */
export const readZipIndex = async (fileId: string, size: number): Promise<ZipIndexEntry[]> => {
  const archive = await unzipper.Open.custom({
    size: async () => size,
    stream: (offset: number, length?: number) => {
      const start = offset < 0 ? Math.max(size + offset, 0) : offset;
      const end = length ? start + length - 1 : size - 1;
      const passThrough = new PassThrough();
      files
        .getFileRange(fileId, start, end)
        .then((stream) => {
          // An unforwarded source error would be an unhandled 'error' event —
          // a crashed process rather than a failed request.
          stream.on('error', (err) => passThrough.destroy(err));
          stream.pipe(passThrough);
        })
        .catch((err: Error) => passThrough.destroy(err));
      return passThrough;
    }
  });

  return (archive.files as unknown as CentralDirectoryEntry[])
    .filter((entry) => entry.type === 'File')
    .map((entry) => ({ path: entry.path, size: entry.uncompressedSize }));
};
