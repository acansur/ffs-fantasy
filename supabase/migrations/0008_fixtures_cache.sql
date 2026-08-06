-- 0008_fixtures_cache.sql
-- Süper Lig fikstür önbelleği.
--
-- Uygulama (Transfer/Takımım) ve admin paneli fikstürü çekerken önce buraya
-- bakar: updated_at 24 saatten yeni ise Supabase'den okunur, eski/yoksa
-- API-Football'dan çekilip buraya yazılır. Admin panelindeki "Fikstürü
-- Güncelle" butonu da bu tabloyu tazeler.
--
-- Bir satır = bir maç. data (jsonb) ham API maç nesnesini tutar
-- ({ fixture, league, teams, goals, ... }); uygulama bu diziyi doğrudan kullanır.
--
-- Oyuncu önbelleği ayrı bir tabloya gerek duymaz: mevcut public.players tablosu
-- (0005_admin.sql) zaten id/name/team_name/position/value/updated_at tutar ve
-- aynı 24 saat mantığıyla önbellek olarak kullanılır.

create table if not exists public.fixtures (
  fixture_id bigint primary key,
  round      text,                 -- "Regular Season - 3" gibi
  match_date timestamptz,
  data       jsonb not null,       -- ham API maç nesnesi
  updated_at timestamptz not null default now()
);

-- Bu prototipte RLS diğer tablolarla tutarlı olacak şekilde kapalı (anon key ile yazılır)
alter table public.fixtures disable row level security;

create index if not exists fixtures_round_idx on public.fixtures (round);

comment on table public.fixtures is
  'Süper Lig fikstür önbelleği — data = ham API maç nesnesi; 24 saat TTL.';
