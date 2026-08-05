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

function fetchFixtureData(fixtureId) {
  if (!_cache.has(fixtureId)) {
    _cache.set(
      fixtureId,
      (async () => {
        const [p, e] = await Promise.all([
          getJson(`/api/football?path=fixtures/players&fixture=${fixtureId}`),
          getJson(`/api/football?path=fixtures/events&fixture=${fixtureId}`),
        ])
        return { players: p.response || [], events: e.response || [] }
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
// Dönüş: { ptsById: Map<id, number>, finishedById: Map<id, boolean> }
export async function computeWeekScores(players, week, fixtures) {
  const finishedById = new Map()
  const fixtureIds = new Set()

  for (const p of players) {
    const fx = getTeamFixture(fixtures, p.club, week)
    const fin = FINISHED.has(fx?.fixture?.status?.short)
    finishedById.set(p.id, fin)
    if (fin && fx?.fixture?.id) fixtureIds.add(fx.fixture.id)
  }

  const ptsById = await scoreFixtures(fixtureIds)
  return { ptsById, finishedById }
}

// Verilen fixture id'leri için oyuncu puanlarını hesapla → Map<playerId, pts>.
// (Takımım ve UEL test sayfası ortak kullanır.)
export async function scoreFixtures(fixtureIds) {
  const ptsById = new Map()
  await Promise.all(
    [...fixtureIds].map(async (id) => {
      const data = await fetchFixtureData(id)
      const scored = scoreFixture(data.players, data.events)
      for (const s of scored) ptsById.set(s.id, s.total)
    })
  )
  return ptsById
}

// Maç sonu otomatik yedek: ilk 11'de 0 puan alanları, yedek sırasına göre
// aynı mevkideki 0'dan yüksek puanlı yedeklerle değiştirir (görsel/puan).
//
// fieldByPos → { KL:[entry], DF:[...], OS:[...], FW:[...] } (ilk 11)
// benchEntries → yedekler (benchOrder'a göre sıralı)
// entry = { slot:{player,...}, pos, index }
// ptsById → Map<id, number>
// apply → false ise değişiklik yapılmaz (yalnızca puanlar iliştirilir)
//
// Dönüş: { field: {pos:[dEntry]}, bench:[dEntry], subs:[{outId,inId,pos}] }
// dEntry = { ...entry, player, pts, subIn?, subOut? } (player = gösterilecek oyuncu)
export function applyAutoSubs({ fieldByPos, benchEntries, ptsById, finishedById, apply }) {
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
  if (apply) {
    // Yedekleri sıraya göre gez; her puanlı yedek, aynı mevkideki 0 puanlı
    // (henüz değiştirilmemiş) bir ilk-11 oyuncusunun yerine geçer.
    for (const b of bench) {
      if (!b.player || (b.pts ?? 0) <= 0) continue
      const arr = field[b.pos] || []
      const target = arr.find((f) => f.player && f.pts === 0 && !f._subbed)
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
      subs.push({ outId: outPlayer.id, inId: inPlayer.id, pos: b.pos })
    }
  }

  return { field, bench, subs }
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
