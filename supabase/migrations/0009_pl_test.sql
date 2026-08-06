-- FFS Fantasy — Polonya Ekstraklasa test ortamı (/pl-test) için AYRI tablolar.
--
-- ⚠️ VERİ İZOLASYONU: Bu tablolar orijinal squads/squad_players/users
-- verisinden tamamen bağımsızdır. /pl-test YALNIZCA bu tablolara yazar.
-- Anahtar: (user_id, week) — tek hafta (week = 1).
--
-- ⚠️ RLS KAPALI (prototip), orijinal tablolarla aynı yaklaşım.
-- position_type: 'GK' | 'DF' | 'MF' | 'FW'

create table if not exists public.pl_test_squads (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        references public.users(id),
  week              integer     not null default 1,
  formation         text,
  captain_player_id integer,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (user_id, week)
);

create table if not exists public.pl_test_squad_players (
  id            uuid        primary key default gen_random_uuid(),
  squad_id      uuid        references public.pl_test_squads(id) on delete cascade,
  player_id     integer     not null,
  position_type text        not null,        -- 'GK' | 'DF' | 'MF' | 'FW'
  is_starter    boolean     not null default false,
  bench_order   integer,
  created_at    timestamptz default now()
);

-- RLS kapalı (orijinal tablolarla aynı)
alter table public.pl_test_squads        disable row level security;
alter table public.pl_test_squad_players disable row level security;
