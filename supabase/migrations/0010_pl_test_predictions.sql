-- FFS Fantasy — /pl-test/kim-kazanir tahmin oyunu için AYRI tablo.
--
-- ⚠️ VERİ İZOLASYONU: /kim-kazanir'ın match_predictions/prediction_points
-- tablolarından tamamen bağımsızdır. /pl-test/kim-kazanir YALNIZCA buraya yazar.
-- Hafta toplam puanları doğrudan bu tablodan (points toplanarak) hesaplanır;
-- ayrı bir "points" cache tablosuna gerek yoktur.
--
-- ⚠️ RLS KAPALI (prototip), diğer tablolarla aynı yaklaşım.

create table if not exists public.pl_test_predictions (
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
alter table public.pl_test_predictions disable row level security;
