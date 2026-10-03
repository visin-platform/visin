import { crc32, deflateRawSync } from 'node:zlib';

/** One cell of an exported table: text, a number, or nothing. */
export type Cell = string | number | null | undefined;

export interface Table {
  columns: string[];
  rows: Cell[][];
}

/**
 * Text a spreadsheet would run as a formula. A run's name is whatever its author typed, and a
 * CSV opened in Excel executes a cell that starts with one of these, so it is made inert with a
 * leading apostrophe, which is how a spreadsheet shows a cell as plain text.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

const safeText = (value: string): string => (FORMULA_START.test(value) ? `'${value}` : value);

const csvField = (cell: Cell): string => {
  if (cell === null || cell === undefined) return '';
  const text = typeof cell === 'number' ? (Number.isFinite(cell) ? String(cell) : '') : safeText(cell);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const BOM = String.fromCharCode(0xfeff);

/**
 * RFC 4180, with a byte-order mark so Excel reads the UTF-8 as UTF-8 instead of guessing a
 * code page and mangling every accented name. A number is written as itself, never quoted,
 * so a spreadsheet keeps it a number.
 */
export const toCsv = ({ columns, rows }: Table): string =>
  `${BOM}${[columns, ...rows].map(row => row.map(csvField).join(',')).join('\r\n')}\r\n`;

/** XML 1.0 forbids these control characters, and a workbook with one will not open. */
// eslint-disable-next-line no-control-regex
const XML_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

const xml = (text: string): string =>
  text.replace(XML_FORBIDDEN, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `A`, `B`, … `Z`, `AA` — a spreadsheet's column letters. */
const columnName = (index: number): string => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

const sheetCell = (cell: Cell, row: number, column: number): string => {
  const ref = `${columnName(column)}${row}`;
  if (cell === null || cell === undefined || (typeof cell === 'number' && !Number.isFinite(cell))) return '';
  // Text is an inline string, which a spreadsheet never evaluates, so no formula guard is needed here.
  return typeof cell === 'number'
    ? `<c r="${ref}"><v>${cell}</v></c>`
    : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
};

const worksheet = ({ columns, rows }: Table): string => {
  const lines = [columns, ...rows].map(
    (row, r) => `<row r="${r + 1}">${row.map((cell, c) => sheetCell(cell, r + 1, c)).join('')}</row>`
  );
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<sheetData>${lines.join('')}</sheetData></worksheet>`
  );
};

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** A zip of deflated files, written whole: all an .xlsx needs, so no archive library is. */
function zip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const fileName = Buffer.from(name);
    const packed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    parts.push(local, fileName, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(fileName.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, fileName);
    offset += local.length + fileName.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

/** A one-sheet workbook with a frozen header row; text stays text and numbers stay numbers. */
export function toXlsx(table: Table, sheetName = 'Comparison'): Buffer {
  const name = sheetName.replace(XML_FORBIDDEN, '').replace(/[\\/?*[\]:]/g, ' ')
    .trim().slice(0, 31).replace(/^'+|'+$/g, '').trim() || 'Comparison';
  const file = (name: string, text: string): ZipEntry => ({ name, data: Buffer.from(text) });
  const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    file(
      '[Content_Types].xml',
      `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    ),
    file(
      '_rels/.rels',
      `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ),
    file(
      'xl/workbook.xml',
      `${header}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${xml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    file(
      'xl/_rels/workbook.xml.rels',
      `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    ),
    file('xl/worksheets/sheet1.xml', worksheet(table))
  ]);
}
