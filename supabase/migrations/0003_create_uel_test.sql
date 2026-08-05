-- FFS Fantasy — UEL test sayfaları (/uel-test, /uel-test2) için AYRI tablolar.
--
-- ⚠️ VERİ İZOLASYONU: Bu tablolar orijinal squads/squad_players/users
-- verisinden tamamen bağımsızdır. Test sayfaları YALNIZCA bu tablolara yazar.
-- Anahtar: (user_id, slot) — slot = 'uel-test' | 'uel-test2'.
--
-- ⚠️ RLS KAPALI (prototip), orijinal tablolarla aynı yaklaşım.
-- position_type: 'GK' | 'DF' | 'MF' | 'FW'

create table if not exists public.uel_test_squads (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        references public.users(id),
  slot              text        not null,        -- 'uel-test' | 'uel-test2'
  formation         text,
  captain_player_id integer,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (user_id, slot)
);

create table if not exists public.uel_test_squad_players (
  id            uuid        primary key default gen_random_uuid(),
  squad_id      uuid        references public.uel_test_squads(id) on delete cascade,
  player_id     integer     not null,
  position_type text        not null,        -- 'GK' | 'DF' | 'MF' | 'FW'
  is_starter    boolean     not null default false,
  bench_order   integer,
  created_at    timestamptz default now()
);

-- RLS kapalı (orijinal tablolarla aynı)
alter table public.uel_test_squads        disable row level security;
alter table public.uel_test_squad_players disable row level security;
