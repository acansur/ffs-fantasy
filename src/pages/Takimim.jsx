import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useSquad } from '../lib/squadStore.jsx'
import {
  POSITIONS,
  CLUBS,
  SQUAD_TOTALS,
  TOTAL_BUDGET,
  DEADLINE,
  WEEK_COUNT,
  VIEWS,
  SCORING,
  SCORING_TABS,
  formationLabel,
  surname6,
  surname,
  slotInfo,
} from '../lib/squadData.js'
import './Takimim.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

function SquadSlot({ entry, view, isCaptain, isSelected, isTarget, onClick, captainPopup }) {
  const { slot, pos } = entry
  const meta = POSITIONS[pos]
  const player = slot.player

  if (!player) {
    return (
      <button
        type="button"
        className={`tm-slot empty${isTarget ? ' target' : ''}`}
        style={{ '--pos': meta.color }}
        onClick={onClick}
        aria-label={`${meta.label} (boş)`}
      >
        <span className="tm-disc">
          <span className="tm-plus">+</span>
        </span>
        <span className="tm-tag muted">{meta.label}</span>
      </button>
    )
  }

  const club = CLUBS[player.club]
  return (
    <div className="tm-slot-wrap">
      <button
        type="button"
        className={`tm-slot filled${isSelected ? ' selected' : ''}${isTarget ? ' target' : ''}`}
        style={{ '--pos': meta.color, '--bg': club.bg, '--fg': club.fg }}
        onClick={onClick}
      >
        {isCaptain && <span className="tm-cap">C</span>}
        <span className="tm-disc jersey">
          <span className="tm-disc-name">{surname6(player.name)}</span>
        </span>
        <span className="tm-tag">
          <span className="tm-tag-name">{surname(player.name)}</span>
          <span className="tm-tag-info">{slotInfo(player, view)}</span>
        </span>
      </button>
      {captainPopup}
    </div>
  )
}

