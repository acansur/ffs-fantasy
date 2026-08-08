-- 0017_leagues.sql
--
-- /liglerim özel lig sistemi. leagues + league_members 0005'te zaten var; burada
-- eksik kolonlar EKLENİR (ADD COLUMN IF NOT EXISTS → idempotent, veri kaybı yok)
-- ve league_blacklist tablosu oluşturulur. Orijinal kolonlara dokunulmaz.
--
-- leagues.owner_id = lig ADMİNİ (kurucu). Sıralama fantasy_points'ten okunur;
-- milestone_week milat haftasıdır: puanlar week >= milestone_week için sayılır.

-- Özel lig ayarları
alter table public.leagues add column if not exists person_count        integer;   -- max üye (null = sınırsız)
alter table public.leagues add column if not exists include_past_points boolean not null default true; -- geçmiş puanlar dahil mi
alter table public.leagues add column if not exists milestone_week      integer not null default 1;     -- milat hafta (dahil değilse kuruluş anındaki ilk açık hafta)

-- Atılan (kick'lenen) kullanıcılar — bu lige tekrar giremez
create table if not exists public.league_blacklist (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid references public.leagues(id) on delete cascade,
  user_id    uuid references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (league_id, user_id)
);

alter table public.league_blacklist disable row level security;
