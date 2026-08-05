-- FFS Fantasy — Admin paneli altyapısı (/admin)
-- ⚠️ RLS KAPALI (prototip), diğer tablolarla aynı yaklaşım.

-- 1) Admin bayrağı
alter table public.users add column if not exists is_admin boolean not null default false;

-- 2) Oyuncu kataloğu + değerler (admin düzenler)
create table if not exists public.players (
  id         integer primary key,
  name       text,
  team_name  text,
  position   text,                 -- KL | DF | OS | FW
  value      numeric(5,1) default 6.0,
  updated_at timestamptz default now()
);
alter table public.players disable row level security;

-- 3) Site geneli duyuru
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  active     boolean default true,
  created_at timestamptz default now()
);
alter table public.announcements disable row level security;

-- 4) Ligler + üyeler (Liglerim altyapısı)
create table if not exists public.leagues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text unique not null,
  owner_id   uuid references public.users(id) on delete set null,
  created_at timestamptz default now()
);
create table if not exists public.league_members (
  league_id uuid references public.leagues(id) on delete cascade,
  user_id   uuid references public.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (league_id, user_id)
);
alter table public.leagues disable row level security;
alter table public.league_members disable row level security;

-- 5) Manuel hafta kilidi override (otomatik bozulursa müdahale)
create table if not exists public.week_overrides (
  round      integer primary key,
  locked     boolean not null,     -- true=kilitli, false=açık (kayıt yoksa otomatik)
  updated_at timestamptz default now()
);
alter table public.week_overrides disable row level security;

-- Kendini admin yapmak için (örnek):
-- update public.users set is_admin = true where email = 'seninmail@ornek.com';
