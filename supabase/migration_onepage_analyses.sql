-- Migration: onepage_analyses
-- Analytics Engine — One-Page Finance saved analyses
-- Run this in Supabase SQL editor or via supabase db push

create table if not exists onepage_analyses (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  nome       text not null,
  config     jsonb not null,
  blocks     jsonb not null default '[]',
  otica      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, nome)
);

create index if not exists onepage_analyses_user_id_idx on onepage_analyses(user_id);
create index if not exists onepage_analyses_updated_idx  on onepage_analyses(updated_at desc);

-- Auto-update updated_at on row change
create or replace function update_onepage_analyses_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists onepage_analyses_updated_at on onepage_analyses;
create trigger onepage_analyses_updated_at
  before update on onepage_analyses
  for each row execute function update_onepage_analyses_updated_at();
