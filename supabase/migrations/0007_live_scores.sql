-- 0007_live_scores.sql
-- Canlı maç puanları önbelleği.
--
-- GitHub Actions iş akışı (.github/workflows/live-scores.yml) her 5 dakikada bir
-- o an OYNANAN maçların oyuncu puanlarını scoring.js mantığıyla hesaplayıp bu
-- tabloya fixture_id bazlı upsert eder. Böylece istemci, canlı puanları görmek
-- için her seferinde API-Football'a gitmeden doğrudan buradan okuyabilir.
--
-- Bir satır = bir maç. players (jsonb) o maçtaki tüm oyuncuların skorlanmış
-- çıktısını (scoreFixture) tutar: [{ id, name, teamId, position, minutes,
-- base, total, parts }].

create table if not exists public.live_scores (
  fixture_id   bigint primary key,
  league_id    integer,
  season       integer,
  status       text,        -- 1H / 2H / HT / ET / ... (maç durumu)
  elapsed      integer,     -- oynanan dakika
  home_team_id integer,
  away_team_id integer,
  home_goals   integer,
  away_goals   integer,
  players      jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);

comment on table public.live_scores is
  'Canlı maç oyuncu puanları önbelleği — GitHub Actions (live-scores) ile güncellenir.';

-- Not: Bu prototipte RLS diğer tablolarla tutarlı olacak şekilde kapalıdır;
-- yazma işlemi anon anahtarla yapılır.
