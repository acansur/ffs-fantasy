// API-Football (api-sports.io) entegrasyonu — Süper Lig fikstürü
// Docs: https://www.api-football.com/documentation-v3
// Key: .env dosyasındaki VITE_API_FOOTBALL_KEY

const API_BASE = 'https://v3.football.api-sports.io'
const SUPER_LIG_ID = 203 // Süper Lig (Türkiye)
const SEASON = 2026 // 2026-27 sezonu

// Süper Lig 2026-27 fikstürünü çeker.
// Dönüş: { count, rounds, fixtures } | null
export async function fetchSuperLigFixtures() {
  const key = import.meta.env.VITE_API_FOOTBALL_KEY
  if (!key) {
    console.warn(
      '[FFS] VITE_API_FOOTBALL_KEY tanımlı değil — fikstür çekilemedi. .env dosyasına ekle.'
    )
    return null
  }

  try {
    const url = `${API_BASE}/fixtures?league=${SUPER_LIG_ID}&season=${SEASON}`
    const res = await fetch(url, { headers: { 'x-apisports-key': key } })
    const data = await res.json()

    // API-Football hataları response gövdesinde döner (HTTP 200 olsa bile)
    const errs = data?.errors
    const hasErrors = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0
    if (hasErrors) {
      console.error('[FFS] API-Football hata:', errs)
      return null
    }

    const fixtures = data?.response ?? []
    // Haftaları (round) benzersizleştir ve sırala
    const rounds = [...new Set(fixtures.map((f) => f.league?.round).filter(Boolean))].sort(
      (a, b) => {
        const na = Number(a.match(/\d+/)?.[0] ?? 0)
        const nb = Number(b.match(/\d+/)?.[0] ?? 0)
        return na - nb
      }
    )

    console.log(
      `[FFS] Süper Lig 2026-27 fikstürü — Toplam maç: ${fixtures.length}, Hafta sayısı: ${rounds.length}`
    )
    console.log('[FFS] Haftalar:', rounds)
    if (fixtures[0]) {
      const f = fixtures[0]
      console.log(
        '[FFS] Örnek maç:',
        `${f.teams?.home?.name} - ${f.teams?.away?.name}`,
        `| ${f.league?.round}`,
        `| ${f.fixture?.date}`
      )
    }
    // Ham veriyi de incelemek için:
    console.log('[FFS] Ham fikstür verisi:', fixtures)

    return { count: fixtures.length, rounds, fixtures }
  } catch (err) {
    console.error('[FFS] Fikstür çekme hatası:', err)
    return null
  }
}
