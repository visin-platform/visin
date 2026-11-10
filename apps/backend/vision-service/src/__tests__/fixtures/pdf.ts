/**
 * A real, tiny PDF with one page per string: enough for a PDF reader to take text from, so a test reads a file the way
 * the service reads a paper, not a stand-in for one.
 */
export function pdfWithPages(pages: string[]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const text of pages) {
    // Wrapped into lines that fit the page, as a real page's text is: a reader takes only what is on the page.
    const escaped = text.replace(/[()\\]/g, '\\$&');
    const lines = escaped.match(/.{1,90}(\s|$)/g) ?? [escaped];
    const stream = `BT /F1 10 Tf 12 TL 40 760 Td ${lines.map((line) => `(${line.trim()}) '`).join(' ')} ET`;
    const page = objects.length + 1;
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${page + 1} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`
    );
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
