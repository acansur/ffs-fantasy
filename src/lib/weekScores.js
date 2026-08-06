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

function fetchFixtureData(fixtureId) {
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
// Dönüş: { ptsById: Map<id, number>, finishedById: Map<id, boolean>,
//          partsById: Map<id, parts[]> } (puan kırılımı gösterimi için parts dahil)
export async function computeWeekScores(players, week, fixtures) {
  const finishedById = new Map()
  const fixtureIds = new Set()

  for (const p of players) {
    const fx = getTeamFixture(fixtures, p.club, week)
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

// Verilen fixture id'leri için tam skorlanmış oyuncu nesnesini döner →
// Map<playerId, {total, parts, ...}> (Takımım ve UEL test sayfası ortak kullanır)
// (puan kırılımı gösterimi için parts dahil.)
export async function scoreFixturesDetailed(fixtureIds) {
  const byId = new Map()
  await Promise.all(
    [...fixtureIds].map(async (id) => {
      const data = await fetchFixtureData(id)
      const scored = scoreFixture(data.players, data.events)
      for (const s of scored) byId.set(s.id, s)
    })
  )
  return byId
}

// Maç sonu otomatik yedek: ilk 11'de 0 puan alanları, yedek sırasına göre
// aynı mevkideki 0'dan yüksek puanlı yedeklerle değiştirir (görsel/puan).
//
// KAPTANLIK DEVRİ: Kaptan 0 puan aldıysa ve aynı mevkide puanlı bir yedek varsa,
// kaptan öncelikli olarak sahadan çıkarılır ve kaptanlık sahaya giren yedeğe
// GEÇER (yedeğin puanı total'de ×2 sayılır). Yedekte uygun oyuncu yoksa ya da
// yedek de 0 aldıysa kaptan sahada kalır, kaptanlık değişmez.
//
// fieldByPos → { KL:[entry], DF:[...], OS:[...], FW:[...] } (ilk 11)
// benchEntries → yedekler (benchOrder'a göre sıralı)
// entry = { slot:{player,...}, pos, index }
// ptsById → Map<id, number>
// captainId → mevcut kaptan id'si (opsiyonel)
// apply → false ise değişiklik yapılmaz (yalnızca puanlar iliştirilir)
//
// Dönüş: { field, bench, subs, captainId } — captainId = DEVİR sonrası efektif
// kaptan id'si (devir yoksa girişteki captainId). dEntry = { ...entry, player,
// pts, subIn?, subOut?, captainIn? } (player = gösterilecek oyuncu)
export function applyAutoSubs({ fieldByPos, benchEntries, ptsById, finishedById, apply, captainId = null }) {
  const POS = ['KL', 'DF', 'OS', 'FW']
  const ptsOf = (pl) => (pl ? ptsById.get(pl.id) ?? 0 : 0)
  const finOf = (pl) => (pl ? Boolean(finishedById?.get(pl.id)) : false)

  // Gösterim kopyaları (store'a dokunulmaz)
  const field = {}
  for (const pos of POS) {
    field[pos] = (fieldByPos[pos] || []).map((e) => ({
      ...e,
      player: e.slot.player,
      pts: ptsOf(e.slot.player),
      finished: finOf(e.slot.player),
    }))
  }
  const bench = benchEntries.map((e) => ({
    ...e,
    player: e.slot.player,
    pts: e.slot.player ? ptsOf(e.slot.player) : null,
    finished: finOf(e.slot.player),
  }))

  const subs = []
  let effectiveCaptainId = captainId
  if (apply) {
    // Yedekleri sıraya göre gez; her puanlı yedek, aynı mevkideki 0 puanlı
    // (henüz değiştirilmemiş) bir ilk-11 oyuncusunun yerine geçer.
    for (const b of bench) {
      if (!b.player || (b.pts ?? 0) <= 0) continue
      const arr = field[b.pos] || []
      // Hedef seçimi: aynı mevkideki 0 puanlı, henüz değişmemiş ilk-11 oyuncusu.
      // Kaptan 0 puan aldıysa ÖNCELİKLE kaptan çıkarılır → kaptanlık yedeğe geçsin.
      const target =
        arr.find((f) => f.player && f.player.id === captainId && f.pts === 0 && !f._subbed) ||
        arr.find((f) => f.player && f.pts === 0 && !f._subbed)
      if (!target) continue
      const inPlayer = b.player
      const outPlayer = target.player
      const inPts = b.pts
      const outPts = target.pts
      const inFin = b.finished
      const outFin = target.finished
      target.player = inPlayer
      target.pts = inPts
      target.finished = inFin
      target.subIn = true
      target._subbed = true
      b.player = outPlayer
      b.pts = outPts
      b.finished = outFin
      b.subOut = true
      // Kaptan sahadan çıktıysa kaptanlık sahaya giren yedeğe geçer (puanı ×2).
      if (captainId != null && outPlayer.id === captainId) {
        effectiveCaptainId = inPlayer.id
        target.captainIn = true // görsel "C" için işaret (opsiyonel)
      }
      subs.push({ outId: outPlayer.id, inId: inPlayer.id, pos: b.pos })
    }
  }

  return { field, bench, subs, captainId: effectiveCaptainId }
}

// Efektif ilk 11 üzerinden toplam puan (biten maçlar sayılır, kaptan ×2).
// field → applyAutoSubs sonucu field
export function computeTotalPoints({ field, finishedById, captainId }) {
  let total = 0
  for (const pos of Object.keys(field)) {
    for (const e of field[pos]) {
      const pl = e.player
      if (!pl) continue
      if (!finishedById.get(pl.id)) continue // maçı bitmemiş → henüz 0 katkı
      const pts = e.pts ?? 0
      total += pts
      if (pl.id === captainId) total += pts // kaptan ×2
    }
  }
  return total
}
