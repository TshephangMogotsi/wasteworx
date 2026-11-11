-- D1/SQLite cannot alter a CHECK constraint in place. Rebuild the development
-- table so it mirrors the existing Supabase household_status enum.
CREATE TABLE households_rebuilt (
  id TEXT PRIMARY KEY,
  household_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  address_id TEXT NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'active', 'suspended', 'withdrawn')),
  registration_source TEXT NOT NULL DEFAULT 'admin_event',
  operational_notes TEXT,
  consent_version TEXT,
  consented_at TEXT,
  registered_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  registered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO households_rebuilt (
  id, household_code, name, address_id, status, registration_source, operational_notes,
  consent_version, consented_at, registered_by, registered_at, created_at, updated_at
)
SELECT
  id, household_code, name, address_id, status, registration_source, operational_notes,
  consent_version, consented_at, registered_by, registered_at, created_at, updated_at
FROM households;
DROP TABLE households;
ALTER TABLE households_rebuilt RENAME TO households;
CREATE INDEX households_address_id_idx ON households(address_id);
CREATE INDEX households_status_idx ON households(status);
