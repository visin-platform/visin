import { crc32, inflateRawSync } from 'node:zlib';
import { toCsv, toXlsx } from '../../utils/tableExport';

const BOM = String.fromCharCode(0xfeff);

/** Read back what `toXlsx` wrote: every entry of the zip, inflated, checked against its own checksum. */
function unzip(zip: Buffer): Record<string, string> {
  const files: Record<string, string> = {};
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let entry = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(entry)).toBe(0x02014b50);
    const checksum = zip.readUInt32LE(entry + 16);
    const packed = zip.readUInt32LE(entry + 20);
    const size = zip.readUInt32LE(entry + 24);
    const nameLength = zip.readUInt16LE(entry + 28);
    const local = zip.readUInt32LE(entry + 42);
    const name = zip.subarray(entry + 46, entry + 46 + nameLength).toString();
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26);
    const data = inflateRawSync(zip.subarray(start, start + packed));
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(checksum);
    files[name] = data.toString();
    entry += 46 + nameLength;
  }
  return files;
}

describe('toCsv', () => {
  it('writes rows as RFC 4180, numbers bare, with a byte-order mark and CRLF line ends', () => {
    expect(toCsv({ columns: ['Run', 'Score'], rows: [['baseline', 0.7], ['b', null]] })).toBe(`${BOM}Run,Score\r\nbaseline,0.7\r\nb,\r\n`);
  });

  it('quotes a field that holds a comma, a quote or a line break, doubling the quotes', () => {
    const csv = toCsv({ columns: ['n'], rows: [['a,b'], ['say "hi"'], ['two\nlines'], ['plain']] });
    expect(csv).toBe(`${BOM}n\r\n"a,b"\r\n"say ""hi"""\r\n"two\nlines"\r\nplain\r\n`);
  });

  it('makes text a spreadsheet would run as a formula inert, and leaves minus signs on numbers alone', () => {
    const csv = toCsv({ columns: ['n', 'v'], rows: [['=HYPERLINK("x")', -0.5], ['+1', 1], ['-cmd', 2], ['@SUM(A1)', 3], ['\tx', 4], ['safe=1', 5]] });
    expect(csv).toContain("\r\n\"'=HYPERLINK(\"\"x\"\")\",-0.5\r\n");
    expect(csv).toContain("\r\n'+1,1\r\n");
    expect(csv).toContain("\r\n'-cmd,2\r\n");
    expect(csv).toContain("\r\n'@SUM(A1),3\r\n");
    expect(csv).toContain("\r\n'\tx,4\r\n");
    expect(csv).toContain('\r\nsafe=1,5\r\n');
  });

  it('writes a number that is not finite as an empty cell', () => {
    expect(toCsv({ columns: ['a', 'b'], rows: [[NaN, Infinity]] })).toBe(`${BOM}a,b\r\n,\r\n`);
  });
});

describe('toXlsx', () => {
  const files = unzip(toXlsx({ columns: ['Run', 'Score', 'Note'], rows: [['A & B <1>', 0.75, null], ['=1+1', -2, 'x']] }, 'My: sheet/1'));

  it('is a workbook of five parts that name each other', () => {
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
    expect(files['[Content_Types].xml']).toContain('/xl/worksheets/sheet1.xml');
    expect(files['_rels/.rels']).toContain('Target="xl/workbook.xml"');
    expect(files['xl/_rels/workbook.xml.rels']).toContain('Target="worksheets/sheet1.xml"');
  });

  it('names the sheet, without the characters a sheet name may not hold', () => {
    expect(files['xl/workbook.xml']).toContain('<sheet name="My  sheet 1" sheetId="1" r:id="rId1"/>');
  });

  it('keeps empty or apostrophe-wrapped comparison names valid as sheet names', () => {
    const table = { columns: ['Run'], rows: [] };
    for (const name of ['', '  ', ':/?*[]', "'''", String.fromCharCode(1)]) {
      expect(unzip(toXlsx(table, name))['xl/workbook.xml']).toContain('sheet name="Comparison"');
    }
    expect(unzip(toXlsx(table, "'Baseline'"))['xl/workbook.xml']).toContain('sheet name="Baseline"');
    expect(unzip(toXlsx(table, `${'a'.repeat(30)}'tail`))['xl/workbook.xml']).toContain(`sheet name="${'a'.repeat(30)}"`);
  });

  it('keeps text as text (escaped, never evaluated) and numbers as numbers, in a header frozen on its first row', () => {
    const sheet = files['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Run</t></is></c>');
    expect(sheet).toContain('A &amp; B &lt;1&gt;');
    expect(sheet).toContain('<c r="B2"><v>0.75</v></c>');
    expect(sheet).toContain('<c r="B3"><v>-2</v></c>');
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=1+1</t>');
    expect(sheet).not.toContain('r="C2"');
    expect(sheet).toContain('state="frozen"');
  });

  it('numbers columns past Z as a spreadsheet does, and drops characters XML forbids', () => {
    const wide = unzip(toXlsx({ columns: Array.from({ length: 28 }, (_, i) => `c${i}`), rows: [[`bad${String.fromCharCode(1, 0xfffe, 0xffff)}char`]] }));
    expect(wide['xl/worksheets/sheet1.xml']).toContain('r="Z1"');
    expect(wide['xl/worksheets/sheet1.xml']).toContain('r="AB1"');
    expect(wide['xl/worksheets/sheet1.xml']).toContain('>badchar<');
  });
});
