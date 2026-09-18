import { crc32, deflateRawSync } from 'zlib';

/** Small real ZIP fixtures, including streamed headers and dishonest size claims. */
export function zip(entries: { path: string; data: Buffer; descriptor?: boolean; declaredSize?: number; stored?: boolean }[]): Buffer {
  const records: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path);
    const data = entry.stored ? entry.data : deflateRawSync(entry.data);
    const checksum = crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800 | (entry.descriptor ? 8 : 0), 6);
    header.writeUInt16LE(entry.stored ? 0 : 8, 8);
    if (!entry.descriptor) {
      header.writeUInt32LE(checksum, 14);
      header.writeUInt32LE(data.length, 18);
      header.writeUInt32LE(entry.declaredSize ?? entry.data.length, 22);
    }
    header.writeUInt16LE(name.length, 26);
    const descriptor = entry.descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (entry.descriptor) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(checksum, 4);
      descriptor.writeUInt32LE(data.length, 8);
      descriptor.writeUInt32LE(entry.data.length, 12);
    }
    records.push(header, name, data, descriptor);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    header.copy(central, 6, 4, 26);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.declaredSize ?? entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += header.length + name.length + data.length + descriptor.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.reduce((sum, row) => sum + row.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, ...directory, end]);
}
