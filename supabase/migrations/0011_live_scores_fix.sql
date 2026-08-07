-- 0011_live_scores_fix.sql
--
-- live_scores tablosu bazı ortamlarda EKSİK şemayla oluşmuştu (yalnızca
-- fixture_id + updated_at; players / league_id / status / elapsed / skor
-- sütunları yoktu). Bu yüzden GitHub Actions (live-scores) cron'unun upsert'i
-- "column ... does not exist" ile başarısız oluyor, tablo BOŞ kalıyor ve
-- detay modalında canlı puan kırılımı görünmüyordu (kart API'den 6 puan
-- gösterirken modal live_scores'tan 0 okuyordu).
--
-- Bu migration eksik sütunları tamamlar → tabloyu 0007_live_scores.sql ile tam
-- uyumlu hâle getirir. IDEMPOTENT: doğru şemadaki tabloda hiçbir şey yapmaz,
-- veri kaybı YOK (ADD COLUMN IF NOT EXISTS).

create table if not exists public.live_scores (
  fixture_id bigint primary key
);

alter table public.live_scores add column if not exists league_id    integer;
alter table public.live_scores add column if not exists season       integer;
alter table public.live_scores add column if not exists status       text;         -- 1H / 2H / HT / ET / FT ...
alter table public.live_scores add column if not exists elapsed      integer;      -- oynanan dakika
alter table public.live_scores add column if not exists home_team_id integer;
alter table public.live_scores add column if not exists away_team_id integer;
alter table public.live_scores add column if not exists home_goals   integer;
alter table public.live_scores add column if not exists away_goals   integer;
alter table public.live_scores add column if not exists players      jsonb not null default '[]'::jsonb; -- [{ id, name, teamId, position, minutes, base, total, parts }]
alter table public.live_scores add column if not exists updated_at   timestamptz not null default now();

alter table public.live_scores disable row level security;