export default function Takimim() {
  const { user } = useAuth()
  const {
    roster,
    swapSlots,
    captainId,
    makeCaptain,
    clearCaptain,
    week,
    setWeek,
    rosterList,
    remaining,
    counts,
  } = useSquad()

  const [view, setView] = useState('next')
  const [scoringTab, setScoringTab] = useState('Genel')
  const [selected, setSelected] = useState(null)
  const [moveMsg, setMoveMsg] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (!moveMsg) return
    const t = setTimeout(() => setMoveMsg(''), 2500)
    return () => clearTimeout(t)
  }, [moveMsg])
  useEffect(() => {
    if (!saveMsg) return
    const t = setTimeout(() => setSaveMsg(''), 2500)
    return () => clearTimeout(t)
  }, [saveMsg])

  const overBudget = remaining < 0
  const captainPlayer = rosterList.find((p) => p.id === captainId) || null
  const formation = formationLabel(counts)
  const filledCount = rosterList.length

  // Saha ve yedek yuvalarını türet
  const fieldByPos = useMemo(() => {
    const map = {}
    for (const pos of POS_ORDER) {
      map[pos] = roster[pos]
        .map((slot, index) => ({ slot, pos, index }))
        .filter((e) => e.slot.starter)
    }
    return map
  }, [roster])

  const benchEntries = useMemo(() => {
    const list = []
    for (const pos of POS_ORDER) {
      roster[pos].forEach((slot, index) => {
        if (!slot.starter) list.push({ slot, pos, index })
      })
    }
    return list.sort((a, b) => (a.slot.benchOrder ?? 99) - (b.slot.benchOrder ?? 99))
  }, [roster])

  const isSel = (pos, index) => selected && selected.pos === pos && selected.index === index

  const onSlotClick = (pos, index) => {
    const slot = roster[pos][index]
    if (!selected) {
      if (!slot.player) return
      setSelected({ pos, index })
      return
    }
    if (isSel(pos, index)) {
      setSelected(null)
      return
    }
    const err = swapSlots(selected, { pos, index })
    setMoveMsg(err || '')
    setSelected(null)
  }

  const saveSquad = () => {
    if (overBudget) return
    if (filledCount < 15) setSaveMsg(`Kadro eksik (${filledCount}/15) — transfer yap`)
    else if (!captainId) setSaveMsg('Önce kaptan seç!')
    else setSaveMsg('Kadro kaydedildi ✓')
  }

  const renderSlot = (entry) => {
    const { pos, index, slot } = entry
    const selectedHere = isSel(pos, index)
    const captainPopup =
      selectedHere && slot.player ? (
        <div className="tm-cap-popup" onClick={(e) => e.stopPropagation()}>
          {slot.player.id === captainId ? (
            <button type="button" onClick={() => { clearCaptain(); setSelected(null) }}>
              Kaptanlığı çıkar
            </button>
          ) : (
            <button type="button" onClick={() => { makeCaptain(slot.player.id); setSelected(null) }}>
              Kaptan yap
            </button>
          )}
          <button type="button" className="ghost" onClick={() => setSelected(null)}>
            Çıkar
          </button>
        </div>
      ) : null

    return (
      <SquadSlot
        key={`${pos}-${index}`}
        entry={entry}
        view={view}
        isCaptain={slot.player ? slot.player.id === captainId : false}
        isSelected={selectedHere}
        isTarget={Boolean(selected) && !selectedHere}
        onClick={() => onSlotClick(pos, index)}
        captainPopup={captainPopup}
      />
    )
  }

  return (
    <div className="tm-page">
      {/* Üst bar */}
      <div className="tm-topbar">
        <div className="tm-team">
          <span className="tm-team-badge">FFS</span>
          <div>
            <div className="tm-team-name">{user ? user.username : 'Takımım'}</div>
            <div className="tm-team-sub">Fantasy Süper Lig</div>
          </div>
        </div>
        <div className="tm-topbar-right">
          <div className="tm-week-picker">
            <button
              type="button"
              aria-label="Önceki hafta"
              disabled={week <= 1}
              onClick={() => setWeek(Math.max(1, week - 1))}
            >
              ‹
            </button>
            <span>Week {week}</span>
            <button
              type="button"
              aria-label="Sonraki hafta"
              disabled={week >= WEEK_COUNT}
              onClick={() => setWeek(Math.min(WEEK_COUNT, week + 1))}
            >
              ›
            </button>
          </div>
          <div className="tm-formation-badge" title="Dizilişin otomatik güncellenir">
            {formation}
          </div>
          <div className="tm-deadline-chip">Deadline: {DEADLINE}</div>
        </div>
      </div>

      {/* Stat şeridi */}
      <div className="tm-stripe">
        <div className="tm-stat">
          <span>Toplam Bütçe</span>
          <strong>{TOTAL_BUDGET.toFixed(1)}M</strong>
        </div>
        <div className="tm-stat">
          <span>Kalan Bütçe</span>
          <strong className={remaining < 0 ? 'neg' : ''}>{remaining.toFixed(1)}M</strong>
        </div>
        <div className={`tm-stat${captainId ? '' : ' warn'}`}>
          <span>Kaptan</span>
          <strong>{captainId ? surname(captainPlayer.name) : '⚠ Seçilmedi'}</strong>
        </div>
        <div className="tm-stat">
          <span>Deadline</span>
          <strong className="tm-deadline">{DEADLINE}</strong>
        </div>
      </div>

      <div className="tm-layout">
        <div className="tm-left">
          <div className="tm-controls">
            <label className="tm-select">
              <span>Görünüm</span>
              <select value={view} onChange={(e) => setView(e.target.value)}>
                {VIEWS.map((v) => (
                  <option key={v.key} value={v.key}>{v.label}</option>
                ))}
              </select>
            </label>
            <p className="tm-hint">Bir oyuncuya, sonra başka bir yuvaya tıklayarak yer değiştir.</p>
          </div>

          {moveMsg && <div className="tm-move-warn">⚠ {moveMsg}</div>}

          <div className="tm-pitch">
            <div className="tm-lines">
              <div className="tm-mid" />
              <div className="tm-circle" />
              <div className="tm-spot" />
              <div className="tm-box top" />
              <div className="tm-box bottom" />
              <div className="tm-goal top" />
              <div className="tm-goal bottom" />
              <div className="tm-corner tl" />
              <div className="tm-corner tr" />
              <div className="tm-corner bl" />
              <div className="tm-corner br" />
            </div>
            <div className="tm-rows">
              <div className="tm-row">{fieldByPos.FW.map(renderSlot)}</div>
              <div className="tm-row">{fieldByPos.OS.map(renderSlot)}</div>
              <div className="tm-row">{fieldByPos.DF.map(renderSlot)}</div>
              <div className="tm-row">{fieldByPos.KL.map(renderSlot)}</div>
            </div>
          </div>

          <div className="tm-bench">
            <span className="tm-bench-label">Yedek Kulübesi · kaleci ilk sırada sabit</span>
            <div className="tm-bench-row">{benchEntries.map(renderSlot)}</div>
          </div>
        </div>

        {/* Sağ panel */}
        <aside className="tm-panel">
          <div className="tm-card">
            <h3>Mevki Dağılımı</h3>
            <div className="tm-pos-grid">
              {POS_ORDER.map((pos) => {
                const sel = roster[pos].filter((s) => s.player).length
                const tot = SQUAD_TOTALS[pos]
                return (
                  <div
                    key={pos}
                    className={`tm-pos${sel === tot ? ' full' : ''}`}
                    style={{ '--pos': POSITIONS[pos].color }}
                  >
                    <span>{POSITIONS[pos].label}</span>
                    <strong>{sel}/{tot}</strong>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="tm-card">
            <h3>Puanlama Rehberi</h3>
            <div className="tm-tabs">
              {SCORING_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`tm-tab${scoringTab === tab ? ' active' : ''}`}
                  onClick={() => setScoringTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <ul className="tm-scoring">
              {SCORING[scoringTab].map((row) => {
                const cls = row.pts.startsWith('+') ? 'pos' : row.pts.startsWith('-') ? 'neg' : 'mult'
                return (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <span className={`tm-pts ${cls}`}>{row.pts}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      </div>

      {/* Sticky aksiyon çubuğu */}
      <div className="tm-actionbar">
        <Link to="/transfer" className="tm-transfer-btn">⇄ Transfer Yap</Link>
        <div className="tm-actionbar-right">
          {overBudget && <span className="tm-budget-warn">Bütçen aşıldı — kaydedemezsin.</span>}
          {saveMsg && !overBudget && <span className="tm-save-msg">{saveMsg}</span>}
          <button type="button" className="tm-save" onClick={saveSquad} disabled={overBudget}>
            Kadroyu Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}
