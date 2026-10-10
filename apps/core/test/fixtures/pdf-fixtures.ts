// Builds small, structurally valid PDFs for tests: real xref offsets, real fonts, real page content.
// Plain Node (no bundler features) so unit tests and E2E steps can share it.

/** A PDF text string: ASCII as a literal, anything else as UTF-16BE hex with a byte-order mark. */
function pdfString(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/[()\\]/g, '\\$&')})`;
  const units = [0xfeff, ...Array.from(text, (char) => char.charCodeAt(0))];
  return `<${units.map((unit) => unit.toString(16).padStart(4, '0')).join('')}>`;
}

export type PdfFixtureOptions = {
  /** One ASCII line of text per page. */
  pages: string[];
  title?: string;
  /** Adds a standard security handler whose user password is unknown, so readers must ask for one. */
  encrypted?: boolean;
};

export function buildPdf({ pages, title, encrypted = false }: PdfFixtureOptions): Buffer {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  const pageIds = pages.map((_, index) => 4 + index * 2);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((text, index) => {
    const content = `BT /F1 32 Tf 72 720 Td ${pdfString(text)} Tj ET`;
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index]! + 1} 0 R >>`,
    );
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const infoId = objects.length + 1;
  add(`<< /Producer (Danesh test fixture)${title ? ` /Title ${pdfString(title)}` : ''} >>`);
  let encryptId: number | undefined;
  if (encrypted) {
    encryptId = objects.length + 1;
    add(`<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -4 >>`);
  }

  let output = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output, 'latin1'));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  const id = '0123456789abcdef0123456789abcdef';
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R /ID [<${id}> <${id}>]${encryptId ? ` /Encrypt ${encryptId} 0 R` : ''} >>\n`;
  output += `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'latin1');
}

/** Starts like a PDF but has no readable structure. */
export function buildCorruptPdf(): Buffer {
  return Buffer.from('%PDF-1.7\nthis is not a pdf body at all\n'.repeat(20), 'latin1');
}
