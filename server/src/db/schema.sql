-- SubMemo 1.0 schema. Single-user, local SQLite.
-- (PRAGMAs are applied in db.ts before this runs.)

CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('pdf', 'web')),
  title       TEXT NOT NULL,
  file_path   TEXT,
  topic_id    TEXT REFERENCES topics(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES topics(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extracts (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  topic_id    TEXT REFERENCES topics(id) ON DELETE SET NULL,
  text        TEXT NOT NULL,
  page        INTEGER,
  anchor      TEXT,
  understood  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_items (
  id            TEXT PRIMARY KEY,
  extract_id    TEXT NOT NULL REFERENCES extracts(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  stage         TEXT NOT NULL CHECK (stage IN ('encounter', 'cloze', 'socratic')),
  cloze_text    TEXT,
  cloze_answer  TEXT,
  question      TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  ef            REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  due_date      TEXT NOT NULL,
  last_reviewed TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id           TEXT PRIMARY KEY,
  item_id      TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL,
  grade        TEXT NOT NULL,
  user_answer  TEXT,
  ai_feedback  TEXT,
  reviewed_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extracts_source ON extracts(source_id);
CREATE INDEX IF NOT EXISTS idx_items_extract ON knowledge_items(extract_id);
CREATE INDEX IF NOT EXISTS idx_items_due ON knowledge_items(due_date);
CREATE INDEX IF NOT EXISTS idx_reviews_item ON reviews(item_id);
-- NOTE: indexes on the 1.1 columns (sources.topic_id, knowledge_items.status)
-- are created in db.ts AFTER migrate(), since on an upgraded DB those columns
-- don't exist until the migration runs.
