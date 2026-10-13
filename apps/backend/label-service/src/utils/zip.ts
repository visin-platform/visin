import { open } from 'node:fs/promises';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import type { Writable } from 'node:stream';
import { BadRequestError } from '@visin/backend-core';
import { crc32 } from './crc32';

/**
 * A small ZIP reader and writer on `node:zlib`.
 *
 * Exports stream out as a zip and imports arrive as one; neither is worth a
 * dependency that label-service would have to pin in its own lockfile. Only what
 * those two need is here: stored and deflated entries, UTF-8 names, ZIP64 only
 * for an entry *count* past 65,534 (sizes and offsets stay under 4 GiB), and no
 * encryption.
 */

/** Per-entry and whole-archive ceilings, so a hostile import cannot inflate without bound. */
export const ZIP_LIMITS = {
  entries: 200_000,
  entryBytes: 64 * 1024 * 1024,
  totalBytes: 2 * 1024 * 1024 * 1024
};

export interface ZipEntry {
  name: string;
  size: number;
  compressedSize: number;
  method: number;
  crc: number;
  offset: number;
}

export interface ZipArchive {
  entries: ZipEntry[];
  read: (entry: ZipEntry) => Promise<Buffer>;
  close: () => Promise<void>;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_RECORD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

export const openZip = async (path: string, limits = ZIP_LIMITS): Promise<ZipArchive> => {
  const file = await open(path, 'r');
  const close = (): Promise<void> => file.close();
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLength);
    await file.read(tail, 0, tailLength, size - tailLength);
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new BadRequestError('Not a zip archive');

    let count = tail.readUInt16LE(eocd + 10);
    let directorySize = tail.readUInt32LE(eocd + 12);
    let directoryOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
      // ZIP64: the real numbers are in a record the locator right before the EOCD points at.
      if (eocd < 20 || tail.readUInt32LE(eocd - 20) !== ZIP64_LOCATOR_SIGNATURE) {
        throw new BadRequestError('The zip directory is corrupt');
      }
      const recordOffset = Number(tail.readBigUInt64LE(eocd - 20 + 8));
      const record = Buffer.alloc(56);
      await file.read(record, 0, 56, recordOffset);
      if (record.readUInt32LE(0) !== ZIP64_RECORD_SIGNATURE) throw new BadRequestError('The zip directory is corrupt');
      count = Number(record.readBigUInt64LE(32));
      directorySize = Number(record.readBigUInt64LE(40));
      directoryOffset = Number(record.readBigUInt64LE(48));
      if (directoryOffset > 0xfffffff0) throw new BadRequestError('ZIP64 archives of that size are not supported');
    }
    if (count > limits.entries) throw new BadRequestError(`The archive has more than ${limits.entries} entries`);
    if (directoryOffset + directorySize > size) throw new BadRequestError('The zip is truncated');

    const directory = Buffer.alloc(directorySize);
    await file.read(directory, 0, directorySize, directoryOffset);
    const entries: ZipEntry[] = [];
    let total = 0;
    for (let pos = 0, i = 0; i < count; i++) {
      if (pos + 46 > directory.length || directory.readUInt32LE(pos) !== CENTRAL_SIGNATURE) {
        throw new BadRequestError('The zip directory is corrupt');
      }
      const flags = directory.readUInt16LE(pos + 8);
      const nameLength = directory.readUInt16LE(pos + 28);
      const extraLength = directory.readUInt16LE(pos + 30);
      const commentLength = directory.readUInt16LE(pos + 32);
      const entry: ZipEntry = {
        name: directory.toString('utf8', pos + 46, pos + 46 + nameLength),
        method: directory.readUInt16LE(pos + 10),
        crc: directory.readUInt32LE(pos + 16),
        compressedSize: directory.readUInt32LE(pos + 20),
        size: directory.readUInt32LE(pos + 24),
        offset: directory.readUInt32LE(pos + 42)
      };
      if (flags & 1) throw new BadRequestError('Encrypted zips are not supported');
      total += entry.size;
      if (total > limits.totalBytes) throw new BadRequestError('The archive expands to more than it may');
      entries.push(entry);
      pos += 46 + nameLength + extraLength + commentLength;
    }

    const read = async (entry: ZipEntry): Promise<Buffer> => {
      if (entry.size > limits.entryBytes) {
        throw new BadRequestError(`"${entry.name}" is larger than a single file may be`);
      }
      const local = Buffer.alloc(30);
      await file.read(local, 0, 30, entry.offset);
      if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new BadRequestError('The zip is corrupt');
      const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const packed = Buffer.alloc(entry.compressedSize);
      await file.read(packed, 0, entry.compressedSize, start);
      let data: Buffer;
      if (entry.method === 0) data = packed;
      else if (entry.method === 8) {
        try {
          data = inflateRawSync(packed, { maxOutputLength: entry.size + 1 });
        } catch {
          throw new BadRequestError(`"${entry.name}" is corrupt`);
        }
      } else throw new BadRequestError(`"${entry.name}" uses an unsupported compression method`);
      if (data.length !== entry.size || crc32(data) !== entry.crc) {
        throw new BadRequestError(`"${entry.name}" is corrupt`);
      }
      return data;
    };

    return { entries, read, close };
  } catch (error) {
    await close();
    throw error;
  }
};

