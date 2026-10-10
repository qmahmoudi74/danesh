import { closePdf, extractPage } from '../pdf/src/pdf.ts';
const page = await extractPage(process.argv[2]!, 1);
console.log(page.status, page.flags);
for (const b of page.blocks.slice(0, Number(process.argv[3] ?? 12))) console.log(b.kind, b.box.map((v) => v.toFixed(2)).join(','), JSON.stringify(b.normalizedText.slice(0, 90)));
await closePdf();
