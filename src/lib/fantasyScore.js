// Fantasy puan TOPLAMA mantığı — SAF ve tarayıcı-bağımsız (Node'da da çalışır).
// Hem client (weekScores.js → Takımım) hem sunucu (scripts/live-scores.mjs cron)
// AYNI bu modülü kullanır → puanlama mantığı TEK yerde, drift/ikilik yok.
//
// Buraya Supabase/React/import.meta gibi tarayıcıya özel HİÇBİR şey import edilmez.

const POS = ['KL', 'DF', 'OS', 'FW']
const DB_TO_POS = { GK: 'KL', DF: 'DF', MF: 'OS', FW: 'FW' }

// Maç sonu otomatik yedek: ilk 11'de 0 puan alanları, yedek sırasına göre aynı
// mevkideki 0'dan yüksek puanlı yedeklerle değiştirir.
//
// KAPTANLIK DEVRİ: Kaptan 0 puan aldıysa ve aynı mevkide puanlı yedek varsa, kaptan
// öncelikli çıkarılır ve kaptanlık sahaya giren yedeğe GEÇER (puanı ×2 sayılır).
//
// fieldByPos → { KL:[entry], DF, OS, FW } (ilk 11); benchEntries → yedekler (sıralı)
// entry = { slot:{player,...}, pos, index }; ptsById → Map<id,number>
// apply=false → değişiklik yapılmaz (yalnız puanlar iliştirilir)
// Dönüş: { field, bench, subs, captainId } — captainId = devir sonrası efektif id.
export function applyAutoSubs({ fieldByPos, benchEntries, ptsById, finishedById, apply, captainId = null }) {
  const ptsOf = (pl) => (pl ? ptsById.get(pl.id) ?? 0 : 0)
  const finOf = (pl) => (pl ? Boolean(finishedById?.get(pl.id)) : false)

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
    for (const b of bench) {
      if (!b.player || (b.pts ?? 0) <= 0) continue
      const arr = field[b.pos] || []
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
      if (captainId != null && outPlayer.id === captainId) {
        effectiveCaptainId = inPlayer.id
        target.captainIn = true
      }
      subs.push({ outId: outPlayer.id, inId: inPlayer.id, pos: b.pos })
    }
  }

  return { field, bench, subs, captainId: effectiveCaptainId }
}

// Efektif ilk 11 üzerinden toplam puan (maçı BAŞLAMIŞ oyuncular; kaptan ×2).
// CANLI KAPTAN KURALI: kaptanın maçı sürerken ×2 yalnız puan > 0 iken; bittiyse
// (FT) koşulsuz ×2. startedById verilmezse finishedById kullanılır.
export function computeTotalPoints({ field, finishedById, startedById, captainId }) {
  const countable = startedById || finishedById
  let total = 0
  for (const pos of Object.keys(field)) {
    for (const e of field[pos]) {
      const pl = e.player
      if (!pl) continue
      if (!countable.get(pl.id)) continue
      const pts = e.pts ?? 0
      total += pts
      if (pl.id === captainId) {
        const capFinished = Boolean(finishedById?.get(pl.id))
        if (capFinished || pts > 0) total += pts
      }
    }
  }
  return total
}

// Ham kadro satırlarından (squad_players / pl_test_squad_players) bir haftanın
// TOPLAM fantasy puanını hesaplar — client'taki final akışın (rebuildRoster →
// applyAutoSubs(apply) → computeTotalPoints − kesinti) birebir eşdeğeri.
//
// rows: [{ player_id, position_type:'GK'|'DF'|'MF'|'FW', is_starter, bench_order }]
// captainPlayerId: number|null
// ptsById: Map<player_id, number>   (o haftanın live_scores toplamları)
// finishedById / startedById: Map benzeri (.get(id)) — hafta tamamen bitmişse
//   her oyuncu için true dönen bir nesne verilebilir.
// pointDeductions: o haftanın ekstra transfer kesintisi.
export function computeSquadWeekTotal({ rows, captainPlayerId, ptsById, finishedById, startedById, pointDeductions = 0 }) {
  const fieldByPos = { KL: [], DF: [], OS: [], FW: [] }
  const benchList = []
  ;(rows || []).forEach((r, index) => {
    const pos = DB_TO_POS[r.position_type]
    if (!pos) return
    const entry = {
      slot: { player: { id: r.player_id }, starter: !!r.is_starter, benchOrder: r.bench_order },
      pos,
      index,
    }
    if (r.is_starter) fieldByPos[pos].push(entry)
    else benchList.push(entry)
  })
  const benchEntries = benchList.sort((a, b) => (a.slot.benchOrder ?? 99) - (b.slot.benchOrder ?? 99))
  const { field, captainId: effectiveCaptainId } = applyAutoSubs({
    fieldByPos,
    benchEntries,
    ptsById,
    finishedById,
    apply: true,
    captainId: captainPlayerId ?? null,
  })
  const total = computeTotalPoints({ field, finishedById, startedById, captainId: effectiveCaptainId })
  return total - (pointDeductions || 0)
}
