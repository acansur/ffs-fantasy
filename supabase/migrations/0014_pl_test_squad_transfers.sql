-- 0014_pl_test_squad_transfers.sql
--
-- /pl-test (Polonya Ekstraklasa test ortamı) için serbest transfer hakkı +
-- ekstra transfer puan kesintisi takibi. squad_transfers ile BİREBİR aynı mantık,
-- ama İZOLE tablo — SL transfer sayaçlarıyla çakışmaz (pl_test_* deseni).
-- Orijinal tablolara dokunulmaz.

create table if not exists public.pl_test_squad_transfers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete cascade,
  week             integer not null,
  transfer_count   integer default 0,
  point_deductions integer default 0,
  updated_at       timestamptz default now(),
  unique (user_id, week)
);

alter table public.pl_test_squad_transfers disable row level security;
