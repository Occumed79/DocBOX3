-- Source Vault schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS sv_folders (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES sv_folders(id) ON DELETE CASCADE,
  color       TEXT DEFAULT '#3b82f6',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sv_files (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folder_id     UUID REFERENCES sv_folders(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  mime_type     TEXT NOT NULL DEFAULT '',
  size_bytes    BIGINT DEFAULT 0,
  storage_url   TEXT NOT NULL,
  storage_key   TEXT NOT NULL DEFAULT '',
  extracted_text TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  tags          TEXT[] DEFAULT '{}',
  is_archived   BOOLEAN DEFAULT FALSE,
  upload_date   TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Separate trigram / B-tree indexes instead of a GIN expression index
-- (expression indexes with user-defined functions require IMMUTABLE on Neon)
CREATE INDEX IF NOT EXISTS sv_files_folder    ON sv_files(folder_id);
CREATE INDEX IF NOT EXISTS sv_folders_parent  ON sv_folders(parent_id);
CREATE INDEX IF NOT EXISTS sv_files_archived  ON sv_files(is_archived);
CREATE INDEX IF NOT EXISTS sv_files_upload    ON sv_files(upload_date DESC);

-- Price Intelligence schema
-- The pricing tables intentionally accept ONLY explicit self-pay / cash records.
-- Insurance, Medicare, Medicaid, chargemaster, gross-charge, and unknown-basis
-- observations must never be inserted into pi_price_observations.

CREATE TABLE IF NOT EXISTS pi_procedures (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_system   TEXT NOT NULL CHECK (code_system IN ('CPT', 'CDT', 'HCPCS')),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '',
  aliases       TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code_system, code)
);

CREATE TABLE IF NOT EXISTS pi_sources (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  source_url    TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pi_price_observations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  procedure_id    UUID NOT NULL REFERENCES pi_procedures(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL REFERENCES pi_sources(id) ON DELETE RESTRICT,
  payment_basis   TEXT NOT NULL CHECK (payment_basis IN (
    'cash',
    'self_pay',
    'discounted_cash',
    'uninsured',
    'direct_pay',
    'marketplace_cash'
  )),
  price           NUMERIC(12,2) NOT NULL CHECK (price > 0),
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  provider_name   TEXT,
  address_line1   TEXT,
  city            TEXT,
  state           TEXT,
  postal_code     TEXT,
  latitude        DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude       DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  source_record_id TEXT,
  source_url      TEXT,
  observed_at     TIMESTAMPTZ,
  effective_date  DATE,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pi_observations_procedure ON pi_price_observations(procedure_id);
CREATE INDEX IF NOT EXISTS pi_observations_source ON pi_price_observations(source_id);
CREATE INDEX IF NOT EXISTS pi_observations_state ON pi_price_observations(state);
CREATE INDEX IF NOT EXISTS pi_observations_postal ON pi_price_observations(postal_code);
CREATE INDEX IF NOT EXISTS pi_observations_imported ON pi_price_observations(imported_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pi_observations_source_record
  ON pi_price_observations(source_id, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pi_analysis_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  procedure_id      UUID NOT NULL REFERENCES pi_procedures(id) ON DELETE RESTRICT,
  location_query    TEXT NOT NULL,
  radius_miles      INTEGER,
  quoted_price      NUMERIC(12,2),
  observation_count INTEGER NOT NULL DEFAULT 0,
  median_price      NUMERIC(12,2),
  low_price         NUMERIC(12,2),
  high_price        NUMERIC(12,2),
  result_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pi_analysis_runs_created ON pi_analysis_runs(created_at DESC);
