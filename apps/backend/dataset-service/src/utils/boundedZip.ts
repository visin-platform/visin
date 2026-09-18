import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { getFileNameLowLevel, openPromise, ZipFile } from 'yauzl';

/** An archive limit violation cannot be repaired by retrying the same input. */
export class NonRetryableImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableImportError';
  }
}

export interface ZipLimits {
  entryBytes: number;
  expandedBytes: number;
  inputBytes: number;
  entries: number;
  directoryBytes: number;
}

export const DEFAULT_ZIP_LIMITS: Readonly<ZipLimits> = {
  entryBytes: 50 * 1024 * 1024,
  // Only entries an import actually reads count, so this bounds what a mapping
  // extracts rather than the size of the archive.
  expandedBytes: 50 * 1024 ** 3,
  inputBytes: 10 * 1024 ** 3,
  directoryBytes: 64 * 1024 * 1024,
  entries: 500_000
};

const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
};

export function importZipLimits(): ZipLimits {
  return {
    ...DEFAULT_ZIP_LIMITS,
    entryBytes: positiveInteger('DATASET_IMPORT_MAX_ENTRY_BYTES', DEFAULT_ZIP_LIMITS.entryBytes),
    entries: positiveInteger('DATASET_IMPORT_MAX_ENTRIES', DEFAULT_ZIP_LIMITS.entries)
  };
}

export interface ZipData {
  path: string;
  data: Buffer;
}

/**
 * Spool bounded compressed input, then read the central directory lazily.
 * Streaming unzip parsers can inflate queued entries while the caller stores an
 * earlier one; this reader opens the next entry only after the caller requests
 * it, and never opens one `shouldRead` declines — a mapping that takes only the
 * camera frames never decompresses the lidar next to them.
 */
export async function* readZipEntries(
  source: Readable,
  limits: ZipLimits,
  shouldRead: (path: string) => boolean,
  /** called as the zip is copied to disk, with the bytes copied so far */
  onInput?: (copiedBytes: number) => Promise<void>
): AsyncGenerator<ZipData> {
  let sourceError: Error | undefined;
  // The download may fail while the temporary directory is being created.
  source.on('error', (error) => {
    sourceError = error;
  });
  let directory: string | undefined;
  let archive: ZipFile | undefined;
  let active: Readable | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), 'visin-dataset-import-'));
    if (sourceError) throw sourceError;
    const filename = join(directory, 'archive.zip');
    let inputBytes = 0;
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          inputBytes += chunk.length;
          if (inputBytes > limits.inputBytes) {
            throw new NonRetryableImportError(`Zip input exceeds ${limits.inputBytes} bytes`);
          }
          await onInput?.(inputBytes);
          yield chunk;
        }
      },
      createWriteStream(filename, { flags: 'wx', mode: 0o600 })
    );
    // Decode names separately so per-file path diagnostics still apply.
    archive = await openPromise(filename, { autoClose: false, decodeStrings: false });
    if (archive.entryCount > limits.entries) {
      throw new NonRetryableImportError(`Zip exceeds ${limits.entries} entries`);
    }
    let expandedBytes = 0;
    let directoryBytes = 0;
    for await (const entry of archive.eachEntry()) {
      directoryBytes += 46 + entry.fileNameLength + entry.extraFieldLength + entry.fileCommentLength;
      if (directoryBytes > limits.directoryBytes) {
        throw new NonRetryableImportError(`Zip directory exceeds ${limits.directoryBytes} bytes`);
      }
      const path = getFileNameLowLevel(entry.generalPurposeBitFlag, entry.fileNameRaw, entry.extraFields, true);
      if (path.endsWith('/') || !shouldRead(path)) {
        continue;
      }
      active = await archive.openReadStreamPromise(entry);
      let entryBytes = 0;
      const chunks: Buffer[] = [];
      // Count actual output. Size claims in ZIP headers are not a resource limit.
      for await (const chunk of active as AsyncIterable<Buffer>) {
        entryBytes += chunk.length;
        expandedBytes += chunk.length;
        if (entryBytes > limits.entryBytes) {
          throw new NonRetryableImportError(`${path}: File exceeds ${limits.entryBytes} bytes`);
        }
        if (expandedBytes > limits.expandedBytes) {
          throw new NonRetryableImportError(`Zip expanded data exceeds ${limits.expandedBytes} bytes`);
        }
        chunks.push(chunk);
      }
      active = undefined;
      yield { path, data: Buffer.concat(chunks, entryBytes) };
    }
  } finally {
    active?.destroy();
    source.destroy();
    archive?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
