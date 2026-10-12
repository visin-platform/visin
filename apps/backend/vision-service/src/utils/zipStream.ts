import { crc32 } from 'zlib';

/**
 * A zip written as it is read: entries are stored, not compressed (what goes in is PNG, which is already), each one
 * is followed by a data descriptor carrying its CRC and size, and the central directory comes last. The file never
 * exists in one piece, so a bundle of many frames costs one frame of memory.
 *
 * It is the classic format, not ZIP64: more than 65,535 entries or 4 GiB is an error rather than a corrupt file, and
 * callers keep bundles well under both.
 */
export interface ZipEntry {
  /** a relative path with `/` separators, no `..` and no leading slash */
  name: string;
  data: Buffer | AsyncIterable<Buffer | Uint8Array>;
  modified?: Date;
}

export interface ZipEntryInfo {
  size: number;
  crc32: number;
}

/** What a caller will not exceed; the format's own ceilings are the most it may be. */
export interface ZipLimits {
  entries?: number;
  /** bytes, for the whole archive and for any one entry */
  bytes?: number;
}

const MAX_32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;
const FLAGS = 0x0808; // bit 3: sizes follow the data; bit 11: names are UTF-8
const VERSION = 20;

const dosTime = (date: Date): { time: number; day: number } => ({
  time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
  day: (Math.max(date.getUTCFullYear(), 1980) - 1980) << 9 | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
});

/** Refuses a name that would escape the folder it is extracted into, or that no reader would agree on. */
export const safeZipName = (name: string): string => {
  const parts = name.split('/');
  if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`Not a safe zip entry name: ${JSON.stringify(name)}`);
  }
  if (Buffer.byteLength(name) > 0xffff) throw new Error('A zip entry name is too long');
  return name;
};

const localHeader = (name: Buffer, time: number, day: number): Buffer => {
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(FLAGS, 6);
  header.writeUInt16LE(0, 8); // stored
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(day, 12);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return header;
};

const dataDescriptor = (info: ZipEntryInfo): Buffer => {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(info.crc32, 4);
  descriptor.writeUInt32LE(info.size, 8);
  descriptor.writeUInt32LE(info.size, 12);
  return descriptor;
};

const centralHeader = (name: Buffer, info: ZipEntryInfo, time: number, day: number, offset: number): Buffer => {
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(VERSION, 6);
  header.writeUInt16LE(FLAGS, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(day, 14);
  header.writeUInt32LE(info.crc32, 16);
  header.writeUInt32LE(info.size, 20);
  header.writeUInt32LE(info.size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(offset, 42);
  name.copy(header, 46);
  return header;
};

/**
 * The zip's bytes, in order. `onEntry` is told each entry's size and CRC once it has been written. An error from an
 * entry's data ends the stream with that error, and the archive is left without its central directory: a reader sees
 * a broken file, never a complete-looking one that is missing a frame.
 */
export async function* zipStream(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  onEntry?: (name: string, info: ZipEntryInfo) => void,
  limits: ZipLimits = {}
): AsyncGenerator<Buffer> {
  const maxEntries = Math.min(limits.entries ?? MAX_ENTRIES, MAX_ENTRIES);
  const maxBytes = Math.min(limits.bytes ?? MAX_32, MAX_32);
  const directory: Buffer[] = [];
  let offset = 0;
  const written = (chunk: Buffer): Buffer => {
    offset += chunk.length;
    if (offset > maxBytes) throw new Error('A zip over 4 GiB needs ZIP64, which is not written here');
    return chunk;
  };

  for await (const entry of entries) {
    if (directory.length >= maxEntries) throw new Error('A zip over 65,535 entries needs ZIP64, which is not written here');
    const name = Buffer.from(safeZipName(entry.name), 'utf8');
    const { time, day } = dosTime(entry.modified ?? new Date());
    const start = offset;
    yield written(localHeader(name, time, day));

    let crc = 0;
    let size = 0;
    const chunks = Buffer.isBuffer(entry.data) ? [entry.data] : entry.data;
    for await (const chunk of chunks) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      crc = crc32(bytes, crc);
      size += bytes.length;
      yield written(bytes);
    }
    const info = { size, crc32: crc };
    yield written(dataDescriptor(info));
    directory.push(centralHeader(name, info, time, day, start));
    onEntry?.(entry.name, info);
  }

  const directoryOffset = offset;
  let directorySize = 0;
  for (const header of directory) {
    directorySize += header.length;
    yield written(header);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directory.length, 8);
  end.writeUInt16LE(directory.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(directoryOffset, 16);
  yield written(end);
}
