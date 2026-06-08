-- Source Vault schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;  -- for semantic search (optional, graceful fallback)

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

-- Full-text search index
CREATE INDEX IF NOT EXISTS sv_files_fts ON sv_files
  USING gin(to_tsvector('english',
    coalesce(name,'') || ' ' ||
    coalesce(original_name,'') || ' ' ||
    coalesce(extracted_text,'') || ' ' ||
    coalesce(notes,'') || ' ' ||
    array_to_string(tags, ' ')
  ));

CREATE INDEX IF NOT EXISTS sv_files_folder ON sv_files(folder_id);
CREATE INDEX IF NOT EXISTS sv_folders_parent ON sv_folders(parent_id);
