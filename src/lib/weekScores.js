// Haftalık puan hesabı + maç sonu otomatik yedek sistemi.
//
// - Bir haftadaki her oyuncunun puanı, takımının o haftaki maçından
//   (/fixtures/players + /fixtures/events) scoring.js motoruyla hesaplanır.
// - Yalnızca TAMAMLANMIŞ (FT/AET/PEN/WO) maçların verisi çekilir.
// - applyAutoSubs: haftanın son maçı bitince, ilk 11'de 0 puan alan
//   oyuncuları yedek sırasına göre aynı mevkideki puanlı yedeklerle değiştirir
//   (yalnızca görsel/puan; Supabase kaydı değişmez).

import { scoreFixture } from './scoring.js'
import { getTeamFixture } from './weeks.js'

// Bitmiş (puanların kesinleştiği) durum kodları. live_scores.status FT işaretini
// ve olası eski kodları (AET/PEN/WO) kapsar.
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])

// Fixture verisi önbelleği (fixtureId → Promise<{players, events}>).
// Aynı maç birden çok oyuncu için tekrar çekilmez.
const _cache = new Map()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, attempt = 0) {
  const res = await fetch(url)
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* boş yanıt */
  }
  const errs = data?.errors
  const rateLimited =
    errs && typeof errs === 'object' && JSON.stringify(errs).toLowerCase().includes('too many')
  if (rateLimited && attempt < 6) {
    await sleep(5000 + attempt * 2500) // dakikalık pencere sıfırlanana kadar bekle
    return getJson(url, attempt + 1)
  }
  return data
}

// Detaylı oyuncu istatistiği (/fixtures/players) OLMAYAN maçlar için (örn.
// UEL 2026 kalifikasyon, coverage statistics_players=false) lineups + events'ten
// sentetik oyuncu nesneleri üretir. Bu nesneler /fixtures/players yapısını taklit
// eder; yalnızca events/lineups'tan türetilebilen alanlar doldurulur:
//   games.position (lineup pos), games.minutes (ilk11 + değişiklik dakikaları),
//   goals.total, goals.assists, cards.yellow/red.
// Kurtarış/pas/top kapma/şut/dribling/faul gibi alanlar YOKTUR → motor bunları
// 0 sayar (kısmi puan). Kendi kalesine gol + clean sheet + yenilen gol motor
// tarafından zaten events'ten hesaplanır.
function synthesizePlayersFromLineups(lineups, events) {
  const MATCH_END = 90
  const subOut = new Map() // id → çıkış dakikası
  const subIn = new Map() // id → giriş dakikası
  for (const e of events) {
    if (e?.type !== 'subst') continue
    const t = e?.time?.elapsed ?? 0
    if (e?.player?.id != null) subOut.set(e.player.id, t) // player = ÇIKAN
    if (e?.assist?.id != null) subIn.set(e.assist.id, t) // assist = GİREN
  }
  const goals = new Map()
  const assists = new Map()
  const yellow = new Map()
  const red = new Map()
  const inc = (m, id) => { if (id != null) m.set(id, (m.get(id) || 0) + 1) }
  for (const e of events) {
    if (e?.type === 'Goal') {
      const d = e?.detail || ''
      if (d === 'Own Goal' || d === 'Missed Penalty') continue // gol değil / motorda ayrı
      if ((e?.comments || '').includes('Shootout')) continue // penaltı atışları gol sayılmaz
      inc(goals, e?.player?.id)
      inc(assists, e?.assist?.id)
    } else if (e?.type === 'Card') {
      const d = e?.detail || ''
      if (d === 'Yellow Card') inc(yellow, e?.player?.id)
      else if (d === 'Red Card') inc(red, e?.player?.id)
    }
  }
  const out = []
  for (const block of lineups) {
    const players = []
    const add = (lp, isStarter) => {
      const id = lp?.player?.id
      if (id == null) return
      let minutes
      if (isStarter) {
        minutes = subOut.has(id) ? subOut.get(id) : MATCH_END
      } else {
        if (!subIn.has(id)) return // sahaya girmedi → atla
        const outMin = subOut.has(id) ? subOut.get(id) : MATCH_END
        minutes = Math.max(0, outMin - subIn.get(id))
      }
      players.push({
        player: { id, name: lp?.player?.name },
        statistics: [{
          games: { position: lp?.player?.pos || null, minutes },
          goals: { total: goals.get(id) || 0, assists: assists.get(id) || 0 },
          cards: { yellow: yellow.get(id) || 0, red: red.get(id) || 0 },
        }],
      })
    }
    for (const lp of block?.startXI || []) add(lp, true)
    for (const lp of block?.substitutes || []) add(lp, false)
    out.push({ team: { id: block?.team?.id }, players })
  }
  return out
}

