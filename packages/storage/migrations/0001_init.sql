CREATE TABLE schema_migration (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  app_version TEXT NOT NULL
) STRICT;

CREATE TABLE system_check_probe (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL
) STRICT;
