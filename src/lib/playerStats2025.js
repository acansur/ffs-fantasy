// /players2 (admin) — Bu sezon Süper Lig kadrosundaki oyuncuların GEÇEN SEZON
// (2025-26) puanlama sistemimizle hesaplanmış performansı.
//
// Not: API-Football'da /fixtures/players yalnızca `fixture` ile çalışır (oyuncu+sezon
// modu yok). Bu yüzden geçen sezonun tüm maçları (fixtures/players + fixtures/events)
// çekilir, her maç scoring.js ile puanlanır ve oyuncu bazında toplanır.
//
// Ana uygulama verisine/tablolarına dokunmaz.

import { scoreFixture } from './scoring.js'
import { loadSuperLigPlayers } from './apiFootball.js'

const LEAGUE = 203
const LAST_SEASON = 2025
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])

// scoring.js part.key → Türkçe kategori adı (detay panelinde gösterilir)
const CAT = {
  minutes: 'Oynama süresi',
  goals: 'Gol',
  assists: 'Asist',
  cleansheet: 'Clean sheet',
  conceded: 'Yenilen gol',
  saves: 'Kurtarış',
  penSaved: 'Penaltı kurtardı',
  keyPass: 'Kilit pas',
  tackles: 'Top kapma',
  duels: 'İkili mücadele',
  dribbles: 'Dribling',
  shots: 'İsabetli şut',
  fouls: 'Faul',
  offsides: 'Ofsayt',
  ownGoal: 'Kendi kalesine gol',
  penCommitted: 'Penaltıya sebebiyet',
  penMissed: 'Penaltı kaçırdı',
  penWon: 'Penaltı kazandı',
  yellow: 'Sarı kart',
  red: 'Kırmızı kart',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, attempt = 0) {
  const res = await fetch(url)
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* boş */
  }
  const errs = data?.errors
  const rateLimited =
    errs && typeof errs === 'object' && JSON.stringify(errs).toLowerCase().includes('too many')
  if (rateLimited && attempt < 8) {
    await sleep(6000 + attempt * 3000)
    return getJson(url, attempt + 1)
  }
  return data
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// SAF: maç verilerini (players+events) oyuncu bazında topla.
// fixtureData → [{ players, events }]
// masterById  → Map<id, { id, name, team, pos }>  (bu sezon kadrosu)
// Dönüş: satır dizisi (player_season_stats_2025 şeması)
export function aggregateSeason(fixtureData, masterById) {
  const agg = new Map() // id → { matches, totalPoints, cats: { key: {points, matches} } }
  for (const { players, events } of fixtureData) {
    const scored = scoreFixture(players, events) // kaptan bonusu YOK (captainId null)
    for (const s of scored) {
      if ((s.minutes ?? 0) <= 0) continue // oynamadı → maç sayılmaz
      let a = agg.get(s.id)
      if (!a) {
        a = { matches: 0, totalPoints: 0, cats: {} }
        agg.set(s.id, a)
      }
      a.matches += 1
      a.totalPoints += s.total
      for (const part of s.parts) {
        const c = (a.cats[part.key] ??= { points: 0, matches: 0 })
        c.points += part.pts
        c.matches += 1
      }
    }
  }

  const rows = []
  for (const p of masterById.values()) {
    const a = agg.get(p.id)
    if (a && a.matches > 0) {
      const breakdown = {}
      for (const [key, v] of Object.entries(a.cats)) {
        breakdown[CAT[key] || key] = {
          points: Math.round(v.points),
          matches: v.matches,
          per_match: +(v.points / v.matches).toFixed(2),
        }
      }
      rows.push({
        player_id: p.id,
        player_name: p.name,
        team_name: p.team,
        position: p.pos,
        matches_played: a.matches,
        total_points: Math.round(a.totalPoints),
        points_per_match: +(a.totalPoints / a.matches).toFixed(2),
        stats_breakdown: breakdown,
      })
    } else {
      // Geçen sezon hiç oynamadı
      rows.push({
        player_id: p.id,
        player_name: p.name,
        team_name: p.team,
        position: p.pos,
        matches_played: 0,
        total_points: null,
        points_per_match: null,
        stats_breakdown: {},
      })
    }
  }
  return rows
}

// Tüm maçların players+events verisini çeker (eşzamanlılık + kısa bekleme + rate-limit retry)
async function fetchAllFixtureData(fixtureIds, onProgress) {
  let done = 0
  const out = await mapWithConcurrency(fixtureIds, 3, async (id) => {
    const [p, e] = await Promise.all([
      getJson(`/api/football?path=fixtures/players&fixture=${id}`),
      getJson(`/api/football?path=fixtures/events&fixture=${id}`),
    ])
    done += 1
    onProgress?.({ phase: 'matches', done, total: fixtureIds.length })
    await sleep(120) // istekler arası kısa bekleme
    return { players: p.response || [], events: e.response || [] }
  })
  return out
}

// TAM AKIŞ (API → toplama). Supabase'e YAZMAZ; satırları döndürür.
export async function computeAllPlayerStats(onProgress) {
  onProgress?.({ phase: 'squads' })
  const { players } = await loadSuperLigPlayers() // bu sezon (season=2026)
  const master = new Map()
  for (const p of players) {
    const pos = p.position === 'GK' ? 'KL' : p.position
    if (!['KL', 'DF', 'OS', 'FW'].includes(pos)) continue
    if (!master.has(p.id)) master.set(p.id, { id: p.id, name: p.name, team: p.team, pos })
  }

  onProgress?.({ phase: 'fixtures' })
  const fxData = await getJson(`/api/football?path=fixtures&league=${LEAGUE}&season=${LAST_SEASON}`)
  const finished = (fxData.response || []).filter((f) => FINISHED.has(f.fixture?.status?.short))
  const ids = finished.map((f) => f.fixture.id)

  const data = await fetchAllFixtureData(ids, onProgress)

  onProgress?.({ phase: 'aggregate' })
  return aggregateSeason(data, master)
}

export { CAT }
