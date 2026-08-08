-- 0015_fantasy_points.sql
--
-- Süper Lig fantasy KÜMÜLATİF puan sistemi: kullanıcının HAFTA HAFTA final
-- puanını saklar. Sezon toplamı = SUM(points). prediction_points ile birebir
-- aynı desen (Kim Kazanır'ın puan tablosunun fantasy karşılığı).
--
-- Yazım: bir hafta TAMAMEN bitince (weekAllFinished) o haftanın totalPoints değeri
-- idempotent upsert edilir (saveFantasyWeekPoints). Okuma: loadCumulativePoints
-- kullanıcının { [week]: points } haritasını döner; client Σ ile sezon toplamını
-- hesaplar ve Takımım "Toplam Puan" kartında gösterir.
--
-- Orijinal tablolara (squads/squad_players/users) DOKUNMAZ; ayrı tablodur.

create table if not exists public.fantasy_points (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  week        integer not null,
  points      integer default 0,
  updated_at  timestamptz default now(),
  unique (user_id, week)
);

alter table public.fantasy_points disable row level security;
