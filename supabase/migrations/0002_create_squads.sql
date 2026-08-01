-- FFS Fantasy — squads ve squad_players tabloları
--
-- ⚠️ RLS KAPALI (prototip). Prod'da Supabase Auth + RLS gerekir.
-- position_type değerleri: 'GK' | 'DF' | 'MF' | 'FW'
-- Not: player_id / captain_player_id integer'dır (oyuncu kataloğu API'den
--      geldiğinde tam sayı id kullanılacak).

create table public.squads (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        references public.users(id),
  week              integer     not null,
  formation         text,                    -- örn. "4-3-3"
  captain_player_id integer,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (user_id, week)
);

create table public.squad_players (
  id            uuid        primary key default gen_random_uuid(),
  squad_id      uuid        references public.squads(id) on delete cascade,
  player_id     integer     not null,
  position_type text        not null,        -- 'GK' | 'DF' | 'MF' | 'FW'
  is_starter    boolean     not null default false,  -- true: ilk 11, false: yedek
  bench_order   integer,                      -- yedek sırası (ilk 11 ise null)
  created_at    timestamptz default now()
);

-- RLS kapalı
alter table public.squads disable row level security;
alter table public.squad_players disable row level security;
