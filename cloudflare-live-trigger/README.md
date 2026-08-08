# ffs-live-trigger — Cloudflare Worker

GitHub Actions `live-scores` workflow'unu her 5 dakikada **güvenilir** tetikler.
(GitHub'ın kendi cron'u yük altında 35-50 dk gecikebiliyor; bu Worker o boşluğu kapatır.)

Bütün komutlar bu klasörde çalıştırılır:
```bash
cd /Users/acs/ffs-fantasy/cloudflare-live-trigger
```

## 1) GitHub token oluştur (fine-grained PAT)
1. https://github.com/settings/personal-access-tokens/new adresini aç.
2. **Token name:** `ffs-live-trigger`
3. **Expiration:** 90 gün (dolunca yenilersin).
4. **Repository access → Only select repositories →** `acansur/ffs-fantasy`.
5. **Permissions → Repository permissions → Actions →** `Read and write`.
   (Başka HİÇBİR izin verme.)
6. **Generate token** → çıkan `github_pat_...` değerini kopyala (bir daha gösterilmez).

## 2) Cloudflare'e giriş (hesabı da açar)
```bash
npx wrangler login
```
Tarayıcı açılır. Cloudflare hesabın yoksa "Sign up" ile ücretsiz aç, sonra "Allow" de.
Terminale "Successfully logged in" yazınca tamam.

## 3) Deploy et (Worker'ı oluşturur)
```bash
npx wrangler deploy
```
"Deployed ffs-live-trigger" + bir `*.workers.dev` adresi görürsün.
(Bu ilk deploy'da token henüz yok — sıradaki adımda ekleyince çalışır.)

## 4) Token'ı şifreli secret olarak ekle
```bash
npx wrangler secret put GH_TOKEN
```
Sorunca 1. adımdaki `github_pat_...` token'ını yapıştır → Enter.
(Token kodda değil, Cloudflare'de şifreli durur; ekledikten sonra otomatik geçerli olur.)

## 5) Çalışıyor mu test et
- Çıkan `https://ffs-live-trigger.<hesabın>.workers.dev` adresini tarayıcıda aç →
  "Tetiklendi ✓" görmelisin.
- GitHub → repo → **Actions → live-scores** → yeni bir çalışma başlamış olmalı.
- Canlı log izlemek istersen: `npx wrangler tail`

## Bakım
- Token 90 günde dolar → 1. adımı tekrarla, sonra `npx wrangler secret put GH_TOKEN`.
- GitHub'daki `schedule:` cron'u fallback olarak DURUYOR — bu Worker düşse bile ara sıra çalışır.
