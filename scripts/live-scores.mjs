// scripts/live-scores.mjs
//
// GitHub Actions (.github/workflows/live-scores.yml) tarafından her 5 dakikada
// bir çalıştırılır. O an OYNANAN Süper Lig (203) ve Polonya Ekstraklasa (106)
// maçlarının oyuncu puanlarını scoring.js motoruyla hesaplayıp Supabase
// live_scores tablosuna upsert eder.
//
// İKİ AŞAMA:
//   1) CANLI: oynanan maçlar status='IN_PLAY' işaretiyle yazılır (5 dk'da bir).
//   2) FINALIZE (FT): bir önceki turda 'IN_PLAY' işaretli olup API'nin canlı
//      listesinden DÜŞEN maçlar bitmiş olabilir. Gerçek durumları /fixtures?ids=
//      ile doğrulanır; FT/AET/PEN/WO olanların FINAL istatistiği BİR KEZ çekilip
//      status='FT' ile yazılır. Bundan sonra o maç bir daha API'ye sorulmaz.
//      Böylece client (weekScores.js) tüm puanları yalnızca live_scores'tan okur.
//
// KOTA KORUMASI: Her iki lig TEK "canlı maçlar" isteğiyle sorgulanır
// (live=203-106). Finalize yalnızca yeni biten maç başına bir kez /fixtures/players
// çeker. Yazılacak (canlı ya da yeni biten) maç yoksa hiç ek çağrı yapılmaz.
//
// Gerekli ortam değişkenleri (GitHub Secrets):
//   API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// İsteğe bağlı: LEAGUE_IDS (tire ile; varsayılan "203-106")

import { scoreFixture } from '../src/lib/scoring.js'

const API_KEY = process.env.API_FOOTBALL_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

// İzlenen ligler: Süper Lig (203) + Polonya Ekstraklasa (106). API-Football
// `live=` parametresi tire ile birden çok lig id'si kabul eder → tek istek.
const LEAGUE_IDS = (process.env.LEAGUE_IDS || '203-106')
  .split('-')
  .map((s) => s.trim())
  .filter(Boolean)
const API_BASE = 'https://v3.football.api-sports.io'

// Sahada oynanan (in-play) durum kodları. `live=` zaten yalnızca oynanan
// maçları döndürür; yine de güvenlik için filtreleriz.
const IN_PLAY = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'SUSP', 'INT'])
// Bitmiş (puanların kesinleştiği) durum kodları → finalize hedefi.
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])

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

// Fixture nesnesi + skorlanmış oyunculardan live_scores satırı üretir.
// statusMarker: 'IN_PLAY' (oynanıyor) | 'FT' (final yazıldı).
function buildRow(f, scored, statusMarker, nowIso) {
  return {
    fixture_id: f.fixture.id,
    league_id: f?.league?.id ?? null,
    season: f?.league?.season ?? null,
    status: statusMarker,
    elapsed: f?.fixture?.status?.elapsed ?? null,
    home_team_id: f?.teams?.home?.id ?? null,
    away_team_id: f?.teams?.away?.id ?? null,
    home_goals: f?.goals?.home ?? null,
    away_goals: f?.goals?.away ?? null,
    players: scored.map(slim),
    updated_at: nowIso,
  }
}

// Supabase: hâlâ 'IN_PLAY' işaretli (henüz finalize edilmemiş) maç id'leri.
async function fetchInPlayFixtureIds() {
  const url = `${SUPABASE_URL}/rest/v1/live_scores?status=eq.IN_PLAY&select=fixture_id`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) {
    console.error(`Supabase okuma ${res.status}: ${await res.text().catch(() => '')}`)
    return []
  }
  const data = await res.json().catch(() => [])
  return (Array.isArray(data) ? data : []).map((r) => r.fixture_id).filter((x) => x != null)
}

