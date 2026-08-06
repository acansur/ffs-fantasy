import { useMemo, useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useSquad, cloneRoster, rosterPlayers } from '../lib/squadStore.jsx'
import { clubColors, clubShort } from '../lib/apiFootball.js'
import { getVisibleWeeks, formatDeadline, getTeamFixture, isLocked } from '../lib/weeks.js'
import { useNow } from '../lib/useNow.js'
import { normalizeText } from '../lib/normalize.js'
import WeekBar from '../components/WeekBar.jsx'
import WeekFixtures from '../components/WeekFixtures.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import ScoringGuide from '../components/ScoringGuide.jsx'
import PlayerDetailModal from '../components/PlayerDetailModal.jsx'
import { POSITIONS, TOTAL_BUDGET, MAX_PER_CLUB, initials } from '../lib/squadData.js'
import './Transfer.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const POS_TABS = [{ key: null, label: 'Tümü' }, ...POS_ORDER.map((p) => ({ key: p, label: p }))]
// Pozisyon → halka / rozet renk sınıfı (KL yeşil · DF kırmızı · OS mavi · FW turuncu)
const RING = { KL: 'tr-ring-gk', DF: 'tr-ring-def', OS: 'tr-ring-mid', FW: 'tr-ring-fwd' }
const TAGC = { KL: 'tr-tag-gk', DF: 'tr-tag-def', OS: 'tr-tag-mid', FW: 'tr-tag-fwd' }

// Toplam puan henüz yok — şimdilik 0
const ptsOf = (p) => p.points ?? 0

function sortPlayers(arr, key) {
  const l = [...arr]
  if (key === 'value-asc') return l.sort((a, b) => a.price - b.price)
  if (key === 'points-desc') return l.sort((a, b) => ptsOf(b) - ptsOf(a) || b.price - a.price)
  if (key === 'points-asc') return l.sort((a, b) => ptsOf(a) - ptsOf(b) || a.price - b.price)
  return l.sort((a, b) => b.price - a.price) // value-desc
}

/* ---- İkonlar ---- */
const IconBack = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
)
const IconGuide = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" /></svg>
)
const IconWallet = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18v3" /><rect x="3" y="8.5" width="18" height="11" rx="2.5" /><circle cx="16.5" cy="14" r="1.3" fill="currentColor" stroke="none" /></svg>
)
const IconStar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>
)
const IconSwap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.5h13l-3.2-3.3M20 15.5H7l3.2 3.3" /></svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
)
const IconBolt = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>
)
const IconSave = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M5 4h11l3 3v13H5z" /><path d="M8.5 4v5h6" /><rect x="8.5" y="13" width="7" height="5" /></svg>
)
const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
)

