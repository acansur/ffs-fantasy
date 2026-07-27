-- FFS Fantasy — custom users tablosu
--
-- ⚠️ UYARI (prototip amaçlı tasarım):
--   * password DÜZ METİN olarak saklanır (hash yok).
--   * RLS KAPALIDIR ve anon key istemcide herkese açıktır.
--   Bu ikisi birlikte, siteyi açan herkesin tüm kullanıcı satırlarını
--   (username/email/password) okuyabilmesi demektir. Gerçek kullanıcı
--   verisiyle KULLANMA. Prod için Supabase Auth + RLS'e geçilmeli.

create table public.users (
  id            uuid        primary key default gen_random_uuid(),
  username      text        unique not null,
  email         text        unique not null,
  password      text        not null,
  favorite_team text,
  created_at    timestamptz default now(),
  last_seen     timestamptz
);

-- RLS kapalı
alter table public.users disable row level security;
