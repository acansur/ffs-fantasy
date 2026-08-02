import { useMemo, useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSquad, cloneRoster, rosterPlayers } from '../lib/squadStore.jsx'
import { loadSuperLigPlayers, toAppPlayers, clubColors, clubShort } from '../lib/apiFootball.js'
import { getVisibleWeeks, formatDeadline } from '../lib/weeks.js'
import WeekBar from '../components/WeekBar.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import { POSITIONS, TOTAL_BUDGET, MAX_PER_CLUB, sortByValue, initials } from '../lib/squadData.js'
import './Transfer.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const POS_TABS = [{ key: null, label: 'Tümü' }, ...POS_ORDER.map((p) => ({ key: p, label: p }))]

export default function Transfer() {
  const navigate = useNavigate()
  const { roster: committed, commitRoster, week, setWeek, weeks, weeksLoading } = useSquad()

  const now = Date.now()
  const visibleWeeks = getVisibleWeeks(weeks, now)
  const selectedWeek = weeks.find((w) => w.round === week) || null
  const deadlineText = selectedWeek ? formatDeadline(selectedWeek.deadline) : '—'

  // Taslak: kaydedilene kadar kadroya yansımaz
  const [draft, setDraft] = useState(() => cloneRoster(committed))
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [posFilter, setPosFilter] = useState(null)
  const [selectedClubs, setSelectedClubs] = useState([])
  const [sortDir, setSortDir] = useState('desc')
  const [clubOpen, setClubOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const clubRef = useRef(null)

  // Gerçek API oyuncuları
  const [api, setApi] = useState({ loading: true, error: null, players: [], teams: [] })

  useEffect(() => {
    let alive = true
    loadSuperLigPlayers()
      .then((res) => alive && setApi({ loading: false, error: null, players: toAppPlayers(res.players), teams: res.teams }))
      .catch((err) => alive && setApi({ loading: false, error: err.message || String(err), players: [], teams: [] }))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!clubOpen) return
    const onDown = (e) => {
      if (clubRef.current && !clubRef.current.contains(e.target)) setClubOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [clubOpen])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2500)
    return () => clearTimeout(t)
  }, [msg])

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
  const clubViolations = Object.entries(clubCounts).filter(([, n]) => n > MAX_PER_CLUB)

  // Kulüp filtresi için takım listesi (renk + kısa kod)
  const teamsInfo = useMemo(
    () => api.teams.map((t) => ({ name: t.name, short: clubShort(t.name), bg: clubColors(t.name).bg })),
    [api.teams]
  )

  const list = useMemo(() => {
    let l = api.players
    if (posFilter) l = l.filter((p) => p.pos === posFilter)
    if (selectedClubs.length) l = l.filter((p) => selectedClubs.includes(p.club))
    return sortByValue(l, sortDir)
  }, [api.players, posFilter, selectedClubs, sortDir])

  const setDraftSlot = (pos, index, player) => {
    setDraft((d) => {
      const next = cloneRoster(d)
      next[pos][index].player = player
      return next
    })
  }

  const toggleClub = (name) =>
    setSelectedClubs((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]))

  const onSlotClick = (pos, index) => {
    if (selectedSlot && selectedSlot.pos === pos && selectedSlot.index === index) {
      setSelectedSlot(null)
      return
    }
    setSelectedSlot({ pos, index })
    setPosFilter(pos)
  }

  const removeFromSlot = (pos, index, e) => {
    e.stopPropagation()
    setDraftSlot(pos, index, null)
    setSelectedSlot(null)
  }

  const addPlayer = (player) => {
    const pos = player.pos
    let target = null
    if (selectedSlot && selectedSlot.pos === pos) target = selectedSlot
    else {
      const idx = draft[pos].findIndex((s) => !s.player)
      if (idx >= 0) target = { pos, index: idx }
    }
    if (!target) {
      setMsg(`⚠ ${POSITIONS[pos].label} için boş yuva yok.`)
      return
    }
    setDraftSlot(pos, target.index, player)
    setSelectedSlot(null)
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
    setDraft(next)
    setSelectedSlot(null)
    setMsg(stillEmpty > 0 ? `⚠ Bütçe/oyuncu yetmedi, ${stillEmpty} mevki boş kaldı.` : 'Kadro otomatik dolduruldu ✓')
  }

  const emptyCount = 15 - filledCount
  const canSave = filledCount === 15 && !overBudget

  const onSave = () => {
    if (!canSave) return
    commitRoster(draft)
    navigate('/takimim')
  }

  const clubLabel = selectedClubs.length === 0 ? 'Tüm kulüpler' : `${selectedClubs.length} kulüp`

  return (
    <div className="tr-page">
      {/* Üst bar */}
      <div className="tr-topbar">
        <Link to="/takimim" className="tr-back">‹ Takımım</Link>
        <div className="tr-topbar-mid">
          <span className="tr-free">Free transfer: <strong>Sınırsız</strong></span>
        </div>
        <div className="tr-deadline">Deadline: {deadlineText}</div>
      </div>

      {/* Stat şeridi */}
      <div className="tr-stripe">
        <div className="tr-stat">
          <span>Toplam Bütçe</span>
          <strong>{TOTAL_BUDGET.toFixed(1)}M</strong>
        </div>
        <div className="tr-stat">
          <span>Kalan Bütçe</span>
          <strong className={overBudget ? 'neg' : ''}>{remaining.toFixed(1)}M</strong>
        </div>
        <div className="tr-stat">
          <span>Seçilen</span>
          <strong>{filledCount}/15</strong>
        </div>
        <div className={`tr-stat${clubViolations.length ? ' warn' : ''}`}>
          <span>Kulüp Limiti</span>
          <strong>
            {clubViolations.length
              ? `⚠ ${clubViolations.map(([c]) => clubShort(c)).join(', ')}`
              : `Max ${MAX_PER_CLUB}/kulüp`}
          </strong>
        </div>
      </div>

      {/* Hafta bar'ı — stat kutucuklarının hemen altında */}
      <WeekBar
        weeks={weeks}
        visible={visibleWeeks}
        selected={week}
        onSelect={setWeek}
        now={now}
        loading={weeksLoading}
      />
      <div className="tr-week-note">Hafta {week} için transfer yapıyorsunuz</div>

      {msg && <div className={`tr-msg${msg.startsWith('⚠') ? ' warn' : ' ok'}`}>{msg}</div>}

      <div className="tr-layout">
        {/* Sol: sabit 15 mevki */}
        <div className="tr-field">
          {POS_ORDER.slice().reverse().map((pos) => (
            <div key={pos} className="tr-field-row">
              {draft[pos].map((slot, index) => {
                const meta = POSITIONS[pos]
                const sel = selectedSlot && selectedSlot.pos === pos && selectedSlot.index === index
                if (!slot.player) {
                  return (
                    <button
                      key={`${pos}-${index}`}
                      type="button"
                      className={`tr-slot empty${sel ? ' selected' : ''}`}
                      style={{ '--pos': meta.color }}
                      onClick={() => onSlotClick(pos, index)}
                    >
                      <span className="tr-postag" style={{ '--pos': meta.color }}>{pos}</span>
                      <span className="tr-disc"><span className="tr-plus">+</span></span>
                    </button>
                  )
                }
                const p = slot.player
                return (
                  <div key={`${pos}-${index}`} className="tr-slot-wrap">
                    <button
                      type="button"
                      className={`tr-slot filled${sel ? ' selected' : ''}`}
                      style={{ '--pos': meta.color, '--bg': p.clubBg, '--fg': p.clubFg }}
                      onClick={() => onSlotClick(pos, index)}
                    >
                      <span className="tr-postag" style={{ '--pos': meta.color }}>{pos}</span>
                      <span className="tr-disc jersey">
                        <PlayerPhoto id={p.id} name={p.name} bg={p.clubBg} fg={p.clubFg} />
                      </span>
                      <span className="tr-slot-tag">{p.name}</span>
                      <span className="tr-slot-price">₺{p.price}M</span>
                    </button>
                    {sel && (
                      <button type="button" className="tr-remove" title="Mevkiden çıkar" onClick={(e) => removeFromSlot(pos, index, e)}>
                        −
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Sağ: oyuncu listesi */}
        <div className="tr-list-panel">
          <div className="tr-pos-tabs">
            {POS_TABS.map((t) => (
              <button key={t.label} type="button" className={`tr-pos-tab${posFilter === t.key ? ' active' : ''}`} onClick={() => setPosFilter(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="tr-list-controls">
            <div className="dropdown" ref={clubRef}>
              <button type="button" className="dropdown-toggle" onClick={() => setClubOpen((o) => !o)} disabled={api.loading}>
                {clubLabel}
              </button>
              {clubOpen && (
                <div className="dropdown-panel">
                  {teamsInfo.map((t) => (
                    <label key={t.name} className="check-row">
                      <input type="checkbox" checked={selectedClubs.includes(t.name)} onChange={() => toggleClub(t.name)} />
                      <span className="club-dot" style={{ background: t.bg }} />
                      {t.name}
                    </label>
                  ))}
                  <div className="dropdown-foot">
                    {selectedClubs.length > 0 && (
                      <button type="button" className="link-btn" onClick={() => setSelectedClubs([])}>Temizle</button>
                    )}
                    <button type="button" className="link-btn dropdown-done" onClick={() => setClubOpen(false)}>Tamam</button>
                  </div>
                </div>
              )}
            </div>
            <select className="sort-select" value={sortDir} onChange={(e) => setSortDir(e.target.value)} aria-label="Sıralama">
              <option value="desc">Değer (azalan)</option>
              <option value="asc">Değer (artan)</option>
            </select>
          </div>

          <ul className="tr-player-list">
            {api.loading && <li className="tr-loading">Yükleniyor…</li>}
            {!api.loading && api.error && <li className="tr-loading err">⚠ {api.error}</li>}
            {!api.loading && !api.error && list.length === 0 && (
              <li className="tr-loading">Filtreye uygun oyuncu yok.</li>
            )}
            {!api.loading && !api.error &&
              list.map((p) => {
                const inRoster = rosterIds.has(p.id)
                const clubMaxed = (clubCounts[p.club] || 0) >= MAX_PER_CLUB && !inRoster
                const disabled = inRoster || clubMaxed
                return (
                  <li key={p.id} className={`tr-player${disabled ? ' disabled' : ''}`}>
                    <span className="tr-p-jersey" style={{ background: p.clubBg, color: p.clubFg }}>{initials(p.name)}</span>
                    <span className="tr-p-meta">
                      <span className="tr-p-name">{p.name}</span>
                      <span className="tr-p-sub">
                        {p.club} · {POSITIONS[p.pos].label}
                        {inRoster && ' · kadroda'}
                        {clubMaxed && ' · kulüp dolu'}
                      </span>
                    </span>
                    <span className="tr-p-price">{p.price.toFixed(1)}M</span>
                    <button type="button" className="tr-add" disabled={disabled} onClick={() => addPlayer(p)} aria-label={`${p.name} ekle`}>+</button>
                  </li>
                )
              })}
          </ul>
        </div>
      </div>

      {/* Sticky aksiyon çubuğu */}
      <div className="tr-actionbar">
        {overBudget ? (
          <span className="tr-budget-warn">Bütçeni aştın — kadroyu kaydedemezsin.</span>
        ) : (
          <span className="tr-count-note">{filledCount}/15 oyuncu seçildi</span>
        )}
        <div className="tr-actionbar-right">
          <button
            type="button"
            className="tr-autofill"
            onClick={autoFill}
            disabled={emptyCount === 0 || api.loading || !api.players.length}
          >
            ⚡ Otomatik Doldur
          </button>
          <button type="button" className="tr-save" onClick={onSave} disabled={!canSave}>
            Kaydet ve Takıma Dön
          </button>
        </div>
      </div>
    </div>
  )
}
