CREATE TABLE IF NOT EXISTS one_page_layouts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'default',
  name        TEXT NOT NULL DEFAULT 'Meu Dashboard',
  layout      JSONB NOT NULL DEFAULT '[]',
  widgets     JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);