export default function Transfer() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { roster: committed, commitAndSave, week, setWeek, weeks, fixtures, weekOverrides, weeksLoading, squadLoading, loadPlayers, routes = { squad: '/takimim', transfer: '/transfer' } } = useSquad()

  const now = useNow(30000) // gerçek zamanlı deadline kontrolü (30 sn)
  const visibleWeeks = getVisibleWeeks(weeks, now)
  const selectedWeek = weeks.find((w) => w.round === week) || null
  const deadlineText = selectedWeek ? formatDeadline(selectedWeek.deadline) : '—'
  // Seçili haftanın deadline'ı (admin override'a saygı). Geçince transfer kilitlenir.
  const override = weekOverrides?.[week]
  const locked = override != null ? override : isLocked(selectedWeek, now)

  // Taslak: kaydedilene kadar kadroya yansımaz
  const [draft, setDraft] = useState(() => cloneRoster(committed))
  const editedRef = useRef(false) // kullanıcı taslakta değişiklik yaptı mı
  const [picker, setPicker] = useState(null) // { pos, index } — açık oyuncu seçme popup'ı
  const [posFilter, setPosFilter] = useState(null)
  const [selectedClubs, setSelectedClubs] = useState([])
  const [sortKey, setSortKey] = useState('value-desc')
  const [openDrop, setOpenDrop] = useState(null) // 'club' | 'value' | 'points' | null
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')
  const [scoringOpen, setScoringOpen] = useState(false)
  const [infoPlayer, setInfoPlayer] = useState(null)
  const clubRef = useRef(null)
  const valueRef = useRef(null)
  const pointsRef = useRef(null)

  // Gerçek API oyuncuları
  const [api, setApi] = useState({ loading: true, error: null, players: [], teams: [] })

  useEffect(() => {
    let alive = true
    // Dataset'e göre oyuncu listesi (SL: 24s önbellek; PL: 18 takım havuzu)
    loadPlayers()
      .then((res) => alive && setApi({ loading: false, error: null, players: res.players, teams: res.teams }))
      .catch((err) => alive && setApi({ loading: false, error: err.message || String(err), players: [], teams: [] }))
    return () => {
      alive = false
    }
  }, [loadPlayers])

  useEffect(() => {
    if (!openDrop) return
    const refs = { club: clubRef, value: valueRef, points: pointsRef }
    const onDown = (e) => {
      const ref = refs[openDrop]
      if (ref?.current && !ref.current.contains(e.target)) setOpenDrop(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openDrop])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2800)
    return () => clearTimeout(t)
  }, [msg])

  // Deadline geçince: transfer kilitlenir, mesaj gösterilir ve Takımım'a dönülür.
  useEffect(() => {
    if (!locked) return
    setMsg('🔒 Deadline geçti, transfer kilitlendi — Takımıma dönülüyor…')
    const t = setTimeout(() => navigate(routes.squad), 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked])

  // Kaydedilmiş kadronun imzası (yuva sırasına göre oyuncu id'leri)
  const committedSig = useMemo(() => {
    const parts = []
    for (const pos of POS_ORDER) for (const s of committed[pos]) parts.push(s.player?.id ?? '_')
    return parts.join(',')
  }, [committed])

  // Kaydedilmiş kadro (örn. Supabase'den) sonradan yüklenirse ve kullanıcı henüz
  // taslakta değişiklik yapmadıysa, taslağı kaydedilmiş kadroyla senkronla.
  useEffect(() => {
    if (!editedRef.current) setDraft(cloneRoster(committed))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSig])

  // Taslağın imzası — kaydedilmiş kadrodan farklıysa "değişiklik var" (kaydet aktif)
  const draftSig = useMemo(() => {
    const parts = []
    for (const pos of POS_ORDER) for (const s of draft[pos]) parts.push(s.player?.id ?? '_')
    return parts.join(',')
  }, [draft])
  const isDirty = draftSig !== committedSig

  const draftList = useMemo(() => rosterPlayers(draft), [draft])
  const rosterIds = useMemo(() => new Set(draftList.map((p) => p.id)), [draftList])
  const clubCounts = useMemo(() => {
    const c = {}
    for (const p of draftList) c[p.club] = (c[p.club] || 0) + 1
    return c
  }, [draftList])

  const filledCount = draftList.length
  const spent = draftList.reduce((s, p) => s + p.price, 0)
  const remaining = TOTAL_BUDGET - spent
  const overBudget = remaining < 0
  const spentPct = Math.max(0, Math.min(100, (spent / TOTAL_BUDGET) * 100))
  const countPct = (filledCount / 15) * 100

  // Kulüp filtresi için takım listesi (renk + kısa kod)
  const teamsInfo = useMemo(
    () => api.teams.map((t) => ({ name: t.name, short: clubShort(t.name), bg: clubColors(t.name).bg })),
    [api.teams]
  )

  const list = useMemo(() => {
    let l = api.players
    if (posFilter) l = l.filter((p) => p.pos === posFilter)
    if (selectedClubs.length) l = l.filter((p) => selectedClubs.includes(p.club))
    // Özel karakter olmadan da bulunsun: aranan metin ve oyuncu adı ASCII'ye
    // indirgenip (ç→c, ş→s, ı→i, ö→o, ð→d, ø→o, æ→ae ...) karşılaştırılır.
    const q = normalizeText(search.trim())
    if (q) l = l.filter((p) => normalizeText(p.name).includes(q))
    return sortPlayers(l, sortKey)
  }, [api.players, posFilter, selectedClubs, sortKey, search])

  const setDraftSlot = (pos, index, player) => {
    editedRef.current = true
    setDraft((d) => {
      const next = cloneRoster(d)
      next[pos][index].player = player
      return next
    })
  }

  const toggleClub = (name) =>
    setSelectedClubs((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]))

  // Boş veya dolu yuvaya tıklama → oyuncu seçme popup'ı
  const openPicker = (pos, index) => {
    setPicker({ pos, index })
    setPosFilter(pos)
    setSearch('')
    setOpenDrop(null)
    setMsg('')
  }
  const closePicker = () => {
    setPicker(null)
    setOpenDrop(null)
  }
  const clearPickerSlot = () => {
    if (!picker) return
    setDraftSlot(picker.pos, picker.index, null)
    setPicker(null)
  }

  const addPlayer = (player) => {
    const pos = player.pos
    let target = null
    if (picker && picker.pos === pos) target = picker
    else {
      const idx = draft[pos].findIndex((s) => !s.player)
      if (idx >= 0) target = { pos, index: idx }
    }
    if (!target) {
      setMsg(`⚠ ${POSITIONS[pos].label} için boş yuva yok.`)
      return
    }
    setDraftSlot(pos, target.index, player)
    setPicker(null)
  }

  // Otomatik doldur: boş mevkileri, bütçe + kulüp limiti kurallarına göre,
  // mümkün olan en yüksek değerli oyuncularla doldurur (kalanları da
  // dolduracak minimum maliyeti rezerve ederek bütçeyi aşmaz).
  const autoFill = () => {
    const pool = api.players
    const next = cloneRoster(draft)
    const used = new Set()
    const clubCount = {}
    let budgetLeft = TOTAL_BUDGET
    const needed = { KL: 0, DF: 0, OS: 0, FW: 0 }
    for (const pos of POS_ORDER) {
      for (const slot of next[pos]) {
        if (slot.player) {
          used.add(slot.player.id)
          clubCount[slot.player.club] = (clubCount[slot.player.club] || 0) + 1
          budgetLeft -= slot.player.price
        } else {
          needed[pos] += 1
        }
      }
    }

    const minReserve = (need, u0, c0) => {
      const u = new Set(u0)
      const c = { ...c0 }
      let sum = 0
      for (const pos of POS_ORDER) {
        for (let i = 0; i < need[pos]; i++) {
          const opt = pool
            .filter((p) => p.pos === pos && !u.has(p.id) && (c[p.club] || 0) < MAX_PER_CLUB)
            .sort((a, b) => a.price - b.price)[0]
          if (!opt) return Infinity
          u.add(opt.id)
          c[opt.club] = (c[opt.club] || 0) + 1
          sum += opt.price
        }
      }
      return sum
    }

    const candidates = pool.filter((p) => !used.has(p.id)).sort((a, b) => b.price - a.price)
    for (const p of candidates) {
      if (needed[p.pos] <= 0) continue
      if ((clubCount[p.club] || 0) >= MAX_PER_CLUB) continue
      const after = budgetLeft - p.price
      if (after < 0) continue
      const need2 = { ...needed, [p.pos]: needed[p.pos] - 1 }
      const u2 = new Set(used); u2.add(p.id)
      const c2 = { ...clubCount, [p.club]: (clubCount[p.club] || 0) + 1 }
      if (after < minReserve(need2, u2, c2)) continue
      const idx = next[p.pos].findIndex((s) => !s.player)
      if (idx < 0) continue
      next[p.pos][idx].player = p
      used.add(p.id)
      clubCount[p.club] = (clubCount[p.club] || 0) + 1
      budgetLeft -= p.price
      needed[p.pos] -= 1
    }

    const stillEmpty = POS_ORDER.reduce((n, pos) => n + next[pos].filter((s) => !s.player).length, 0)
    editedRef.current = true
    setDraft(next)
    setPicker(null)
    setMsg(stillEmpty > 0 ? `⚠ Bütçe/oyuncu yetmedi, ${stillEmpty} mevki boş kaldı.` : 'Kadro otomatik dolduruldu ✓')
  }

  const emptyCount = 15 - filledCount
  // Kaydet yalnızca 15/15, bütçe uygun VE bir değişiklik yapıldıysa aktif
  const canSave = filledCount === 15 && !overBudget && isDirty && !locked

  const onSave = async () => {
    if (!canSave) return
    await commitAndSave(draft)
    navigate(routes.squad)
  }

  const clubLabel = selectedClubs.length === 0 ? 'Tüm kulüpler' : `${selectedClubs.length} kulüp`
  const valueLabel = sortKey === 'value-desc' ? 'Değer ↓' : sortKey === 'value-asc' ? 'Değer ↑' : 'Değer'
  const pointsLabel = sortKey === 'points-desc' ? 'Toplam Puan ↓' : sortKey === 'points-asc' ? 'Toplam Puan ↑' : 'Toplam Puan'
  const pickerSlotPlayer = picker ? draft[picker.pos][picker.index].player : null
  const slotVal = pickerSlotPlayer ? pickerSlotPlayer.price : 0
  const pickerPosMeta = picker ? POSITIONS[picker.pos] : null

  // Bir oyuncu yuvası (dolu / boş / skeleton)
  const renderSlot = (pos, index, slot) => {
    const key = `${pos}-${index}`
    if (squadLoading) {
      return (
        <div key={key} className="tr-pl skeleton" aria-hidden="true">
          <span className="tr-ava skel" />
          <span className="tr-skline" />
        </div>
      )
    }
    if (!slot.player) {
      return (
        <div key={key} className="tr-pl">
          <span className={`tr-postag ${TAGC[pos]}`}>{pos}</span>
          <button type="button" className={`tr-ava tr-ava-empty ${RING[pos]}`} onClick={() => openPicker(pos, index)} aria-label={`Boş ${POSITIONS[pos].label} — oyuncu seç`}>
            +
          </button>
          <div className="tr-nameplate tr-nameplate-empty"><span className="nm">Boş</span></div>
          <span className="tr-pr hidden">—</span>
        </div>
      )
    }
    const p = slot.player
    return (
      <div key={key} className="tr-pl">
        <span className={`tr-postag ${TAGC[pos]}`}>{pos}</span>
        <button type="button" className={`tr-ava ${RING[pos]}`} onClick={() => openPicker(pos, index)} aria-label={`${p.name} — değiştir`}>
          <PlayerPhoto id={p.id} name={p.name} bg={p.clubBg} fg={p.clubFg} />
        </button>
        <button type="button" className="tr-nameplate" onClick={() => setInfoPlayer(p)}>
          <span className="nm">{p.name}</span>
          <span className="clb">{p.club}</span>
        </button>
        <span className="tr-pr cond tnum">₺{p.price}M</span>
      </div>
    )
  }

  return (
    <div className="tr-page">
      {/* Takımıma Dön */}
      <Link to={routes.squad} className="tr-backbtn"><IconBack />Takımıma Dön</Link>

      {/* Hero — market teması */}
      <div className="tr-hero">
        <div className="tr-hero-crest">FFS</div>
        <div className="tr-hero-id">
          <h1 className="semi">{user ? user.username : 'Takımım'}</h1>
          <p>Fantasy Süper Lig · 2026–27 Sezonu</p>
        </div>
        <div className="tr-hero-word">Transfer</div>
        <div className="tr-hero-right">
          <button type="button" className="tr-btn-guide" onClick={() => setScoringOpen(true)}>
            <IconGuide />Puanlama Rehberi
          </button>
          <div className="tr-chip-deadline">
            <span className="k">Deadline</span>
            <b className="tnum">{deadlineText}</b>
          </div>
        </div>
      </div>

      {/* Stat kartları */}
      <div className="tr-stats">
        <div className="tr-stat tr-stat-budget">
          <div className="tr-stat-head">
            <span className="eyebrow">Bütçe</span>
            <span className="tr-stat-ico ico-green"><IconWallet /></span>
          </div>
          <div className="tr-budget-vals">
            <div className="bv">
              <div className="l">Toplam</div>
              <div className="v cond tnum">{TOTAL_BUDGET.toFixed(1)}M</div>
            </div>
            <div className="bv">
              <div className="l">Kalan</div>
              <div className={`v rem cond tnum${overBudget ? ' neg' : ''}`}>{remaining.toFixed(1)}M</div>
            </div>
          </div>
          <div className="tr-budget-bar"><div className="tr-budget-fill" style={{ width: `${spentPct}%` }} /></div>
        </div>

        <div className="tr-stat">
          <div className="tr-stat-head">
            <span className="eyebrow">Ekstra Bütçe &amp; Joker</span>
            <span className="tr-stat-ico ico-gold"><IconStar /></span>
          </div>
          <div className="tr-stat-dash cond">—</div>
        </div>

        <div className="tr-stat">
          <div className="tr-stat-head">
            <span className="eyebrow">Serbest Transfer Hakkı</span>
            <span className="tr-stat-ico ico-gold"><IconSwap /></span>
          </div>
          <div className="tr-stat-big semi">Sınırsız</div>
        </div>
      </div>

      {/* Hafta seçici */}
      <WeekBar
        weeks={weeks}
        visible={visibleWeeks}
        selected={week}
        onSelect={setWeek}
        now={now}
        loading={weeksLoading}
      />
      <div className="tr-hint">Hafta {week} için transfer yapıyorsunuz</div>

      {msg && !picker && <div className={`tr-msg${msg.startsWith('⚠') ? ' warn' : ' ok'}`}>{msg}</div>}

      {/* Saha — 15 oyuncu (FW → OS → DF → KL) */}
      <div className="tr-pitch-wrap">
        <div className="tr-pitch">
          <div className="tr-fieldbox">
            <div className="tr-plines" aria-hidden="true">
              <span className="tr-halfway" />
              <span className="tr-circle" />
              <span className="tr-cspot" />
              <span className="tr-box-t" />
              <span className="tr-goal-t" />
              <span className="tr-arc-t" />
              <span className="tr-box-b" />
              <span className="tr-goal-b" />
              <span className="tr-arc-b" />
            </div>
            <div className="tr-rows">
              {POS_ORDER.slice().reverse().map((pos) => (
                <div key={pos} className="tr-row">
                  {draft[pos].map((slot, index) => renderSlot(pos, index, slot))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky alt bar (Takımım gibi — kaydırınca görünür kalır, fikstürün üstünde) */}
      <div className="tr-footer">
        <div className="tr-footer-in">
          <div className="tr-count">
            <span className="tr-count-ring" style={{ '--pct': `${countPct}%` }}><IconCheck /></span>
            <span className="tr-count-num cond tnum">
              <b className={filledCount < 15 ? 'warn' : ''}>{filledCount}</b>/15
            </span>
            <span className="tr-count-lbl">{overBudget ? 'bütçe aşıldı' : 'oyuncu seçildi'}</span>
          </div>
          <div className="tr-footer-actions">
            <button type="button" className="tr-btn-autofill" onClick={autoFill} disabled={emptyCount === 0 || api.loading || !api.players.length}>
              <IconBolt />Boş Mevkileri Otomatik Doldur
            </button>
            <button type="button" className="tr-btn-save" onClick={onSave} disabled={!canSave}>
              <IconSave />Kaydet ve Takıma Dön
            </button>
          </div>
        </div>
      </div>

      {/* Bu haftanın fikstürü — sticky bar'ın ALTINDA (Takımım düzeni).
          preMatchOnly: Transfer deadline'da kapandığından yalnızca saat gösterilir. */}
      <WeekFixtures fixtures={fixtures} round={week} preMatchOnly />

      {/* Puanlama Rehberi modalı */}
      {scoringOpen && (
        <div className="tr-overlay show" onClick={() => setScoringOpen(false)}>
          <div className="tr-guide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="tr-mclose" onClick={() => setScoringOpen(false)} aria-label="Kapat">×</button>
            <ScoringGuide />
          </div>
        </div>
      )}

      {/* Oyuncu Seç modalı */}
      {picker && (
        <div className="tr-overlay show" onClick={closePicker}>
          <div className="tr-selmodal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="tr-sm-head">
              <div className="tr-sm-titlerow">
                <h2 className="tr-sm-title">{pickerPosMeta ? pickerPosMeta.label : 'Oyuncu'} Seç</h2>
                <button className="tr-mclose" onClick={closePicker} aria-label="Kapat">×</button>
              </div>

              {/* Context — hangi yuva */}
              <div className="tr-sm-ctx">
                {pickerSlotPlayer ? (
                  <>
                    <span className="cav" style={{ background: pickerSlotPlayer.clubBg, color: pickerSlotPlayer.clubFg }}>{initials(pickerSlotPlayer.name)}</span>
                    <span className="ct">Değiştiriliyor: <b>{pickerSlotPlayer.name}</b> · {pickerSlotPlayer.club}</span>
                  </>
                ) : (
                  <>
                    <span className="cav dash" />
                    <span className="ct">Boş <b>{pickerPosMeta?.label}</b> mevkisi dolduruluyor</span>
                  </>
                )}
                <span className={`cpos ${TAGC[picker.pos]}`}>{picker.pos}</span>
              </div>

              {/* Mevki sekmeleri */}
              <div className="tr-sm-tabs">
                {POS_TABS.map((t) => (
                  <button key={t.label} type="button" className={`tr-sm-tab${posFilter === t.key ? ' on' : ''}`} onClick={() => setPosFilter(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Filtreler: Kulüp · Değer · Toplam Puan */}
              <div className="tr-sm-filters">
                <div className={`tr-fdrop${openDrop === 'club' ? ' open' : ''}`} ref={clubRef}>
                  <button type="button" className={`tr-fdrop-btn${selectedClubs.length ? ' gold' : ''}`} onClick={() => setOpenDrop((d) => (d === 'club' ? null : 'club'))} disabled={api.loading}>
                    {clubLabel}
                  </button>
                  <div className="tr-fdrop-panel tr-team-panel">
                    {teamsInfo.map((t) => (
                      <label key={t.name} className="tr-team-opt">
                        <input type="checkbox" checked={selectedClubs.includes(t.name)} onChange={() => toggleClub(t.name)} />
                        <span className="tr-team-dot" style={{ background: t.bg }} />
                        {t.name}
                      </label>
                    ))}
                    <div className="tr-team-foot">
                      <button type="button" className="tf-clear" onClick={() => setSelectedClubs([])}>Temizle</button>
                      <button type="button" className="tf-ok" onClick={() => setOpenDrop(null)}>Tamam</button>
                    </div>
                  </div>
                </div>

                <div className={`tr-fdrop${openDrop === 'value' ? ' open' : ''}`} ref={valueRef}>
                  <button type="button" className={`tr-fdrop-btn${sortKey.startsWith('value') ? ' gold' : ''}`} onClick={() => setOpenDrop((d) => (d === 'value' ? null : 'value'))}>
                    {valueLabel}
                  </button>
                  <div className="tr-fdrop-panel">
                    <div className={`tr-fopt${sortKey === 'value-desc' ? ' on' : ''}`} onClick={() => { setSortKey('value-desc'); setOpenDrop(null) }}>Azalan</div>
                    <div className={`tr-fopt${sortKey === 'value-asc' ? ' on' : ''}`} onClick={() => { setSortKey('value-asc'); setOpenDrop(null) }}>Artan</div>
                  </div>
                </div>

                <div className={`tr-fdrop${openDrop === 'points' ? ' open' : ''}`} ref={pointsRef}>
                  <button type="button" className={`tr-fdrop-btn${sortKey.startsWith('points') ? ' gold' : ''}`} onClick={() => setOpenDrop((d) => (d === 'points' ? null : 'points'))}>
                    {pointsLabel}
                  </button>
                  <div className="tr-fdrop-panel">
                    <div className={`tr-fopt${sortKey === 'points-desc' ? ' on' : ''}`} onClick={() => { setSortKey('points-desc'); setOpenDrop(null) }}>Azalan</div>
                    <div className={`tr-fopt${sortKey === 'points-asc' ? ' on' : ''}`} onClick={() => { setSortKey('points-asc'); setOpenDrop(null) }}>Artan</div>
                  </div>
                </div>
              </div>

              {/* Arama */}
              <div className="tr-sm-search">
                <IconSearch />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Oyuncu ara…" />
              </div>

              {/* Kullanılabilir bütçe */}
              <div className="tr-sm-budget">
                <span className="l">Kullanılabilir bütçe</span>
                <span className="v cond tnum">{(remaining + slotVal).toFixed(1)}M</span>
              </div>

              {pickerSlotPlayer && (
                <button type="button" className="tr-btn-empty" onClick={clearPickerSlot}>Bu mevkiyi boşalt</button>
              )}
            </div>

            {/* Liste */}
            <div className="tr-sm-list">
              {api.loading && <div className="tr-empty-list">Yükleniyor…</div>}
              {!api.loading && api.error && <div className="tr-empty-list">⚠ {api.error}</div>}
              {!api.loading && !api.error && list.length === 0 && <div className="tr-empty-list">Filtreye uygun oyuncu yok.</div>}
              {!api.loading && !api.error &&
                list.map((p) => {
                  const inRoster = rosterIds.has(p.id)
                  const clubMaxed = (clubCounts[p.club] || 0) >= MAX_PER_CLUB && !inRoster
                  const freed = picker && p.pos === picker.pos ? slotVal : 0
                  const unaffordable = !inRoster && !clubMaxed && remaining + freed < p.price
                  const blocked = inRoster || clubMaxed || unaffordable
                  return (
                    <div key={p.id} className={`tr-prow${blocked ? ' dim' : ''}`}>
                      <span className="pav" style={{ background: p.clubBg, color: p.clubFg }}>{initials(p.name)}</span>
                      <button type="button" className="pmeta" onClick={() => setInfoPlayer(p)}>
                        <span className="pn">{p.name}</span>
                        <span className="pteam">{p.club}</span>
                        <span className="psub">
                          {POSITIONS[p.pos].label}
                          {inRoster && <span className="pstatus st-inrost">Kadroda</span>}
                          {clubMaxed && <span className="pstatus st-full">Aynı kulüpten max 3 oyuncu</span>}
                          {unaffordable && <span className="pstatus st-budget">Bütçe yetersiz</span>}
                        </span>
                      </button>
                      <span className="ppts cond">{ptsOf(p)}<small> P</small></span>
                      <span className="pval cond tnum">{p.price.toFixed(1)}M</span>
                      <button type="button" className="padd" disabled={blocked} onClick={() => addPlayer(p)} aria-label={`${p.name} ekle`}>+</button>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* Oyuncu bilgi kartı (Takımım detay modalı ile aynı tasarım; aksiyon butonları yok) */}
      {infoPlayer && (
        <PlayerDetailModal
          variant="info"
          player={infoPlayer}
          week={week}
          fixture={getTeamFixture(fixtures, infoPlayer.club, week)}
          weeks={weeks}
          fixtures={fixtures}
          onClose={() => setInfoPlayer(null)}
        />
      )}
    </div>
  )
}