// force=true → önbelleği atla (canlı maçlarda taze istatistik için).
function fetchFixtureData(fixtureId, force = false) {
  if (force) _cache.delete(fixtureId)
  if (!_cache.has(fixtureId)) {
    _cache.set(
      fixtureId,
      (async () => {
        const [p, e] = await Promise.all([
          getJson(`/api/football?path=fixtures/players&fixture=${fixtureId}`),
          getJson(`/api/football?path=fixtures/events&fixture=${fixtureId}`),
        ])
        let players = p.response || []
        const events = e.response || []
        // Detaylı istatistik yoksa lineups + events'ten kısmi puan üret (fallback).
        if (!players.length) {
          const l = await getJson(`/api/football?path=fixtures/lineups&fixture=${fixtureId}`)
          const lineups = l.response || []
          if (lineups.length) players = synthesizePlayersFromLineups(lineups, events)
        }
        // Hâlâ boş (maç yeni bitti, API henüz doldurmadı) → önbelleğe ALMA;
        // sonraki tazelemede tekrar denensin, aksi halde puan kalıcı 0 kalır.
        if (!players.length) _cache.delete(fixtureId)
        return { players, events }
      })().catch(() => {
        _cache.delete(fixtureId) // hata → yeniden denenebilsin
        return { players: [], events: [] }
      })
    )
  }
  return _cache.get(fixtureId)
}

// Bir haftadaki oyuncuların puanlarını hesapla.
// players → uygulama oyuncu nesneleri ({ id, club, ... })
// liveMap → Map<fixture_id, live_scores satırı> (Takımım Supabase'den çeker)
//
// Maç DURUMU ve PUANLARI tamamen Supabase live_scores'tan gelir — API isteği YOK.
// Takvim (hangi takım hangi fixture'da) `fixtures` prop'undan alınır; oradan
// fixture_id bulunup liveMap'te aranır:
//   - Satır YOK → maç başlamadı (NS) → started=false.
//   - Satır var, status IN_PLAY (veya eski canlı kodu) → canlı → started, !finished.
//   - Satır var, status FT/AET/PEN/WO → bitmiş → started, finished.
// Puanlar satırdaki players[].total/parts'tan okunur. Tabloyu GitHub Actions
// cron'u besler (oynanırken 5 dk'da bir; bitince bir kez final 'FT' ile).
//
// finishedById auto-sub geçidi için (yalnızca FT), startedById gösterim için.
// Dönüş: { ptsById, finishedById, startedById, partsById }
export async function computeWeekScores(players, week, fixtures, liveMap) {
  const map = liveMap || new Map()
  const finishedById = new Map()
  const startedById = new Map()
  const ptsById = new Map()
  const partsById = new Map()

  for (const p of players) {
    const fx = getTeamFixture(fixtures, p.club, week)
    const fid = fx?.fixture?.id
    const row = fid != null ? map.get(fid) : null
    const started = Boolean(row) // live_scores satırı varsa maç başlamış
    startedById.set(p.id, started)
    finishedById.set(p.id, started && FINISHED.has(row.status))
  }

  // Puanlar: haftanın live_scores satırlarındaki oyuncular (canlı + final dahil).
  for (const row of map.values()) {
    for (const pl of row.players || []) {
      if (pl?.id == null) continue
      ptsById.set(pl.id, pl.total ?? 0)
      partsById.set(pl.id, pl.parts || [])
    }
  }

  return { ptsById, finishedById, startedById, partsById }
}

// Verilen fixture id'leri için tam skorlanmış oyuncu nesnesini döner →
// Map<playerId, {total, parts, ...}> (Takımım ve UEL test sayfası ortak kullanır)
// (puan kırılımı gösterimi için parts dahil.)
// liveIds → bu maçlar için önbellek atlanır (canlı maçta taze veri).
export async function scoreFixturesDetailed(fixtureIds, liveIds = new Set()) {
  const byId = new Map()
  await Promise.all(
    [...fixtureIds].map(async (id) => {
      const data = await fetchFixtureData(id, liveIds.has(id))
      const scored = scoreFixture(data.players, data.events)
      for (const s of scored) byId.set(s.id, s)
    })
  )
  return byId
}

// Otomatik yedek + toplam puan mantığı SAF modülde (client + cron ORTAK kullanır,
// drift olmasın). Buradan re-export → mevcut import edenler (Takımım) etkilenmez.
export { applyAutoSubs, computeTotalPoints, computeSquadWeekTotal } from './fantasyScore.js'
