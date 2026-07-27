# FFS Fantasy Süper Lig ⚽

Türkiye Süper Ligi için fantasy futbol platformu. Kadronu kur, her hafta puan
topla, arkadaşlarınla mini liglerde yarış.

## Teknoloji Yığını

- **React 19** + **Vite** — arayüz ve build aracı
- **React Router** — sayfa yönlendirme
- **Supabase** — veritabanı, kimlik doğrulama ve gerçek zamanlı veri
- **Vercel** — dağıtım (deployment)

## Geliştirme

```bash
npm install        # bağımlılıkları kur
npm run dev        # geliştirme sunucusu (http://localhost:5173)
npm run build      # üretim derlemesi
npm run preview    # derlemeyi yerelde önizle
npm run lint       # oxlint ile kod denetimi
```

## Ortam Değişkenleri

`.env.example` dosyasını `.env` olarak kopyala ve Supabase bilgilerini gir:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Değerleri [Supabase](https://app.supabase.com) → Project Settings → API
bölümünden alabilirsin. `.env` dosyası git'e gönderilmez.

## Proje Yapısı

```
src/
  components/   # Navbar, Footer gibi ortak bileşenler
  pages/        # Home, Lig, Takımım, NotFound sayfaları
  lib/
    supabase.js # Supabase istemci yapılandırması
  App.jsx       # router ve genel yerleşim
  main.jsx      # uygulama giriş noktası
```

## Vercel'e Dağıtım

1. Vercel'de yeni proje oluştur ve bu GitHub deposunu bağla.
2. Environment Variables bölümüne `VITE_SUPABASE_URL` ve
   `VITE_SUPABASE_ANON_KEY` değerlerini ekle.
3. Framework preset otomatik olarak **Vite** algılanır; `npm run build`
   komutu `dist/` çıktısını üretir.

## Yol Haritası

- [ ] Supabase ile kullanıcı kaydı / giriş
- [ ] Oyuncu veritabanı ve kadro kurma ekranı
- [ ] Haftalık puanlama motoru
- [ ] Transfer sistemi
- [ ] Mini lig oluşturma ve davet
