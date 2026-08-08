import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { SQUAD_TOTALS, START_LIMITS, TOTAL_BUDGET, formationLabel } from './squadData.js'
import { loadCachedFixtures, loadCachedPlayers } from './dataCache.js'
import { buildWeeks, getActiveRound, isLocked } from './weeks.js'
import { isSupabaseConfigured } from './supabase.js'
import { useAuth } from './auth.jsx'
import {
  saveSquadToDb, loadSquadFromDb, loadWeekOverrides,
  loadPrevSquadFromDb, loadTransferMetaFromDb, saveTransferMetaToDb,
} from './squadDb.js'
import { SL_FANTASY_POINTS } from './fantasyPointsDb.js'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const DB_TO_POS = { GK: 'KL', DF: 'DF', MF: 'OS', FW: 'FW' }

const SquadContext = createContext(null)

// Varsayılan (Süper Lig) veri kaynağı yapılandırması. /pl-test gibi test
// ortamları SquadProvider'a kendi config'ini geçer; böylece AYNI Takımım/Transfer
// bileşenleri farklı veri/tablolarla (birebir arayüz) çalışır.
export const SUPER_LIG_CONFIG = {
  loadFixtures: loadCachedFixtures, // () | ({force}) → { fixtures }
  loadPlayers: loadCachedPlayers, // () → { players, teams }
  buildWeeks, // (fixtures) → weeks
  loadSquad: loadSquadFromDb, // ({userId, week}) → {formation, captainId, rows} | null
  saveSquad: saveSquadToDb, // ({userId, week, formation, captainId, roster})
  loadPrevSquad: loadPrevSquadFromDb, // ({userId, beforeWeek}) → önceki hafta kadrosu (carry-forward)
  loadTransferMeta: loadTransferMetaFromDb, // ({userId, week}) → { transfer_count, point_deductions } | null
  saveTransferMeta: saveTransferMetaToDb, // ({userId, week, transferCount, pointDeductions})
  loadOverrides: loadWeekOverrides, // () → { round: locked }
  saveFantasyWeekPoints: SL_FANTASY_POINTS.saveFantasyWeekPoints, // (userId, week, points)
  loadCumulativePoints: SL_FANTASY_POINTS.loadCumulativePoints, // (userId) → { [week]: points }
  routes: { squad: '/takimim', transfer: '/transfer' },
}

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

// DB satırlarından (squad_players) kadro yapısını yeniden kur.
// Formasyona BAĞLI DEĞİL: yapı doğrudan kayıttaki is_starter/bench_order'dan
// kurulur. Eski hâli slotCounts(formation) kadar starter/yedek YUVASI açıp
// fazlasını truncate ediyordu; formation kayıtlı starter sayısıyla uyuşmazsa
// (örn. 5 orta saha starter ama formation "4-4-2") fazla oyuncular "kayboluyordu".
// Bu sürüm her kayıtlı oyuncuyu korur. (formation parametresi artık kullanılmaz.)
export function rebuildRoster(rows, playersById) {
  const byPos = { KL: [], DF: [], OS: [], FW: [] }
  for (const r of rows) {
    const pos = DB_TO_POS[r.position_type]
    if (!pos) continue
    byPos[pos].push({
      player: playersById[String(r.player_id)] || null,
      starter: !!r.is_starter,
      benchOrder: r.is_starter ? null : r.bench_order,
    })
  }
  const roster = {}
  let benchCounter = 1
  for (const pos of POS_ORDER) {
    const starters = byPos[pos]
      .filter((e) => e.starter)
      .map((e) => ({ player: e.player, starter: true, benchOrder: null }))
    const bench = byPos[pos]
      .filter((e) => !e.starter)
      .sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99))
      .map((e) => {
        let bo = e.benchOrder
        if (bo == null) bo = pos === 'KL' ? 0 : benchCounter++
        else if (pos !== 'KL') benchCounter = Math.max(benchCounter, bo + 1)
        return { player: e.player, starter: false, benchOrder: bo }
      })
    roster[pos] = [...starters, ...bench]
  }
  return roster
}

