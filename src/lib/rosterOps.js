// Kadro işlemleri — saf yardımcılar (yer değiştirme + mevki sayıları).
// squadStore'daki mantığın saf bir kopyası; UEL test sayfası buradan kullanır
// (böylece ana SquadProvider'a dokunulmaz).

import { START_LIMITS } from './squadData.js'
import { cloneRoster } from './squadStore.jsx'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

export function starterCounts(roster) {
  const c = { KL: 0, DF: 0, OS: 0, FW: 0 }
  for (const pos of POS_ORDER) for (const s of roster[pos]) if (s.starter) c[pos]++
  return c
}

function within(pos, n) {
  const [min, max] = START_LIMITS[pos]
  return n >= min && n <= max
}

// İki yuva arası yer değiştir. Dönüş: { roster, captainId, error }
// error != null ise değişiklik yapılmaz.
export function swapSlots(roster, captainId, a, b) {
  const A = roster[a.pos][a.index]
  const B = roster[b.pos][b.index]
  if (!A.player || !B.player) return { roster, captainId, error: 'Boş yuva taşınamaz.' }

  // İki ilk-11 oyuncusu (aynı mevki → yer değiştir)
  if (A.starter && B.starter) {
    if (a.pos === b.pos) {
      const next = cloneRoster(roster)
      const tmp = next[a.pos][a.index].player
      next[a.pos][a.index].player = next[b.pos][b.index].player
      next[b.pos][b.index].player = tmp
      return { roster: next, captainId, error: null }
    }
    return { roster, captainId, error: 'İki ilk-11 oyuncusu yer değiştiremez.' }
  }

  // İki yedek oyuncu (yedek sırası değiştir)
  if (!A.starter && !B.starter) {
    if (a.pos === 'KL' || b.pos === 'KL') return { roster, captainId, error: 'Kaleci yedeği ilk sırada sabittir.' }
    const next = cloneRoster(roster)
    const tmp = next[a.pos][a.index].benchOrder
    next[a.pos][a.index].benchOrder = next[b.pos][b.index].benchOrder
    next[b.pos][b.index].benchOrder = tmp
    return { roster: next, captainId, error: null }
  }

  // İlk 11 ↔ yedek
  const starterRef = A.starter ? a : b
  const benchRef = A.starter ? b : a
  if ((starterRef.pos === 'KL') !== (benchRef.pos === 'KL'))
    return { roster, captainId, error: 'Kaleci yalnızca kaleci ile değişebilir.' }
  const counts = starterCounts(roster)
  counts[starterRef.pos] -= 1
  counts[benchRef.pos] += 1
  if (!within('DF', counts.DF)) return { roster, captainId, error: 'Defans 3-5 arasında olmalı.' }
  if (!within('OS', counts.OS)) return { roster, captainId, error: 'Orta saha 3-5 arasında olmalı.' }
  if (!within('FW', counts.FW)) return { roster, captainId, error: 'Forvet 1-3 arasında olmalı.' }

  const next = cloneRoster(roster)
  const sSlot = next[starterRef.pos][starterRef.index]
  const bSlot = next[benchRef.pos][benchRef.index]
  const benchedPlayer = sSlot.player
  const incomingPlayer = bSlot.player
  const handoff = bSlot.benchOrder
  sSlot.starter = false
  sSlot.benchOrder = handoff
  bSlot.starter = true
  bSlot.benchOrder = null
  // Kaptan yedeğe düşerse kaptanlık ilk 11'e girene devredilir
  let newCaptain = captainId
  if (benchedPlayer && benchedPlayer.id === captainId) newCaptain = incomingPlayer.id
  return { roster: next, captainId: newCaptain, error: null }
}
