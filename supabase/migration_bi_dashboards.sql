-- Migration: bi_dashboards
-- BI Canvas — one dashboard per user (user_id unique constraint)
-- Run this in Supabase SQL editor before first use.

create table if not exists bi_dashboards (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null unique,   -- one dashboard per user for now
  nome           text not null default 'Meu Dashboard',
  periodo_global jsonb not null default '{"tipo":"mes","mes":1,"ano":2025}',
  widgets        jsonb not null default '[]',
  atualizado_em  timestamptz default now()
);

create index if not exists bi_dashboards_user_id_idx on bi_dashboards(user_id);

-- Auto-update atualizado_em on change
create or replace function update_bi_dashboards_timestamp()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists bi_dashboards_updated_at on bi_dashboards;
create trigger bi_dashboards_updated_at
  before update on bi_dashboards
  for each row execute function update_bi_dashboards_timestamp();
