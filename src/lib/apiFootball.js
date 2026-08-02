// API-Football entegrasyonu — Vercel serverless proxy üzerinden.
// İstemci doğrudan API'ye gitmez; /api/football proxy'sine gider ve key
// sunucuda kalır (API_FOOTBALL_KEY). Docs: https://www.api-football.com

const SUPER_LIG_ID = 203 // Süper Lig (Türkiye)
const SEASON = 2026 // 2026-27 sezonu

// Süper Lig 2026-27 fikstürünü proxy üzerinden çeker.
// Dönüş: { count, rounds, fixtures } | null
export async function fetchSuperLigFixtures() {
  try {
    const url = `/api/football?path=fixtures&league=${SUPER_LIG_ID}&season=${SEASON}`
    const res = await fetch(url)
    const data = await res.json()

    if (!res.ok) {
      console.error('[FFS] Proxy/API hatası:', data?.error || res.status, data)
      return null
    }

    // API-Football hataları response gövdesinde döner (HTTP 200 olsa bile)
    const errs = data?.errors
    const hasErrors = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0
    if (hasErrors) {
      console.error('[FFS] API-Football hata:', errs)
      return null
    }

    const fixtures = data?.response ?? []
    const rounds = [...new Set(fixtures.map((f) => f.league?.round).filter(Boolean))].sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0)
      const nb = Number(b.match(/\d+/)?.[0] ?? 0)
      return na - nb
    })

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
    console.log('[FFS] Ham fikstür verisi:', fixtures)

    return { count: fixtures.length, rounds, fixtures }
  } catch (err) {
    console.error('[FFS] Fikstür çekme hatası:', err)
    return null
  }
}
