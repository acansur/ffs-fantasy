-- 0013_squad_transfers.sql
--
-- Süper Lig serbest transfer hakkı + ekstra transfer puan kesintisi takibi.
-- Hafta başına (user_id, week) bir satır: o hafta KAYDEDİLMİŞ transfer sayısı
-- (transfer_count) ve uygulanmış toplam puan kesintisi (point_deductions).
--   - Hafta 1: sınırsız transfer (ilk kadro kurulumu), kesinti yok.
--   - Hafta 2+: 3 serbest transfer; 4. transferden itibaren her biri -2 puan.
-- Orijinal squads/squad_players/users tablolarına DOKUNULMAZ; ayrı tablodur.

create table if not exists public.squad_transfers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete cascade,
  week             integer not null,
  transfer_count   integer default 0,
  point_deductions integer default 0,
  updated_at       timestamptz default now(),
  unique (user_id, week)
);

alter table public.squad_transfers disable row level security;
