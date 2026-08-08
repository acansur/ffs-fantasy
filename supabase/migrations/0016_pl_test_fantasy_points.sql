-- 0016_pl_test_fantasy_points.sql
--
-- /pl-test fantasy kümülatif puan tablosu — AYRI: pl_test_fantasy_points.
-- /takimim'in fantasy_points tablosuna DOKUNMAZ. Mantık 0015 ile birebir aynı;
-- yalnızca tablo farklıdır (test ortamı izolasyonu).

create table if not exists public.pl_test_fantasy_points (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  week        integer not null,
  points      integer default 0,
  updated_at  timestamptz default now(),
  unique (user_id, week)
);

alter table public.pl_test_fantasy_points disable row level security;