// Kadro düzeni + kaptan imzası (değişiklik takibi için)
function signature(roster, captainId) {
  const parts = []
  for (const pos of POS_ORDER) {
    for (const s of roster[pos]) {
      parts.push(`${s.player?.id ?? '_'}:${s.starter ? 1 : 0}:${s.benchOrder ?? ''}`)
    }
  }
  parts.push(`C${captainId ?? ''}`)
  return parts.join('|')
}

export function SquadProvider({ children, config = SUPER_LIG_CONFIG }) {
  const { user } = useAuth()
  const [roster, setRoster] = useState(buildEmptyRoster) // kaydedilmiş (committed) kadro
  const [captainId, setCaptainId] = useState(null)
  const [week, setWeek] = useState(1)

  // Kaydedilmiş kadronun imzası — değişiklik (dirty) takibi için
  const [savedSig, setSavedSig] = useState(() => signature(buildEmptyRoster(), null))
  const rosterRef = useRef(roster)
  const captainRef = useRef(captainId)
  const weekRef = useRef(week)
  rosterRef.current = roster
  captainRef.current = captainId
  weekRef.current = week
  const dirty = signature(roster, captainId) !== savedSig

  // Fikstürden hesaplanan haftalar + ham fikstür (bir kez çekilir, paylaşılır)
  const [weeks, setWeeks] = useState([])
  const [fixtures, setFixtures] = useState([])
  const [weeksLoading, setWeeksLoading] = useState(true)
  // Admin manuel hafta kilidi override'ları: { round: locked(bool) }
  const [weekOverrides, setWeekOverrides] = useState({})
  useEffect(() => {
    config.loadOverrides().then(setWeekOverrides).catch(() => {})
  }, [config])
  // Supabase'den kaydedilmiş kadro yüklenirken skeleton için
  const [squadLoading, setSquadLoading] = useState(isSupabaseConfigured)
  const bootedRef = useRef(false)
  useEffect(() => {
    let alive = true
    config.loadFixtures()
      .then((res) => {
        if (!alive) return
        const w = res ? config.buildWeeks(res.fixtures) : []
        setWeeks(w)
        setFixtures(res?.fixtures || [])
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
  }, [config])

  // Fikstür DURUM/skor listesini API'den TAZE çeker (tek /fixtures çağrısı; canlı/bitmiş
  // tespiti + skor başlığı için). Takımım 5 dakikada bir çağırır. Oyuncu kart PUANLARI
  // ise API'den değil Supabase live_scores'tan gelir (computeWeekScores).
  const refreshFixtures = useCallback(async () => {
    const res = await config.loadFixtures({ force: true }).catch(() => null)
    if (res?.fixtures) {
      setFixtures(res.fixtures)
      setWeeks(config.buildWeeks(res.fixtures))
    }
  }, [config])

  // Giriş yapmış kullanıcının kadrosunu Supabase'den yükle — SEÇİLİ HAFTAYA göre.
  // Hafta değişince (onSelectWeek → setWeek) o haftanın snapshot'ı yüklenir:
  //  - Kayıt varsa → o haftanın kadrosu (geçmiş/kilitli haftalar dahil).
  //  - Kayıt yok + hafta kilitli/geçmiş → boş kadro (o hafta takım yoktu; puanlar
  //    yanlışlıkla güncel kadrodan hesaplanmasın diye).
  //  - Kayıt yok + hafta açık → mevcut kadro taşınır (carry-forward), o hafta için
  //    "kaydedilmemiş" sayılır (kullanıcı transfer yapıp kaydedebilsin).
  const loadKeyRef = useRef(null)

  // Kullanıcı değişince (giriş / çıkış / başka hesap) kadro state'ini SIFIRLA —
  // önceki kullanıcının kadrosu cache'te kalıp yeni kullanıcıya sızmasın.
  // deps = [user?.id, ...] → AuthProvider'ın is_admin tazelemesi user NESNESİNİ
  // değiştirse de (aynı id) effect'ler yeniden çalışıp in-flight yüklemeyi
  // iptal etmez (aksi halde squadLoading true'da takılır, "Yükleniyor" sürer).
  const userId = user?.id ?? null
  const prevUserRef = useRef(null)
  useEffect(() => {
    if (prevUserRef.current === userId) return
    prevUserRef.current = userId
    const empty = buildEmptyRoster()
    setRoster(empty)
    setCaptainId(null)
    setSavedSig(signature(empty, null))
    loadKeyRef.current = null // yeni kullanıcı için yeniden yükleme tetiklensin
  }, [userId])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSquadLoading(false)
      return
    }
    if (!userId || !weeks.length) return
    const key = `${userId}:${week}`
    if (loadKeyRef.current === key) return
    loadKeyRef.current = key
    const wkObj = weeks.find((w) => w.round === week) || null
    const weekLocked = isLocked(wkObj, Date.now())
    let alive = true
    setSquadLoading(true)
    ;(async () => {
      try {
        const loaded = await config.loadSquad({ userId, week })
        if (!alive) return
        if (loaded) {
          const raw = await config.loadPlayers().catch(() => null)
          if (!alive) return
          if (raw) {
            const players = raw.players // zaten app formatında (id, name, pos, club, price…)
            const byId = Object.fromEntries(players.map((p) => [String(p.id), p]))
            const r = rebuildRoster(loaded.rows, byId, loaded.formation)
            setRoster(r)
            setCaptainId(loaded.captainId ?? null)
            setSavedSig(signature(r, loaded.captainId ?? null))
          }
        } else {
          // Kayıt yok → ÖNCEKİ haftadan kadroyu OTOMATİK taşı (carry-forward).
          // Hafta N+1 açılınca Hafta N kadrosuyla (diziliş + yedek düzeni) başlar;
          // bütçe de taşınır (kalan = TOTAL − güncel değerler, aynı oyuncular).
          const prev = await config.loadPrevSquad?.({ userId, beforeWeek: week })
          if (!alive) return
          if (prev && prev.rows?.length) {
            const raw = await config.loadPlayers().catch(() => null)
            if (!alive) return
            const byId = raw ? Object.fromEntries(raw.players.map((p) => [String(p.id), p])) : {}
            const r = rebuildRoster(prev.rows, byId, prev.formation)
            setRoster(r)
            setCaptainId(prev.captainId ?? null)
            // Taşınan kadro OTOMATİK geçerli (dirty=false → tekrar "Kaydet" gerekmez)
            setSavedSig(signature(r, prev.captainId ?? null))
            // Açık haftada kalıcı yaz (puanlanabilsin + transfer baz kadrosu olsun).
            // Kilitli/geçmiş haftada yalnızca gösterim için taşınır (yazılmaz).
            if (!weekLocked) await persist(r, prev.captainId ?? null)
          } else {
            // Hiç önceki kadro yok (Hafta 1 / ilk kez) → boş kadro (ilk kurulum)
            const empty = buildEmptyRoster()
            setRoster(empty)
            setCaptainId(null)
            setSavedSig(signature(empty, null))
          }
        }
      } catch (e) {
        // Hata yut(ulmasın): logla, guard'ı sıfırla ki tekrar denensin, boş sayfa olmasın.
        console.error('[FFS] Kadro yükleme hatası:', e)
        loadKeyRef.current = null
      } finally {
        if (alive) setSquadLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [userId, week, weeks])

  // Mevcut kadroyu Supabase'e kaydet (kullanıcı + supabase varsa; yoksa no-op)
  const persist = useCallback(
    async (rosterArg, captainArg) => {
      if (!user || !isSupabaseConfigured) return
      await config.saveSquad({
        userId: user.id,
        week: weekRef.current,
        formation: formationLabel(starterCounts(rosterArg)),
        captainId: captainArg ?? null,
        roster: rosterArg,
      })
    },
    [user, config]
  )

  // Transfer ekranı kaydedince tüm kadroyu buraya işler (yalnızca in-memory)
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

  // Transfer: kadroyu işle + Supabase'e kaydet + imzayı güncelle
  const commitAndSave = useCallback(
    async (newRoster) => {
      const committed = cloneRoster(newRoster)
      let newCaptain = captainRef.current
      if (newCaptain && !rosterPlayers(committed).some((p) => p.id === newCaptain)) newCaptain = null
      setRoster(committed)
      setCaptainId(newCaptain)
      setSavedSig(signature(committed, newCaptain))
      await persist(committed, newCaptain)
    },
    [persist]
  )

  // Kadro ekranı: mevcut düzeni (diziliş/kaptan/yedek sırası) Supabase'e kaydet
  const saveArrangement = useCallback(async () => {
    const r = rosterRef.current
    const c = captainRef.current
    setSavedSig(signature(r, c))
    await persist(r, c)
  }, [persist])

  // Kadro ekranı: iki yuva arası yer değiştir. Dönüş: hata mesajı | null
  const swapSlots = useCallback((a, b) => {
    const r = rosterRef.current
    const A = r[a.pos][a.index]
    const B = r[b.pos][b.index]
    if (!A.player || !B.player) return 'Boş yuva taşınamaz.'

    // İki ilk-11 oyuncusu
    if (A.starter && B.starter) {
      if (a.pos === b.pos) {
        const next = cloneRoster(r)
        const tmp = next[a.pos][a.index].player
        next[a.pos][a.index].player = next[b.pos][b.index].player
        next[b.pos][b.index].player = tmp
        setRoster(next)
        return null
      }
      return 'İki ilk-11 oyuncusu yer değiştiremez.'
    }

    // İki yedek oyuncu
    if (!A.starter && !B.starter) {
      if (a.pos === 'KL' || b.pos === 'KL') return 'Kaleci yedeği ilk sırada sabittir.'
      const next = cloneRoster(r)
      const tmp = next[a.pos][a.index].benchOrder
      next[a.pos][a.index].benchOrder = next[b.pos][b.index].benchOrder
      next[b.pos][b.index].benchOrder = tmp
      setRoster(next)
      return null
    }

    // İlk 11 ↔ yedek yer değiştirme
    const starterRef = A.starter ? a : b
    const benchRef = A.starter ? b : a
    if ((starterRef.pos === 'KL') !== (benchRef.pos === 'KL')) return 'Kaleci yalnızca kaleci ile değişebilir.'
    const counts = starterCounts(r)
    counts[starterRef.pos] -= 1
    counts[benchRef.pos] += 1
    if (!within('DF', counts.DF)) return 'Defans 3-5 arasında olmalı.'
    if (!within('OS', counts.OS)) return 'Orta saha 3-5 arasında olmalı.'
    if (!within('FW', counts.FW)) return 'Forvet 1-3 arasında olmalı.'
    const next = cloneRoster(r)
    const sSlot = next[starterRef.pos][starterRef.index]
    const bSlot = next[benchRef.pos][benchRef.index]
    const benchedPlayer = sSlot.player // ilk 11'den yedeğe düşen
    const incomingPlayer = bSlot.player // yedekten ilk 11'e çıkan
    const handoff = bSlot.benchOrder
    sSlot.starter = false
    sSlot.benchOrder = handoff
    bSlot.starter = true
    bSlot.benchOrder = null
    setRoster(next)
    // Kaptan yedeğe düşerse kaptanlık ilk 11'e giren oyuncuya devredilir —
    // kaptan hiçbir zaman yedekte olamaz.
    if (benchedPlayer && benchedPlayer.id === captainRef.current) {
      setCaptainId(incomingPlayer.id)
    }
    return null
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
    commitAndSave,
    saveArrangement,
    dirty,
    swapSlots,
    captainId,
    makeCaptain,
    clearCaptain,
    week,
    setWeek,
    weeks,
    fixtures,
    weekOverrides,
    weeksLoading,
    squadLoading,
    rosterList,
    spent,
    remaining,
    counts,
    POS_ORDER,
    loadPlayers: config.loadPlayers, // Transfer picker + Takımım önyükleme (dataset'e göre)
    routes: config.routes, // { squad, transfer } — Takımım/Transfer navigasyonu
    pickerClubs: config.pickerClubs, // Transfer picker'ı bu kulüplerle sınırlar (varsa)
    refreshFixtures, // canlı skor için fikstürü taze çeker
    loadTransferMeta: config.loadTransferMeta, // ({userId, week}) → { transfer_count, point_deductions }
    saveTransferMeta: config.saveTransferMeta, // ({userId, week, transferCount, pointDeductions})
    saveFantasyWeekPoints: config.saveFantasyWeekPoints, // (userId, week, points) — hafta bitince
    loadCumulativePoints: config.loadCumulativePoints, // (userId) → { [week]: points } (sezon toplamı = Σ)
  }
  return <SquadContext.Provider value={value}>{children}</SquadContext.Provider>
}

export function useSquad() {
  const ctx = useContext(SquadContext)
  if (!ctx) throw new Error('useSquad, SquadProvider içinde kullanılmalı.')
  return ctx
}
