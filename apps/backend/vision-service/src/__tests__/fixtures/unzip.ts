import { crc32 } from 'zlib';

/**
 * Reads a stored zip the way an unzip tool does: from the central directory, then each entry's data, checking each
 * entry's CRC and that its data descriptor repeats what the directory says. Returns the entries in directory order.
 * Any mismatch fails the test that read it.
 */
export const unzip = (zip: Buffer): Map<string, Buffer> => {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(Math.max(end, 0))).toBe(0x06054b50); // a complete zip ends with its directory's record
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let index = 0; index < count; index += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(cursor + 16);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const local = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);
    expect(zip.readUInt32LE(dataStart + size)).toBe(0x08074b50);
    expect(zip.readUInt32LE(dataStart + size + 4)).toBe(crc);
    files.set(name, Buffer.from(data));
    cursor += 46 + nameLength;
  }
  return files;
};
