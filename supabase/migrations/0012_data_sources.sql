-- 0012_data_sources.sql
--
-- Oyuncu/fikstür verisinin son güncellemesinin KAYNAĞINI izler:
--   'manual' → admin panelindeki "Güncelle" butonu
--   'auto'   → 24s TTL dolduğunda uygulama açılışında API'den otomatik tazeleme
-- Admin > Fikstür sekmesindeki "Kaynak" göstergesi bu tablodan okur.
--
-- Kritik tablolara (players/fixtures) dokunmaz; ayrı, küçük bir meta tablosudur.
-- Uygulama katmanı bu tabloya yazarken/okurken hata durumunu YOK SAYAR; bu yüzden
-- migration uygulanmadan önce de uygulama sorunsuz çalışır (gösterge "—" olur).

create table if not exists public.data_sources (
  key        text primary key,          -- 'players' | 'fixtures'
  source     text not null,             -- 'manual' | 'auto'
  updated_at timestamptz not null default now()
);

alter table public.data_sources disable row level security;
