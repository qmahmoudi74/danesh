-- Durable jobs follow documents (0003) and extraction (0004); applied migrations are immutable.
CREATE TABLE job (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','running','paused','blocked','failed','cancelled','completed','completed_with_issues')),
  priority INTEGER NOT NULL DEFAULT 50,
  input_ref TEXT NOT NULL,
  resumed_from_unit INTEGER,
  not_redone_count INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
) STRICT;
CREATE TABLE task (
  task_id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES job(job_id),
  kind TEXT NOT NULL,
  unit_key TEXT NOT NULL,
  unit_order INTEGER NOT NULL CHECK (unit_order >= 0),
  state TEXT NOT NULL CHECK (state IN ('queued','running','done','failed','quarantined')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  boot_id TEXT,
  error_class TEXT,
  output_ref TEXT,
  UNIQUE (job_id, kind, unit_key),
  CHECK (state != 'done' OR output_ref IS NOT NULL)
) STRICT;
CREATE TABLE exec_log (
  task_id INTEGER NOT NULL REFERENCES task(task_id),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  output_ref TEXT NOT NULL,
  committed_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, attempt),
  UNIQUE (task_id)
) STRICT;
CREATE INDEX task_claim_order ON task(job_id, state, unit_order);
