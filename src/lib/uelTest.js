// UEL test sayfası (/uel-test, /uel-test2) — yapılandırma + veri.
//
// 6 Ağustos 2026 UEFA Europa League play-off maçları. Oyuncular API'den
// (players/squads) çekilir, her biri ₺6M. Puanlar scoring.js ile hesaplanır.
// Bu modül YALNIZCA test sayfaları içindir; ana uygulamanın veri akışına
// (Süper Lig fikstürü/oyuncuları, SquadProvider) dokunmaz.

import { clubColors, clubShort } from './apiFootball.js'
import { scoreFixturesDetailed } from './weekScores.js'

const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])

// Tüm oyuncular sabit değerde
export const UEL_PLAYER_PRICE = 6

// Deadline: 6 Ağustos 2026 20:30 (Türkiye saati, UTC+3) — ilk 3 maç oynandı,
// kalan ilk maçtan (21:00) 30 dk önce.
// Deadline: 6 Ağustos 2026 20:15 TR (PAOK vs Anderlecht'ten 30 dk önce)
export const UEL_DEADLINE_MS = Date.parse('2026-08-06T20:15:00+03:00')

// Kalan 3 maç (henüz başlamamış). Hepsi 2026-08-06.
export const UEL_FIXTURES = [
  { id: 1607565, home: { id: 619, name: 'PAOK' }, away: { id: 554, name: 'Anderlecht' } },
  { id: 1607179, home: { id: 1012, name: 'FC Thun' }, away: { id: 278, name: 'Vikingur Reykjavik' } },
  { id: 1607560, home: { id: 211, name: 'Benfica' }, away: { id: 254, name: 'Heart Of Midlothian' } },
]

// Gösterilen maçların takımları (3 maç → 6 takım) — picker bu takımlarla sınırlı
export const UEL_TEAMS = UEL_FIXTURES.flatMap((f) => [f.home, f.away])

// Oyuncu HAVUZU takımları: TÜM 20 takım. Maçlar UEL_FIXTURES'tan çıkarılsa da
// bu takımların oyuncuları mevcut kadro KAYITLARINDA olabileceğinden havuzda
// tutulur; aksi halde kayıtlı player_id'ler havuzda bulunamaz ve kadro boş görünür.
// (Picker yalnızca güncel 6 takımı gösterir; havuz yükleme/çözümleme içindir.)
export const UEL_POOL_TEAMS = [
  { id: 619, name: 'PAOK' },
  { id: 554, name: 'Anderlecht' },
  { id: 1012, name: 'FC Thun' },
  { id: 278, name: 'Vikingur Reykjavik' },
  { id: 211, name: 'Benfica' },
  { id: 254, name: 'Heart Of Midlothian' },
  { id: 347, name: 'Lech Poznan' },
  { id: 701, name: 'KI Klaksvik' },
  { id: 667, name: 'Lincoln Red Imps FC' },
  { id: 3402, name: 'Omonia Nicosia' },
  { id: 3723, name: 'Hradec Králové' },
  { id: 549, name: 'Beşiktaş' },
  { id: 571, name: 'Red Bull Salzburg' },
  { id: 3403, name: 'Pafos' },
  { id: 1165, name: 'KuPS' },
  { id: 632, name: 'Universitatea Craiova' },
  { id: 336, name: 'Jagiellonia' },
  { id: 257, name: 'Rangers' },
  { id: 604, name: 'Maccabi Tel Aviv' },
  { id: 853, name: 'CSKA Sofia' },
]

// API tam-mevki adı → UI mevki kodu
const POS_MAP = { Goalkeeper: 'KL', Defender: 'DF', Midfielder: 'OS', Attacker: 'FW' }

// Sınırlı eşzamanlılıkla map
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
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* boş */
  }
  return data
}

// Bir takımın kadrosu (rate limit'e karşı birkaç deneme)
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
          const pos = POS_MAP[p.position] || null
          if (!pos) return null
          return {
            id: p.id,
            name: p.name,
            pos,
            club: teamName,
            teamId: team.id,
            clubShort: clubShort(teamName),
            clubBg: colors.bg,
            clubFg: colors.fg,
            price: UEL_PLAYER_PRICE,
          }
        })
        .filter(Boolean)
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
  }
  return []
}

// 20 takımın tüm oyuncuları (modül düzeyinde önbellek — promise)
let _playersPromise = null
export function loadUelPlayers() {
  if (!_playersPromise) {
    _playersPromise = (async () => {
      const squads = await mapWithConcurrency(UEL_POOL_TEAMS, 3, fetchTeamSquad)
      const seen = new Set()
      const players = []
      for (const list of squads) {
        for (const p of list) {
          if (seen.has(p.id)) continue
          seen.add(p.id)
          players.push(p)
        }
      }
      return players
    })().catch((e) => {
      _playersPromise = null
      throw e
    })
  }
  return _playersPromise
}

// 10 maçın canlı durumunu (status/skor/tarih) çeker. Tek tarih sorgusu.
let _fixturesPromise = null
export function loadUelFixtures() {
  if (!_fixturesPromise) {
    _fixturesPromise = (async () => {
      const idSet = new Set(UEL_FIXTURES.map((f) => f.id))
      const d = await getJson('/api/football?path=fixtures&date=2026-08-06&timezone=Europe/Istanbul')
      const all = (d?.response || []).filter((f) => idSet.has(f.fixture?.id))
      return all
    })().catch((e) => {
      _fixturesPromise = null
      throw e
    })
  }
  return _fixturesPromise
}

// Oyuncunun takımının (teamId) maçı — canlı fixtures dizisinden
export function uelFixtureForTeam(fixtures, teamId) {
  return (
    fixtures.find((f) => f.teams?.home?.id === teamId || f.teams?.away?.id === teamId) || null
  )
}

// Kadrodaki oyuncuların bu etkinlikteki puanları.
// Dönüş: { ptsById: Map, finishedById: Map, partsById: Map<id, parts[]> }
export async function computeUelScores(players, fixtures) {
  const finishedById = new Map()
  const fixtureIds = new Set()
  for (const p of players) {
    const fx = uelFixtureForTeam(fixtures, p.teamId)
    const fin = FINISHED.has(fx?.fixture?.status?.short)
    finishedById.set(p.id, fin)
    if (fin && fx?.fixture?.id) fixtureIds.add(fx.fixture.id)
  }
  const detailed = await scoreFixturesDetailed(fixtureIds)
  const ptsById = new Map()
  const partsById = new Map()
  for (const [id, s] of detailed) {
    ptsById.set(id, s.total)
    partsById.set(id, s.parts)
  }
  return { ptsById, finishedById, partsById }
}