interface Written {
  name: Buffer;
  crc: number;
  size: number;
  compressedSize: number;
  method: number;
  offset: number;
}

const dosDateTime = (date: Date): { time: number; day: number } => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
});

const write = (stream: Writable, chunk: Buffer): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    stream.once('error', onError);
    const done = (): void => {
      stream.off('error', onError);
      resolve();
    };
    if (stream.write(chunk)) done();
    else stream.once('drain', done);
  });

/** Streams entries into `out` one at a time, so an export is never held in memory whole. */
export class ZipWriter {
  private readonly written: Written[] = [];
  private offset = 0;

  constructor(private readonly out: Writable) {}

  async add(name: string, content: Buffer | string): Promise<void> {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    // Images are already compressed; deflating them again only costs the Pi CPU.
    const stored = /\.(png|jpe?g|webp)$/i.test(name);
    const packed = stored ? data : deflateRawSync(data);
    const method = stored || packed.length >= data.length ? 0 : 8;
    const body = method === 0 ? data : packed;
    const nameBytes = Buffer.from(name, 'utf8');
    const { time, day } = dosDateTime(new Date());

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_SIGNATURE, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(day, 12);
    const crc = crc32(data);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);

    if (this.offset + 30 + nameBytes.length + body.length > 0xfffffff0) {
      throw new Error('Export is larger than a zip without ZIP64 can hold');
    }
    this.written.push({ name: nameBytes, crc, size: data.length, compressedSize: body.length, method, offset: this.offset });
    await write(this.out, Buffer.concat([header, nameBytes]));
    await write(this.out, body);
    this.offset += 30 + nameBytes.length + body.length;
  }

  async finish(): Promise<void> {
    const { time, day } = dosDateTime(new Date());
    let directorySize = 0;
    for (const entry of this.written) {
      const record = Buffer.alloc(46);
      record.writeUInt32LE(CENTRAL_SIGNATURE, 0);
      record.writeUInt16LE(20, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(0x0800, 8);
      record.writeUInt16LE(entry.method, 10);
      record.writeUInt16LE(time, 12);
      record.writeUInt16LE(day, 14);
      record.writeUInt32LE(entry.crc, 16);
      record.writeUInt32LE(entry.compressedSize, 20);
      record.writeUInt32LE(entry.size, 24);
      record.writeUInt16LE(entry.name.length, 28);
      record.writeUInt32LE(entry.offset, 42);
      await write(this.out, Buffer.concat([record, entry.name]));
      directorySize += 46 + entry.name.length;
    }
    const many = this.written.length >= 0xffff;
    if (many) {
      const record = Buffer.alloc(56);
      record.writeUInt32LE(ZIP64_RECORD_SIGNATURE, 0);
      record.writeBigUInt64LE(44n, 4); // size of the rest of this record
      record.writeUInt16LE(45, 12);
      record.writeUInt16LE(45, 14);
      record.writeBigUInt64LE(BigInt(this.written.length), 24);
      record.writeBigUInt64LE(BigInt(this.written.length), 32);
      record.writeBigUInt64LE(BigInt(directorySize), 40);
      record.writeBigUInt64LE(BigInt(this.offset), 48);
      const locator = Buffer.alloc(20);
      locator.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, 0);
      locator.writeBigUInt64LE(BigInt(this.offset + directorySize), 8);
      locator.writeUInt32LE(1, 16); // total number of disks
      await write(this.out, Buffer.concat([record, locator]));
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(EOCD_SIGNATURE, 0);
    end.writeUInt16LE(many ? 0xffff : this.written.length, 8);
    end.writeUInt16LE(many ? 0xffff : this.written.length, 10);
    end.writeUInt32LE(directorySize, 12);
    end.writeUInt32LE(this.offset, 16);
    await write(this.out, end);
  }
}
