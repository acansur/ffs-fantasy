-- FFS Fantasy — "Kim Kazanır?" tahmin oyunu (fantasy puanlarından BAĞIMSIZ).
-- ⚠️ RLS KAPALI (prototip), diğer tablolarla aynı yaklaşım.

create table if not exists public.match_predictions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  week        integer not null,
  fixture_id  integer not null,
  prediction  text not null,          -- 'home' | 'draw' | 'away'
  is_correct  boolean,
  points      integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (user_id, fixture_id)
);
alter table public.match_predictions disable row level security;

create table if not exists public.prediction_points (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id) on delete cascade,
  week         integer not null,
  total_points integer default 0,
  updated_at   timestamptz default now(),
  unique (user_id, week)
);
alter table public.prediction_points disable row level security;
