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
import { computeSquadWeekTotal } from '../src/lib/fantasyScore.js'

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

/* ==================== FANTASY PUAN FINALIZE ==================== */
// Bir haftanın (round) SON maçı FT olunca, o haftanın TÜM kullanıcılarının fantasy
// puanını kadroları + live_scores'tan hesaplayıp fantasy_points'e yazar. Kullanıcının
// siteye girmesi GEREKMEZ. Puanlama client ile ORTAK modülden (fantasyScore.js) gelir
// → mantık ikiliği yok. league_id → dataset (SL/pl-test) eşlemesi:
const DATASETS = {
  203: { squads: 'squads', players: 'squad_players', transfers: 'squad_transfers', points: 'fantasy_points' },
  106: { squads: 'pl_test_squads', players: 'pl_test_squad_players', transfers: 'pl_test_squad_transfers', points: 'pl_test_fantasy_points' },
}
// Hafta TAMAMEN bitmiş → her oyuncu için "başladı/bitti" = true (Map benzeri).
const ALL_TRUE = { get: () => true }
const roundNumber = (round) => {
  const m = String(round || '').match(/\d+/)
  return m ? Number(m[0]) : null
}

// Supabase okuma (PostgREST GET). Hata → null.
async function sbSelect(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) {
    console.error(`Supabase select ${res.status}: ${await res.text().catch(() => '')}`)
    return null
  }
  return res.json().catch(() => null)
}

// Verilen tabloya on_conflict ile upsert.
async function sbUpsert(table, conflict, rows) {
  if (!rows.length) return
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Supabase upsert ${table} ${res.status}: ${await res.text().catch(() => '')}`)
}

async function finalizeFantasyForRound(leagueId, season, round) {
  const ds = DATASETS[leagueId]
  const week = roundNumber(round)
  if (!ds || week == null) return

  // 1) Round'un TÜM maçları FT mi? (yetkili kaynak: API)
  const rf = await apiGet(`/fixtures?league=${leagueId}&season=${season}&round=${encodeURIComponent(round)}`)
  const roundFx = rf?.response || []
  if (!roundFx.length) return
  const doneCount = roundFx.filter((f) => FINISHED.has(f?.fixture?.status?.short)).length
  if (doneCount < roundFx.length) {
    console.log(`  [fantasy] ${ds.points} hafta ${week}: ${doneCount}/${roundFx.length} maç bitti — bekle`)
    return
  }

  // 2) İdempotent: bu hafta zaten yazıldıysa atla (tek toplu upsert → all-or-nothing).
  const existing = await sbSelect(`${ds.points}?week=eq.${week}&select=user_id&limit=1`)
  if (Array.isArray(existing) && existing.length) {
    console.log(`  [fantasy] ${ds.points} hafta ${week}: zaten finalize edilmiş`)
    return
  }

  // 3) Round'un live_scores oyuncu toplamları → ptsById
  const fids = roundFx.map((f) => f.fixture.id)
  const ls = await sbSelect(`live_scores?fixture_id=in.(${fids.join(',')})&select=players`)
  const ptsById = new Map()
  for (const r of ls || []) for (const p of r.players || []) if (p?.id != null) ptsById.set(p.id, p.total ?? 0)

  // 4) O haftanın kadroları + oyuncuları + transfer kesintileri
  const squads = await sbSelect(`${ds.squads}?week=eq.${week}&select=id,user_id,captain_player_id`)
  if (!Array.isArray(squads) || !squads.length) {
    console.log(`  [fantasy] ${ds.points} hafta ${week}: kadro yok`)
    return
  }
  const squadIdList = squads.map((s) => `"${s.id}"`).join(',')
  const players = await sbSelect(`${ds.players}?squad_id=in.(${squadIdList})&select=squad_id,player_id,position_type,is_starter,bench_order`)
  const bySquad = new Map()
  for (const p of players || []) {
    if (!bySquad.has(p.squad_id)) bySquad.set(p.squad_id, [])
    bySquad.get(p.squad_id).push(p)
  }
  const transfers = await sbSelect(`${ds.transfers}?week=eq.${week}&select=user_id,point_deductions`)
  const dedByUser = new Map((Array.isArray(transfers) ? transfers : []).map((t) => [t.user_id, t.point_deductions || 0]))

  // 5) Her kullanıcı için ortak mantıkla hesapla (auto-sub + kaptan ×2 − kesinti)
  const stampIso = new Date().toISOString()
  const outRows = squads.map((s) => ({
    user_id: s.user_id,
    week,
    points: computeSquadWeekTotal({
      rows: bySquad.get(s.id) || [],
      captainPlayerId: s.captain_player_id,
      ptsById,
      finishedById: ALL_TRUE,
      startedById: ALL_TRUE,
      pointDeductions: dedByUser.get(s.user_id) || 0,
    }),
    updated_at: stampIso,
  }))
  await sbUpsert(ds.points, 'user_id,week', outRows)
  console.log(`  [fantasy] ${ds.points} hafta ${week}: ${outRows.length} kullanıcı finalize edildi ✅`)
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
  const finalizedFixtures = [] // bu turda FT'ye geçen maçlar (fantasy finalize için)

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
      finalizedFixtures.push(f)
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

  // 5) FANTASY FINALIZE: bu turda FT'ye geçen maçların round'ları için, o round'un
  //    TÜM maçları bittiyse o haftanın fantasy puanlarını herkese hesapla/yaz.
  //    Hata olsa bile live-scores işini bozmaz (try/catch). Kullanıcı girişi gerekmez.
  if (finalizedFixtures.length) {
    const seen = new Set()
    for (const f of finalizedFixtures) {
      const key = `${f.league?.id}:${f.league?.season}:${f.league?.round}`
      if (seen.has(key)) continue
      seen.add(key)
      try {
        await finalizeFantasyForRound(f.league?.id, f.league?.season, f.league?.round)
      } catch (e) {
        console.error(`  [fantasy] hata (${key}):`, e?.message || e)
      }
    }
  }
}

main().catch((e) => {
  console.error('Hata:', e?.message || e)
  process.exit(1)
})
