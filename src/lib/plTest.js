// Polonya Ekstraklasa test ortamı (/pl-test) — yapılandırma + veri.
//
// Süper Lig fantasy (Takımım/Transfer) ile BİREBİR aynı arayüz/mantık; yalnızca
// veri kaynağı ve Supabase tabloları farklı (pl_test_*). Ana uygulamanın veri
// akışına dokunmaz.
//
// 7-9 Ağustos 2026 Ekstraklasa 3. hafta — 7 maç gösterilir/puanlanır, oyuncu
// HAVUZU 18 takımın tümüdür. Her oyuncu ₺6M, bütçe ₺100M, kulüp limiti 3.

import { clubColors, clubShort } from './apiFootball.js'

const LEAGUE_ID = 106
const SEASON = 2026
export const PL_PLAYER_PRICE = 6

// Gösterilen/puanlanan 7 maç (fixture id'leri). Round uygulamada 1'e remap edilir.
export const PL_FIXTURE_IDS = [1553127, 1553124, 1553123, 1553121, 1553126, 1553122, 1553120]

// Ligin 18 takımı (referans). Picker YALNIZCA 7 maçta oynayan 14 takımı gösterir
// (PL_MATCH_TEAMS); ertelenen maçların takımları hariç tutulur.
export const PL_POOL_TEAMS = [
  { id: 350, name: 'Cracovia Krakow' },
  { id: 3484, name: 'GKS Katowice' },
  { id: 340, name: 'Gornik Zabrze' },
  { id: 336, name: 'Jagiellonia' },
  { id: 346, name: 'Korona Kielce' },
  { id: 347, name: 'Lech Poznan' },
  { id: 339, name: 'Legia Warszawa' },
  { id: 14562, name: 'Motor Lublin' },
  { id: 349, name: 'Piast Gliwice' },
  { id: 348, name: 'Pogon Szczecin' },
  { id: 4248, name: 'Radomiak Radom' },
  { id: 3491, name: 'Raków Częstochowa' },
  { id: 337, name: 'Slask Wroclaw' },
  { id: 6962, name: 'Widzew Łódź' },
  { id: 17115, name: 'Wieczysta Kraków' },
  { id: 338, name: 'Wisla Krakow' },
  { id: 341, name: 'Wisla Plock' },
  { id: 345, name: 'Zaglebie Lubin' },
]

// Ertelenen maçların takımları — picker'da GÖRÜNMEZ:
// Raków (3491), Zaglebie Lubin (345), GKS Katowice (3484), Wieczysta Kraków (17115).
const POSTPONED_TEAM_IDS = new Set([3491, 345, 3484, 17115])

// 7 maçta oynayan 14 takım — picker + oyuncu havuzu bu takımlarla sınırlıdır.
export const PL_MATCH_TEAMS = PL_POOL_TEAMS.filter((t) => !POSTPONED_TEAM_IDS.has(t.id))

const POSITION_MAP = { Goalkeeper: 'KL', Defender: 'DF', Midfielder: 'OS', Attacker: 'FW' }

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

async function getJson(url) {
  const res = await fetch(url)
  try {
    return await res.json()
  } catch {
    return {}
  }
}

// Bir takımın kadrosu → uygulama oyuncu nesneleri (₺6M sabit)
async function fetchTeamSquad(team) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const d = await getJson(`/api/football?path=players/squads&team=${team.id}`)
    const block = d?.response?.[0]
    const players = block?.players ?? []
    const teamName = block?.team?.name || team.name
    if (players.length) {
      const colors = clubColors(teamName)
      return players
        .map((p) => {
          const pos = POSITION_MAP[p.position] || null
          if (!pos) return null
          return {
            id: p.id,
            name: p.name,
            pos,
            club: teamName,
            clubShort: clubShort(teamName),
            clubBg: colors.bg,
            clubFg: colors.fg,
            price: PL_PLAYER_PRICE,
          }
        })
        .filter(Boolean)
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
  }
  return []
}

// 7 maçtaki 14 takımın tüm oyuncuları — { players, teams } (app formatı).
let _playersPromise = null
export function loadPlPlayers() {
  if (!_playersPromise) {
    _playersPromise = (async () => {
      const squads = await mapWithConcurrency(PL_MATCH_TEAMS, 3, fetchTeamSquad)
      const seen = new Set()
      const players = []
      for (const list of squads) {
        for (const p of list) {
          if (seen.has(p.id)) continue
          seen.add(p.id)
          players.push(p)
        }
      }
      const teams = PL_MATCH_TEAMS.map((t) => ({ name: t.name })).sort((a, b) =>
        a.name.localeCompare(b.name, 'tr')
      )
      return { players, teams }
    })().catch((e) => {
      _playersPromise = null
      throw e
    })
  }
  return _playersPromise
}

// 7 maçın canlı durumunu (status/skor/tarih) çeker. Round 1'e remap edilir ki
// hafta seçici "1. Hafta" göstersin ve getTeamFixture(round=1) eşleşsin.
let _fixturesPromise = null
export function loadPlFixtures({ force = false } = {}) {
  if (force) _fixturesPromise = null
  if (!_fixturesPromise) {
    _fixturesPromise = (async () => {
      const idSet = new Set(PL_FIXTURE_IDS)
      const dates = ['2026-08-07', '2026-08-08', '2026-08-09']
      const all = []
      for (const date of dates) {
        const d = await getJson(
          `/api/football?path=fixtures&league=${LEAGUE_ID}&season=${SEASON}&date=${date}&timezone=Europe/Istanbul`
        )
        for (const f of d?.response || []) {
          if (idSet.has(f.fixture?.id)) {
            // Round'u 1'e remap et (tek hafta)
            all.push({ ...f, league: { ...f.league, round: 'Regular Season - 1' } })
          }
        }
      }
      return { fixtures: all }
    })().catch((e) => {
      _fixturesPromise = null
      throw e
    })
  }
  return _fixturesPromise
}
