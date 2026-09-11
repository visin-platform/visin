import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { getFileNameLowLevel, openPromise, ZipFile } from 'yauzl';

/** An archive limit violation cannot be repaired by retrying the same input. */
export class NonRetryableIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableIngestError';
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
  expandedBytes: 10 * 1024 ** 3,
  inputBytes: 10 * 1024 ** 3,
  directoryBytes: 16 * 1024 * 1024,
  entries: 100_000
};

export function ingestZipLimits(): ZipLimits {
  const limits = {
    ...DEFAULT_ZIP_LIMITS,
    entryBytes: Number(process.env.INGEST_MAX_ENTRY_BYTES || DEFAULT_ZIP_LIMITS.entryBytes),
    entries: Number(process.env.INGEST_MAX_ENTRIES || DEFAULT_ZIP_LIMITS.entries)
  };
  if (!Number.isSafeInteger(limits.entryBytes) || limits.entryBytes <= 0 ||
      !Number.isSafeInteger(limits.entries) || limits.entries <= 0) {
    throw new Error('INGEST_MAX_ENTRY_BYTES and INGEST_MAX_ENTRIES must be positive safe integers');
  }
  return limits;
}

export interface ZipData {
  path: string;
  type: string;
  data: Buffer;
}

/**
 * Spool bounded compressed input, then read the central directory lazily. Streaming
 * unzip parsers can inflate queued entries while the caller stores an earlier one;
 * this reader opens the next entry only after the caller requests it.
 */
export async function* readZipEntries(source: Readable, limits: ZipLimits, onInput?: () => Promise<void>): AsyncGenerator<ZipData> {
  let sourceError: Error | undefined;
  // The download may fail while the temporary directory is being created.
  source.on('error', error => { sourceError = error; });
  let directory: string | undefined;
  let archive: ZipFile | undefined;
  let active: Readable | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), 'visin-import-'));
    if (sourceError) throw sourceError;
    const filename = join(directory, 'archive.zip');
    let inputBytes = 0;
    await pipeline(source, async function* (chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        inputBytes += chunk.length;
        if (inputBytes > limits.inputBytes) {
          throw new NonRetryableIngestError(`Zip input exceeds ${limits.inputBytes} bytes`);
        }
        await onInput?.();
        yield chunk;
      }
    }, createWriteStream(filename, { flags: 'wx', mode: 0o600 }));
    // Decode names separately so existing per-file path diagnostics still apply.
    archive = await openPromise(filename, { autoClose: false, decodeStrings: false });
    if (archive.entryCount > limits.entries) {
      throw new NonRetryableIngestError(`Zip exceeds ${limits.entries} entries`);
    }
    let expandedBytes = 0;
    let directoryBytes = 0;
    for await (const entry of archive.eachEntry()) {
      // Names can survive in per-file diagnostics and metadata keys even when
      // payloads are empty. Bound these independently of expanded file bytes.
      directoryBytes += 46 + entry.fileNameLength + entry.extraFieldLength + entry.fileCommentLength;
      if (directoryBytes > limits.directoryBytes) {
        throw new NonRetryableIngestError(`Zip directory exceeds ${limits.directoryBytes} bytes`);
      }
      const path = getFileNameLowLevel(entry.generalPurposeBitFlag, entry.fileNameRaw, entry.extraFields, true);
      active = await archive.openReadStreamPromise(entry);
      let entryBytes = 0;
      const chunks: Buffer[] = [];
      // Count actual output, including ignored paths and directory payloads. Size
      // claims in ZIP headers are not a resource limit.
      for await (const chunk of active as AsyncIterable<Buffer>) {
        entryBytes += chunk.length;
        expandedBytes += chunk.length;
        if (entryBytes > limits.entryBytes) {
          throw new NonRetryableIngestError(`${path}: File exceeds ${limits.entryBytes} bytes`);
        }
        if (expandedBytes > limits.expandedBytes) {
          throw new NonRetryableIngestError(`Zip expanded data exceeds ${limits.expandedBytes} bytes`);
        }
        chunks.push(chunk);
      }
      active = undefined;
      yield { path, type: path.endsWith('/') ? 'Directory' : 'File', data: Buffer.concat(chunks, entryBytes) };
    }
  } finally {
    active?.destroy();
    source.destroy();
    archive?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
