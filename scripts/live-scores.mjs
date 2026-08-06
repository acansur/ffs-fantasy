// scripts/live-scores.mjs
//
// GitHub Actions (.github/workflows/live-scores.yml) tarafından her 5 dakikada
// bir çalıştırılır. O an OYNANAN Süper Lig maçlarının oyuncu puanlarını
// scoring.js motoruyla hesaplayıp Supabase live_scores tablosuna upsert eder.
//
// KOTA KORUMASI: Önce tek bir "canlı maçlar" isteği yapılır. Oynanan maç yoksa
// hiçbir /fixtures/players | /fixtures/events çağrısı yapılmadan çıkılır.
//
// Gerekli ortam değişkenleri (GitHub Secrets):
//   API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// İsteğe bağlı: LEAGUE_ID (varsayılan 203 = Süper Lig)

import { scoreFixture } from '../src/lib/scoring.js'

const API_KEY = process.env.API_FOOTBALL_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

const LEAGUE_ID = Number(process.env.LEAGUE_ID || 203) // Süper Lig
const API_BASE = 'https://v3.football.api-sports.io'

// Sahada oynanan (in-play) durum kodları. `live=` zaten yalnızca oynanan
// maçları döndürür; yine de güvenlik için filtreleriz.
const IN_PLAY = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'SUSP', 'INT'])

function requireEnv() {
  const missing = ['API_FOOTBALL_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(
    (k) => !process.env[k]
  )
  if (missing.length) {
    console.error('Eksik secret(lar):', missing.join(', '))
    process.exit(1)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// API-Football GET (rate limit'e karşı basit yeniden deneme)
async function apiGet(path, attempt = 0) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'x-apisports-key': API_KEY } })
  const data = await res.json().catch(() => ({}))
  const errs = data?.errors
  const tooMany =
    errs && typeof errs === 'object' && JSON.stringify(errs).toLowerCase().includes('too many')
  if (tooMany && attempt < 5) {
    await sleep(6000 + attempt * 3000) // dakikalık pencere sıfırlanana kadar bekle
    return apiGet(path, attempt + 1)
  }
  return data
}

// live_scores tablosuna fixture_id bazlı upsert (PostgREST)
async function upsertLiveScores(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/live_scores?on_conflict=fixture_id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Supabase upsert ${res.status}: ${t}`)
  }
}

// Skorlanmış oyuncuyu kompakt tut (tablo şişmesin)
function slim(s) {
  return {
    id: s.id,
    name: s.name,
    teamId: s.teamId,
    position: s.position,
    minutes: s.minutes,
    base: s.base,
    total: s.total,
    parts: s.parts,
  }
}

async function main() {
  requireEnv()

  // 1) Canlı maçlar — TEK istek. Boşsa hiçbir şey yapma (kota korunur).
  const live = await apiGet(`/fixtures?live=${LEAGUE_ID}`)
  const fixtures = (live?.response || []).filter((f) => IN_PLAY.has(f?.fixture?.status?.short))

  if (!fixtures.length) {
    console.log('Canlı maç yok — çıkılıyor (kota korundu).')
    return
  }
  console.log(`Canlı maç: ${fixtures.length}`)

  const nowIso = new Date().toISOString()
  const rows = []

  // 2) Her maç için oyuncu istatistikleri + olaylar → puanlar
  for (const f of fixtures) {
    const fid = f.fixture.id
    const [pl, ev] = await Promise.all([
      apiGet(`/fixtures/players?fixture=${fid}`),
      apiGet(`/fixtures/events?fixture=${fid}`),
    ])
    const scored = scoreFixture(pl?.response || [], ev?.response || [])
    rows.push({
      fixture_id: fid,
      league_id: f?.league?.id ?? LEAGUE_ID,
      season: f?.league?.season ?? null,
      status: f?.fixture?.status?.short ?? null,
      elapsed: f?.fixture?.status?.elapsed ?? null,
      home_team_id: f?.teams?.home?.id ?? null,
      away_team_id: f?.teams?.away?.id ?? null,
      home_goals: f?.goals?.home ?? null,
      away_goals: f?.goals?.away ?? null,
      players: scored.map(slim),
      updated_at: nowIso,
    })
    console.log(`  fixture ${fid} (${f?.fixture?.status?.short}): ${scored.length} oyuncu puanlandı`)
    await sleep(300) // API'ye nazik davran
  }

  // 3) Tek upsert isteğinde tüm maçları yaz
  await upsertLiveScores(rows)
  console.log(`live_scores güncellendi: ${rows.length} maç`)
}

main().catch((e) => {
  console.error('Hata:', e?.message || e)
  process.exit(1)
})
