-- Migration: exec_chart_configs
-- Run once in Supabase SQL Editor if the table does not yet exist.

CREATE TABLE IF NOT EXISTS exec_chart_configs (
  id          BIGSERIAL PRIMARY KEY,
  dept_name   TEXT NOT NULL UNIQUE,
  configs     JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exec_chart_configs ENABLE ROW LEVEL SECURITY;
-- service_role_key bypasses RLS — anon key is blocked (no policies needed).
