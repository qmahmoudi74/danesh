import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Cas, createCas } from '@danesh/storage/cas.ts';
import { type Db, openLibraryDb } from '@danesh/storage/db.ts';
import { listDocuments } from '@danesh/storage/documents.ts';
import { libraryPaths } from '@danesh/storage/library.ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createImportSources, importPdf, readOriginal } from '../src/documents.ts';
import { buildCorruptPdf, buildPdf } from './fixtures/pdf-fixtures.ts';

let parent: string;
let root: string;
let db: Db;
let cas: Cas;

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'danesh-documents-'));
  // Library and source folders with Persian letters, spaces and an apostrophe (D-13).
  root = join(parent, "کتابخانهٔ من '");
  db = openLibraryDb(root);
  const paths = libraryPaths(root);
  cas = createCas({ blobsDir: paths.blobs, tmpDir: paths.tmp });
});
afterEach(() => {
  db.close();
  rmSync(parent, { recursive: true, force: true });
});

function source(fileName: string, bytes: Buffer) {
  const folder = join(parent, 'پوشهٔ منبع');
  mkdirSync(folder, { recursive: true });
  const path = join(folder, fileName);
  writeFileSync(path, bytes);
  return { path, fileName };
}
const blobCount = () =>
  readdirSync(join(libraryPaths(root).blobs, 'sha256'), { recursive: true }).filter((name) =>
    /[0-9a-f]{64}$/.test(String(name)),
  ).length;

describe('importPdf', () => {
  it('stores a readable PDF once and lists it with its metadata title and page count', async () => {
    const bytes = buildPdf({ pages: ['one', 'two', 'three'], title: 'مبانی Danesh' });
    const result = await importPdf(source('کتاب نمونه.pdf', bytes), { db, cas });
    expect(result).toMatchObject({
      ok: true,
      duplicate: false,
      document: {
        title: 'مبانی Danesh',
        fileName: 'کتاب نمونه.pdf',
        pageCount: 3,
        byteSize: bytes.length,
        status: 'original',
      },
    });
    expect(listDocuments(db)).toHaveLength(1);
    expect(blobCount()).toBe(1);
    if (!result.ok) throw new Error('import failed');
    expect(Buffer.from((await readOriginal(result.document.documentId, { db, cas }))!)).toEqual(
      bytes,
    );
  });

  it('falls back to the file name when the PDF has no title', async () => {
    const result = await importPdf(source('جزوه.pdf', buildPdf({ pages: ['x'] })), { db, cas });
    expect(result).toMatchObject({ ok: true, document: { title: 'جزوه' } });
  });

  it('finds the existing entry when the same content is imported under another name', async () => {
    const bytes = buildPdf({ pages: ['one'], title: 'Same' });
    const first = await importPdf(source('a.pdf', bytes), { db, cas });
    const second = await importPdf(source('copy.pdf', bytes), { db, cas });
    expect(second).toMatchObject({ ok: true, duplicate: true });
    if (!first.ok || !second.ok) throw new Error('import failed');
    expect(second.document.documentId).toBe(first.document.documentId);
    expect(listDocuments(db)).toHaveLength(1);
    expect(blobCount()).toBe(1);
  });

  it.each([
    ['not-pdf', Buffer.from('just some text, not a PDF')],
    ['not-pdf', Buffer.alloc(0)],
    ['encrypted', buildPdf({ pages: ['secret'], encrypted: true })],
    ['damaged', buildCorruptPdf()],
  ])('refuses a %s file and adds nothing', async (reason, bytes) => {
    const result = await importPdf(source('bad.pdf', bytes), { db, cas });
    expect(result).toEqual({ ok: false, reason });
    expect(listDocuments(db)).toEqual([]);
  });

  it('reports an unreadable source instead of throwing', async () => {
    const result = await importPdf(
      { path: join(parent, 'missing.pdf'), fileName: 'missing.pdf' },
      {
        db,
        cas,
      },
    );
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('returns nothing for an unknown document id', async () => {
    expect(await readOriginal('00000000-0000-4000-8000-000000000000', { db, cas })).toBeUndefined();
  });
});

describe('import sources', () => {
  it('hands each registered file out once and forgets it after a minute', () => {
    let now = 0;
    const sources = createImportSources(() => now);
    sources.add('a', '/x/a.pdf', 'a.pdf');
    sources.add('b', '/x/b.pdf', 'b.pdf');
    expect(sources.take('a')).toEqual({ path: '/x/a.pdf', fileName: 'a.pdf' });
    expect(sources.take('a')).toBeUndefined();
    now = 60_001;
    expect(sources.take('b')).toBeUndefined();
  });
});
