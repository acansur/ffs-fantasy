-- FFS Fantasy — /players2 (admin) için geçen sezon (2025-26) oyuncu puanları.
-- AYRI tablo; orijinal squads/squad_players/users verisinden bağımsızdır.
-- ⚠️ RLS KAPALI (prototip), diğer tablolarla aynı yaklaşım.

create table if not exists public.player_season_stats_2025 (
  player_id        integer primary key,
  player_name      text,
  team_name        text,
  position         text,
  matches_played   integer,
  total_points     integer,
  points_per_match numeric(5,2),
  stats_breakdown  jsonb,
  updated_at       timestamptz default now()
);

alter table public.player_season_stats_2025 disable row level security;
