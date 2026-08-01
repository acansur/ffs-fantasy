import { useMemo, useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSquad } from '../lib/squadStore.jsx'
import {
  PLAYERS,
  POSITIONS,
  CLUBS,
  TOTAL_BUDGET,
  DEADLINE,
  MAX_PER_CLUB,
  sortByValue,
  initials,
} from '../lib/squadData.js'
import './Transfer.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const POS_TABS = [{ key: null, label: 'Tümü' }, ...POS_ORDER.map((p) => ({ key: p, label: p }))]

export default function Transfer() {
  const navigate = useNavigate()
  const { roster, setSlot, rosterList, remaining, clubCounts } = useSquad()

  const [selectedSlot, setSelectedSlot] = useState(null)
  const [posFilter, setPosFilter] = useState(null)
  const [selectedClubs, setSelectedClubs] = useState([])
  const [sortDir, setSortDir] = useState('desc')
  const [clubOpen, setClubOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const clubRef = useRef(null)

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

  const rosterIds = useMemo(() => new Set(rosterList.map((p) => p.id)), [rosterList])
  const filledCount = rosterList.length
  const overBudget = remaining < 0

  // Aynı kulüpten >3 ihlali (normalde engelleniyor)
  const clubViolations = Object.entries(clubCounts).filter(([, n]) => n > MAX_PER_CLUB)

  const list = useMemo(() => {
    let l = PLAYERS
    if (posFilter) l = l.filter((p) => p.pos === posFilter)
    if (selectedClubs.length) l = l.filter((p) => selectedClubs.includes(p.club))
    return sortByValue(l, sortDir)
  }, [posFilter, selectedClubs, sortDir])

  const toggleClub = (code) =>
    setSelectedClubs((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))

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
    setSlot(pos, index, null)
    setSelectedSlot(null)
  }

  const addPlayer = (player) => {
    const pos = player.pos
    let target = null
    if (selectedSlot && selectedSlot.pos === pos) target = selectedSlot
    else {
      const idx = roster[pos].findIndex((s) => !s.player)
      if (idx >= 0) target = { pos, index: idx }
    }
    if (!target) {
      setMsg(`${POSITIONS[pos].label} için boş yuva yok.`)
      return
    }
    setSlot(pos, target.index, player)
    setSelectedSlot(null)
  }

  const canSave = filledCount === 15 && !overBudget

  const onSave = () => {
    if (!canSave) return
    navigate('/takimim')
  }

  const clubLabel = selectedClubs.length === 0 ? 'Tüm kulüpler' : `${selectedClubs.length} kulüp`

  return (
    <div className="tr-page">
      {/* Üst bar */}
      <div className="tr-topbar">
        <Link to="/takimim" className="tr-back">‹ Kadro</Link>
        <div className="tr-topbar-mid">
          <span className="tr-free">Free transfer: <strong>Sınırsız</strong></span>
        </div>
        <div className="tr-deadline">Deadline: {DEADLINE}</div>
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
              ? `⚠ ${clubViolations.map(([c]) => CLUBS[c].short).join(', ')}`
              : `Max ${MAX_PER_CLUB}/kulüp`}
          </strong>
        </div>
      </div>

      {msg && <div className="tr-msg">⚠ {msg}</div>}

      <div className="tr-layout">
        {/* Sol: sabit 15 mevki */}
        <div className="tr-field">
          {POS_ORDER.slice().reverse().map((pos) => (
            <div key={pos} className="tr-field-row">
              {roster[pos].map((slot, index) => {
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
                      <span className="tr-disc"><span className="tr-plus">+</span></span>
                      <span className="tr-slot-tag muted">{pos}</span>
                    </button>
                  )
                }
                const club = CLUBS[slot.player.club]
                return (
                  <div key={`${pos}-${index}`} className="tr-slot-wrap">
                    <button
                      type="button"
                      className={`tr-slot filled${sel ? ' selected' : ''}`}
                      style={{ '--pos': meta.color, '--bg': club.bg, '--fg': club.fg }}
                      onClick={() => onSlotClick(pos, index)}
                    >
                      <span className="tr-disc jersey">{initials(slot.player.name)}</span>
                      <span className="tr-slot-tag">{slot.player.name.split(' ').slice(-1)[0]}</span>
                    </button>
                    {sel && (
                      <button
                        type="button"
                        className="tr-remove"
                        title="Mevkiden çıkar"
                        onClick={(e) => removeFromSlot(pos, index, e)}
                      >
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
              <button
                key={t.label}
                type="button"
                className={`tr-pos-tab${posFilter === t.key ? ' active' : ''}`}
                onClick={() => setPosFilter(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="tr-list-controls">
            <div className="dropdown" ref={clubRef}>
              <button type="button" className="dropdown-toggle" onClick={() => setClubOpen((o) => !o)}>
                {clubLabel}
              </button>
              {clubOpen && (
                <div className="dropdown-panel">
                  {Object.entries(CLUBS).map(([code, club]) => (
                    <label key={code} className="check-row">
                      <input
                        type="checkbox"
                        checked={selectedClubs.includes(code)}
                        onChange={() => toggleClub(code)}
                      />
                      <span className="club-dot" style={{ background: club.bg }} />
                      {club.name}
                    </label>
                  ))}
                  <div className="dropdown-foot">
                    {selectedClubs.length > 0 && (
                      <button type="button" className="link-btn" onClick={() => setSelectedClubs([])}>
                        Temizle
                      </button>
                    )}
                    <button type="button" className="link-btn dropdown-done" onClick={() => setClubOpen(false)}>
                      Tamam
                    </button>
                  </div>
                </div>
              )}
            </div>
            <select
              className="sort-select"
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
              aria-label="Sıralama"
            >
              <option value="desc">Değer (azalan)</option>
              <option value="asc">Değer (artan)</option>
            </select>
          </div>

          <ul className="tr-player-list">
            {list.map((p) => {
              const club = CLUBS[p.club]
              const inRoster = rosterIds.has(p.id)
              const clubMaxed = (clubCounts[p.club] || 0) >= MAX_PER_CLUB && !inRoster
              const disabled = inRoster || clubMaxed
              return (
                <li key={p.id} className={`tr-player${disabled ? ' disabled' : ''}`}>
                  <span className="tr-p-jersey" style={{ background: club.bg, color: club.fg }}>
                    {initials(p.name)}
                  </span>
                  <span className="tr-p-meta">
                    <span className="tr-p-name">{p.name}</span>
                    <span className="tr-p-sub">
                      {club.short} · {POSITIONS[p.pos].label}
                      {inRoster && ' · kadroda'}
                      {clubMaxed && ' · kulüp dolu'}
                    </span>
                  </span>
                  <span className="tr-p-price">{p.price.toFixed(1)}M</span>
                  <button
                    type="button"
                    className="tr-add"
                    disabled={disabled}
                    onClick={() => addPlayer(p)}
                    aria-label={`${p.name} ekle`}
                  >
                    +
                  </button>
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
        <button type="button" className="tr-save" onClick={onSave} disabled={!canSave}>
          Kaydet ve Kadroya Dön
        </button>
      </div>
    </div>
  )
}
