-- Extracted text (owner-authorized early Phase 2 increment). One extraction per document and extractor version;
-- a newer extractor writes new rows and never mixes with older ones. Pages are written in order, one transaction
-- each, so an interrupted extraction continues after its last stored page.
CREATE TABLE extraction (
  document_id TEXT NOT NULL REFERENCES document (document_id),
  extractor_version TEXT NOT NULL CHECK (length(extractor_version) BETWEEN 1 AND 100),
  state TEXT NOT NULL CHECK (state IN ('running', 'completed', 'failed')),
  page_count INTEGER NOT NULL CHECK (page_count > 0),
  pages_done INTEGER NOT NULL CHECK (pages_done BETWEEN 0 AND page_count),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error_class TEXT CHECK (error_class IS NULL OR length(error_class) <= 64),
  PRIMARY KEY (document_id, extractor_version)
) STRICT;

-- status: text (readable), needs-review (flags say the reconstruction is doubtful), needs-ocr (an image and almost
-- no text: likely a scan), empty (no text and no image). flags: JSON array of quality flags.
CREATE TABLE extracted_page (
  document_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  width REAL NOT NULL,
  height REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('text', 'needs-review', 'needs-ocr', 'empty')),
  flags TEXT NOT NULL CHECK (json_valid(flags)),
  PRIMARY KEY (document_id, extractor_version, page_number),
  FOREIGN KEY (document_id, extractor_version) REFERENCES extraction (document_id, extractor_version)
) STRICT;

-- block_id is derived from the original's hash, extractor version, page and position: re-running the same
-- extractor on the same file yields the same ids. raw_text keeps the reconstructed characters as decoded;
-- normalized_text is the reading form. box and lines are page-relative geometry (JSON).
CREATE TABLE extracted_block (
  block_id TEXT PRIMARY KEY CHECK (length(block_id) = 24),
  document_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('heading', 'paragraph')),
  raw_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('rtl', 'ltr', 'mixed')),
  box TEXT NOT NULL CHECK (json_valid(box)),
  lines TEXT NOT NULL CHECK (json_valid(lines)),
  flags TEXT NOT NULL CHECK (json_valid(flags)),
  UNIQUE (document_id, extractor_version, page_number, ordinal),
  FOREIGN KEY (document_id, extractor_version, page_number)
    REFERENCES extracted_page (document_id, extractor_version, page_number)
) STRICT;