// API-Football: verilen fixture id'lerinin GÜNCEL durumunu döner.
// `ids=` tirelemeli ve en fazla 20 id kabul eder → gruplara böleriz.
// Dönüş: Map<fixtureId, fixtureObj>
async function fetchFixtureStatuses(ids) {
  const map = new Map()
  const CHUNK = 20
  for (let i = 0; i < ids.length; i += CHUNK) {
    const group = ids.slice(i, i + CHUNK)
    const data = await apiGet(`/fixtures?ids=${group.join('-')}`)
    for (const f of data?.response || []) {
      if (f?.fixture?.id != null) map.set(f.fixture.id, f)
    }
    await sleep(300)
  }
  return map
}

async function main() {
  requireEnv()
  const nowIso = new Date().toISOString()

  // 1) Şu an OYNANAN maçlar — TEK istek (iki lig birden).
  const live = await apiGet(`/fixtures?live=${LEAGUE_IDS.join('-')}`)
  const liveFixtures = (live?.response || []).filter((f) => IN_PLAY.has(f?.fixture?.status?.short))
  const liveIds = new Set(liveFixtures.map((f) => f.fixture.id))
  console.log(`Canlı maç: ${liveFixtures.length}`)

  const rows = []

  // 2) FINALIZE (FT): 'IN_PLAY' işaretli olup artık canlı listede OLMAYAN maçlar
  //    bitmiş olabilir. Gerçek durumlarını doğrula; final olanların istatistiğini
  //    BİR KEZ çekip status='FT' ile yaz.
  const believedLive = await fetchInPlayFixtureIds()
  const disappeared = believedLive.filter((id) => !liveIds.has(id))
  if (disappeared.length) {
    console.log(`Canlıdan düşen (durum kontrol edilecek): ${disappeared.length}`)
    const statusById = await fetchFixtureStatuses(disappeared)
    for (const id of disappeared) {
      const f = statusById.get(id)
      const short = f?.fixture?.status?.short
      if (!short || !FINISHED.has(short)) {
        console.log(`  fixture ${id}: durum '${short || '??'}' → henüz final değil, atlandı`)
        continue // henüz bitmemiş / erteleme → sonraki turda tekrar bakılır
      }
      const [pl, ev] = await Promise.all([
        apiGet(`/fixtures/players?fixture=${id}`),
        apiGet(`/fixtures/events?fixture=${id}`),
      ])
      const scored = scoreFixture(pl?.response || [], ev?.response || [])
      rows.push(buildRow(f, scored, 'FT', nowIso))
      console.log(`  fixture ${id} (${short}): FINAL yazıldı — ${scored.length} oyuncu`)
      await sleep(300)
    }
  }

  // 3) CANLI maçlar: oyuncu istatistikleri + olaylar → puanlar (status='IN_PLAY')
  for (const f of liveFixtures) {
    const fid = f.fixture.id
    const [pl, ev] = await Promise.all([
      apiGet(`/fixtures/players?fixture=${fid}`),
      apiGet(`/fixtures/events?fixture=${fid}`),
    ])
    const scored = scoreFixture(pl?.response || [], ev?.response || [])
    rows.push(buildRow(f, scored, 'IN_PLAY', nowIso))
    console.log(`  fixture ${fid} (IN_PLAY): ${scored.length} oyuncu puanlandı`)
    await sleep(300) // API'ye nazik davran
  }

  // 4) Tek upsert isteğinde tüm satırları yaz (kota: yazılacak yoksa hiç çağrı yok)
  if (!rows.length) {
    console.log('Yazılacak (canlı/final) maç yok — çıkılıyor (kota korundu).')
    return
  }
  await upsertLiveScores(rows)
  const finalCount = rows.filter((r) => r.status === 'FT').length
  console.log(`live_scores güncellendi: ${rows.length} maç (${finalCount} final)`)
}

main().catch((e) => {
  console.error('Hata:', e?.message || e)
  process.exit(1)
})
