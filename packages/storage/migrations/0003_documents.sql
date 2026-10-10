-- Imported PDFs. The original bytes live in the content-addressed store under blob_sha256; one row per distinct
-- content, so importing the same file again finds this row instead of adding a second one.
-- status 'original': only the original is stored; nothing has been extracted from it yet.
CREATE TABLE document (
  document_id TEXT PRIMARY KEY CHECK (length(document_id) = 36),
  blob_sha256 TEXT NOT NULL UNIQUE CHECK (length(blob_sha256) = 64),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 1000),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  page_count INTEGER NOT NULL CHECK (page_count > 0),
  imported_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('original'))
) STRICT;

CREATE INDEX document_imported_at ON document (imported_at DESC);
