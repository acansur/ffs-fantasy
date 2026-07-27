-- FFS Fantasy — custom users tablosu
--
-- ⚠️ UYARI (prototip amaçlı tasarım):
--   * password bcrypt HASH olarak saklanır (düz metin değil).
--   * Ancak RLS KAPALIDIR ve anon key istemcide herkese açıktır; bu yüzden
--     siteyi açan herkes tüm kullanıcı satırlarını (username/email/hash)
--     okuyabilir. Hash'ler kırılmaya karşı bir miktar koruma sağlar ama
--     satırların herkese açık okunabilir olması yine de risklidir.
--   Prod için Supabase Auth + RLS'e geçilmeli.

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
