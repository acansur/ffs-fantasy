import { useMemo, useState, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import PlayerPickerModal from '../components/PlayerPickerModal.jsx'
import {
  POSITIONS,
  CLUBS,
  FORMATIONS,
  DEFAULT_FORMATION,
  slotCounts,
  SQUAD_TOTALS,
  TOTAL_BUDGET,
  CURRENT_WEEK,
  VIEWS,
  SCORING,
  SCORING_TABS,
  surname6,
  surname,
  slotInfo,
} from '../lib/squadData.js'
import './Takimim.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

function makeSquad(formation) {
  const { field, bench } = slotCounts(formation)
  const build = (counts) =>
    POS_ORDER.reduce((acc, pos) => ({ ...acc, [pos]: Array(counts[pos]).fill(null) }), {})
  return { field: build(field), bench: build(bench) }
}

function resizeInto(pool, n) {
  const slots = Array(n).fill(null)
  for (let i = 0; i < n && i < pool.length; i++) slots[i] = pool[i]
  return slots
}

// Diziliş değişince seçimleri koru: mevki havuzunu önce sahaya, sonra yedeğe dağıt.
function redistribute(squad, formation) {
  const { field, bench } = slotCounts(formation)
  const next = { field: {}, bench: {} }
  for (const pos of POS_ORDER) {
    const pool = [...squad.field[pos], ...squad.bench[pos]].filter(Boolean)
    next.field[pos] = resizeInto(pool, field[pos])
    next.bench[pos] = resizeInto(pool.slice(field[pos]), bench[pos])
  }
  return next
}

function Slot({ player, pos, isCaptain, view, onOpen }) {
  const meta = POSITIONS[pos]

  if (!player) {
    return (
      <button
        type="button"
        className="tm-slot empty"
        style={{ '--pos': meta.color }}
        onClick={onOpen}
        aria-label={`${meta.label} ekle`}
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
    <button
      type="button"
      className="tm-slot filled"
      style={{ '--pos': meta.color, '--bg': club.bg, '--fg': club.fg }}
      onClick={onOpen}
      title="Düzenle"
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
  )
}

export default function Takimim() {
  const { user } = useAuth()
  const [formation, setFormation] = useState(DEFAULT_FORMATION)
  const [squad, setSquad] = useState(() => makeSquad(DEFAULT_FORMATION))
  const [captainId, setCaptainId] = useState(null)
  const [picker, setPicker] = useState(null)
  const [view, setView] = useState('next')
  const [scoringTab, setScoringTab] = useState('Genel')
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (!saveMsg) return
    const t = setTimeout(() => setSaveMsg(''), 2500)
    return () => clearTimeout(t)
  }, [saveMsg])

  const changeFormation = (next) => {
    setFormation(next)
    setSquad((s) => redistribute(s, next))
  }

  const allPicked = useMemo(() => {
    const list = []
    for (const zone of ['field', 'bench']) {
      for (const pos of POS_ORDER) list.push(...squad[zone][pos])
    }
    return list.filter(Boolean)
  }, [squad])

  const takenIds = useMemo(() => new Set(allPicked.map((p) => p.id)), [allPicked])
  const spent = allPicked.reduce((sum, p) => sum + p.price, 0)
  const remaining = TOTAL_BUDGET - spent
  const captainPlayer = allPicked.find((p) => p.id === captainId) || null

  const posCounts = useMemo(() => {
    const counts = { KL: 0, DF: 0, OS: 0, FW: 0 }
    for (const zone of ['field', 'bench']) {
      for (const pos of POS_ORDER) counts[pos] += squad[zone][pos].filter(Boolean).length
    }
    return counts
  }, [squad])

  const openPicker = (zone, pos, index) => setPicker({ zone, pos, index })
  const closePicker = () => setPicker(null)
  const pickerCurrent = picker ? squad[picker.zone][picker.pos][picker.index] : null

  const assignPlayer = (playerOrNull) => {
    if (!picker) return
    const { zone, pos, index } = picker
    if (!playerOrNull && pickerCurrent && pickerCurrent.id === captainId) setCaptainId(null)
    setSquad((s) => {
      const arr = [...s[zone][pos]]
      arr[index] = playerOrNull
      return { ...s, [zone]: { ...s[zone], [pos]: arr } }
    })
    closePicker()
  }

  const makeCaptain = () => {
    if (!pickerCurrent) return
    setCaptainId((cur) => (cur === pickerCurrent.id ? null : pickerCurrent.id))
    closePicker()
  }

  const saveSquad = () => {
    if (allPicked.length < 15) setSaveMsg(`Kadro eksik (${allPicked.length}/15)`)
    else if (!captainId) setSaveMsg('Önce kaptan seç!')
    else setSaveMsg('Kadro kaydedildi ✓')
  }

  const renderRow = (zone, pos) =>
    squad[zone][pos].map((player, i) => (
      <Slot
        key={`${zone}-${pos}-${i}`}
        player={player}
        pos={pos}
        view={view}
        isCaptain={player ? player.id === captainId : false}
        onOpen={() => openPicker(zone, pos, i)}
      />
    ))

  const benchSlots = POS_ORDER.flatMap((pos) => renderRow('bench', pos))

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
        <div className="tm-week">Hafta {CURRENT_WEEK}</div>
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
        <div className="tm-stat">
          <span>Kadro</span>
          <strong>{allPicked.length}/15</strong>
        </div>
        <div className={`tm-stat${captainId ? '' : ' warn'}`}>
          <span>Kaptan</span>
          <strong>{captainId ? surname(captainPlayer.name) : '⚠ Seçilmedi'}</strong>
        </div>
      </div>

      <div className="tm-layout">
        {/* Sol: kontroller + saha */}
        <div className="tm-left">
          <div className="tm-controls">
            <label className="tm-select">
              <span>Diziliş</span>
              <select value={formation} onChange={(e) => changeFormation(e.target.value)}>
                {Object.keys(FORMATIONS).map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="tm-select">
              <span>Görünüm</span>
              <select value={view} onChange={(e) => setView(e.target.value)}>
                {VIEWS.map((v) => (
                  <option key={v.key} value={v.key}>{v.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="tm-save" onClick={saveSquad}>
              Kadroyu Kaydet
            </button>
            {saveMsg && <span className="tm-save-msg">{saveMsg}</span>}
          </div>

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
              <div className="tm-row">{renderRow('field', 'FW')}</div>
              <div className="tm-row">{renderRow('field', 'OS')}</div>
              <div className="tm-row">{renderRow('field', 'DF')}</div>
              <div className="tm-row">{renderRow('field', 'KL')}</div>
            </div>
          </div>

          <div className="tm-bench">
            <span className="tm-bench-label">Yedek Kulübesi</span>
            <div className="tm-bench-row">{benchSlots}</div>
          </div>
        </div>

        {/* Sağ panel */}
        <aside className="tm-panel">
          <div className="tm-card">
            <h3>Kadro Özeti</h3>
            <div className="tm-summary-grid">
              <div>
                <span>Seçilen</span>
                <strong>{allPicked.length}/15</strong>
              </div>
              <div>
                <span>Kalan Bütçe</span>
                <strong>{remaining.toFixed(1)}M</strong>
              </div>
              <div>
                <span>Kaptan</span>
                <strong>{captainPlayer ? surname(captainPlayer.name) : '—'}</strong>
              </div>
              <div>
                <span>Harcanan</span>
                <strong>{spent.toFixed(1)}M</strong>
              </div>
            </div>
          </div>

          <div className="tm-card">
            <h3>Mevki Dağılımı</h3>
            <div className="tm-pos-grid">
              {POS_ORDER.map((pos) => {
                const sel = posCounts[pos]
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
                const cls = row.pts.startsWith('+')
                  ? 'pos'
                  : row.pts.startsWith('-')
                    ? 'neg'
                    : 'mult'
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

      {picker && (
        <PlayerPickerModal
          allowedPos={picker.pos}
          takenIds={takenIds}
          currentId={pickerCurrent ? pickerCurrent.id : null}
          isCaptain={pickerCurrent ? pickerCurrent.id === captainId : false}
          onSelect={(p) => assignPlayer(p)}
          onClear={() => assignPlayer(null)}
          onMakeCaptain={makeCaptain}
          onClose={closePicker}
        />
      )}
    </div>
  )
}
