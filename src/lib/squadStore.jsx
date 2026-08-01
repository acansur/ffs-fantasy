import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import {
  PLAYERS,
  SQUAD_TOTALS,
  START_LIMITS,
  DEFAULT_ROSTER,
  DEFAULT_STARTERS,
  TOTAL_BUDGET,
} from './squadData.js'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))

const SquadContext = createContext(null)

// Başlangıç kadrosu: her mevkide sabit sayıda yuva; varsayılan oyuncular +
// ilk 11 / yedek işaretleri. benchOrder: kaleci yedeği 0 (sabit ilk), diğerleri 1..3
function buildInitialRoster() {
  const roster = {}
  const starters = new Set(DEFAULT_STARTERS)
  let order = 1
  for (const pos of POS_ORDER) {
    roster[pos] = []
    for (let i = 0; i < SQUAD_TOTALS[pos]; i++) {
      const id = DEFAULT_ROSTER[pos][i]
      const player = id ? byId[id] : null
      const isStarter = id ? starters.has(id) : false
      let benchOrder = null
      if (player && !isStarter) benchOrder = pos === 'KL' ? 0 : order++
      roster[pos].push({ player, starter: isStarter, benchOrder })
    }
  }
  return roster
}

function cloneRoster(roster) {
  const next = {}
  for (const pos of POS_ORDER) next[pos] = roster[pos].map((s) => ({ ...s }))
  return next
}

// İlk 11'deki mevki sayıları
function starterCounts(roster) {
  const c = { KL: 0, DF: 0, OS: 0, FW: 0 }
  for (const pos of POS_ORDER) {
    for (const slot of roster[pos]) if (slot.player && slot.starter) c[pos]++
  }
  return c
}

function within(pos, n) {
  const [min, max] = START_LIMITS[pos]
  return n >= min && n <= max
}

export function SquadProvider({ children }) {
  const [roster, setRoster] = useState(buildInitialRoster)
  const [captainId, setCaptainId] = useState('m1') // varsayılan bir kaptan
  const [week, setWeek] = useState(1)

  // Transfer: bir yuvaya oyuncu koy / çıkar (null)
  const setSlot = useCallback((pos, index, player) => {
    setRoster((r) => {
      const next = cloneRoster(r)
      const slot = next[pos][index]
      // Yuva boşalıyorsa: ilk 11 ise starter kalır (yeni oyuncu gelince devralır)
      if (player && slot.player && !slot.starter && slot.benchOrder === null) {
        slot.benchOrder = null
      }
      slot.player = player
      return next
    })
    setCaptainId((cid) => {
      // Çıkarılan oyuncu kaptansa kaptanlığı düşür
      const removed = roster[pos][index]?.player
      if (!player && removed && removed.id === cid) return null
      return cid
    })
  }, [roster])

  // Kadro ekranı: iki yuva arasında yer değiştir (ilk 11 ↔ yedek, veya yedek sıralama)
  // Dönüş: hata mesajı (string) veya null (başarılı)
  const swapSlots = useCallback((a, b) => {
    let error = null
    setRoster((r) => {
      const A = r[a.pos][a.index]
      const B = r[b.pos][b.index]
      if (!A.player || !B.player) {
        error = 'Boş yuva taşınamaz.'
        return r
      }
      // İkisi de ilk 11
      if (A.starter && B.starter) {
        if (a.pos === b.pos) {
          const next = cloneRoster(r)
          const tmp = next[a.pos][a.index].player
          next[a.pos][a.index].player = next[b.pos][b.index].player
          next[b.pos][b.index].player = tmp
          return next
        }
        error = 'İki ilk-11 oyuncusu yer değiştiremez.'
        return r
      }
      // İkisi de yedek → yedek sıralaması (kaleci yedeği sabit ilk sırada)
      if (!A.starter && !B.starter) {
        if (a.pos === 'KL' || b.pos === 'KL') {
          error = 'Kaleci yedeği ilk sırada sabittir.'
          return r
        }
        const next = cloneRoster(r)
        const tmp = next[a.pos][a.index].benchOrder
        next[a.pos][a.index].benchOrder = next[b.pos][b.index].benchOrder
        next[b.pos][b.index].benchOrder = tmp
        return next
      }
      // Biri ilk 11, biri yedek → oyuncu değişikliği
      const starterRef = A.starter ? a : b
      const benchRef = A.starter ? b : a
      const sPos = starterRef.pos
      const bPos = benchRef.pos
      // Kaleci yalnızca kaleci ile değişebilir
      if ((sPos === 'KL') !== (bPos === 'KL')) {
        error = 'Kaleci yalnızca kaleci ile değişebilir.'
        return r
      }
      // Yeni ilk 11 mevki dağılımını doğrula
      const counts = starterCounts(r)
      counts[sPos] -= 1
      counts[bPos] += 1
      if (!within('DF', counts.DF)) {
        error = 'Defans 3-5 arasında olmalı.'
        return r
      }
      if (!within('OS', counts.OS)) {
        error = 'Orta saha 3-5 arasında olmalı.'
        return r
      }
      if (!within('FW', counts.FW)) {
        error = 'Forvet 1-3 arasında olmalı.'
        return r
      }
      const next = cloneRoster(r)
      const sSlot = next[starterRef.pos][starterRef.index]
      const bSlot = next[benchRef.pos][benchRef.index]
      const handoff = bSlot.benchOrder
      sSlot.starter = false
      sSlot.benchOrder = handoff
      bSlot.starter = true
      bSlot.benchOrder = null
      return next
    })
    return error
  }, [])

  const makeCaptain = useCallback((id) => setCaptainId(id), [])
  const clearCaptain = useCallback(() => setCaptainId(null), [])

  // Türetilmiş değerler
  const rosterList = useMemo(() => {
    const list = []
    for (const pos of POS_ORDER) for (const s of roster[pos]) if (s.player) list.push(s.player)
    return list
  }, [roster])

  const spent = rosterList.reduce((sum, p) => sum + p.price, 0)
  const remaining = TOTAL_BUDGET - spent
  const counts = useMemo(() => starterCounts(roster), [roster])

  // Kulüp başına oyuncu sayısı (kural kontrolü için)
  const clubCounts = useMemo(() => {
    const c = {}
    for (const p of rosterList) c[p.club] = (c[p.club] || 0) + 1
    return c
  }, [rosterList])

  const value = {
    roster,
    setSlot,
    swapSlots,
    captainId,
    makeCaptain,
    clearCaptain,
    week,
    setWeek,
    rosterList,
    spent,
    remaining,
    counts,
    clubCounts,
    POS_ORDER,
  }
  return <SquadContext.Provider value={value}>{children}</SquadContext.Provider>
}

export function useSquad() {
  const ctx = useContext(SquadContext)
  if (!ctx) throw new Error('useSquad, SquadProvider içinde kullanılmalı.')
  return ctx
}
