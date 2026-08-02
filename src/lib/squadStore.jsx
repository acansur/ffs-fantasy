import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { SQUAD_TOTALS, START_LIMITS, TOTAL_BUDGET } from './squadData.js'
import { fetchSuperLigFixtures } from './apiFootball.js'
import { buildWeeks, getActiveRound } from './weeks.js'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

const SquadContext = createContext(null)

// Boş kadro: her mevkide sabit sayıda yuva; hiç oyuncu yok (player: null).
// Yuvaların ilk 11 / yedek işaretleri varsayılan 4-4-2 dizilişine göre kurulur;
// böylece transfer'den oyuncular geldikçe mevkilerine otomatik yerleşir.
export function buildEmptyRoster() {
  const starterByPos = { KL: 1, DF: 4, OS: 4, FW: 2 }
  const roster = {}
  let benchOrder = 1 // 0, kaleci yedeğine ayrıldı
  for (const pos of POS_ORDER) {
    roster[pos] = []
    for (let i = 0; i < SQUAD_TOTALS[pos]; i++) {
      const starter = i < starterByPos[pos]
      let bo = null
      if (!starter) bo = pos === 'KL' ? 0 : benchOrder++
      roster[pos].push({ player: null, starter, benchOrder: bo })
    }
  }
  return roster
}

export function cloneRoster(roster) {
  const next = {}
  for (const pos of POS_ORDER) next[pos] = roster[pos].map((s) => ({ ...s }))
  return next
}

export function rosterPlayers(roster) {
  const list = []
  for (const pos of POS_ORDER) for (const s of roster[pos]) if (s.player) list.push(s.player)
  return list
}

// İlk 11 mevki sayıları (yuva işaretlerine göre; boş yuvalar da sayılır)
function starterCounts(roster) {
  const c = { KL: 0, DF: 0, OS: 0, FW: 0 }
  for (const pos of POS_ORDER) for (const slot of roster[pos]) if (slot.starter) c[pos]++
  return c
}

function within(pos, n) {
  const [min, max] = START_LIMITS[pos]
  return n >= min && n <= max
}

export function SquadProvider({ children }) {
  const [roster, setRoster] = useState(buildEmptyRoster) // kaydedilmiş (committed) kadro
  const [captainId, setCaptainId] = useState(null)
  const [week, setWeek] = useState(1)

  // Fikstürden hesaplanan haftalar (bir kez çekilir, iki ekran paylaşır)
  const [weeks, setWeeks] = useState([])
  const [weeksLoading, setWeeksLoading] = useState(true)
  const bootedRef = useRef(false)
  useEffect(() => {
    let alive = true
    fetchSuperLigFixtures()
      .then((res) => {
        if (!alive) return
        const w = res ? buildWeeks(res.fixtures) : []
        setWeeks(w)
        setWeeksLoading(false)
        // Aktif haftayı bir kez otomatik seç
        if (w.length && !bootedRef.current) {
          bootedRef.current = true
          setWeek(getActiveRound(w))
        }
      })
      .catch(() => alive && setWeeksLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // Transfer ekranı kaydedince tüm kadroyu buraya işler
  const commitRoster = useCallback((newRoster) => {
    const committed = cloneRoster(newRoster)
    setRoster(committed)
    // Kaptan artık kadroda değilse düşür
    setCaptainId((cid) => {
      if (!cid) return cid
      const stillHere = rosterPlayers(committed).some((p) => p.id === cid)
      return stillHere ? cid : null
    })
  }, [])

  // Kadro ekranı: iki yuva arası yer değiştir. Dönüş: hata mesajı | null
  const swapSlots = useCallback((a, b) => {
    let error = null
    setRoster((r) => {
      const A = r[a.pos][a.index]
      const B = r[b.pos][b.index]
      if (!A.player || !B.player) {
        error = 'Boş yuva taşınamaz.'
        return r
      }
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
      const starterRef = A.starter ? a : b
      const benchRef = A.starter ? b : a
      if ((starterRef.pos === 'KL') !== (benchRef.pos === 'KL')) {
        error = 'Kaleci yalnızca kaleci ile değişebilir.'
        return r
      }
      const counts = starterCounts(r)
      counts[starterRef.pos] -= 1
      counts[benchRef.pos] += 1
      if (!within('DF', counts.DF)) { error = 'Defans 3-5 arasında olmalı.'; return r }
      if (!within('OS', counts.OS)) { error = 'Orta saha 3-5 arasında olmalı.'; return r }
      if (!within('FW', counts.FW)) { error = 'Forvet 1-3 arasında olmalı.'; return r }
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

  const rosterList = useMemo(() => rosterPlayers(roster), [roster])
  const spent = rosterList.reduce((sum, p) => sum + p.price, 0)
  const remaining = TOTAL_BUDGET - spent
  const counts = useMemo(() => starterCounts(roster), [roster])

  const value = {
    roster,
    commitRoster,
    swapSlots,
    captainId,
    makeCaptain,
    clearCaptain,
    week,
    setWeek,
    weeks,
    weeksLoading,
    rosterList,
    spent,
    remaining,
    counts,
    POS_ORDER,
  }
  return <SquadContext.Provider value={value}>{children}</SquadContext.Provider>
}

export function useSquad() {
  const ctx = useContext(SquadContext)
  if (!ctx) throw new Error('useSquad, SquadProvider içinde kullanılmalı.')
  return ctx
}
