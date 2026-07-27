import { useMemo, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import PlayerPickerModal from '../components/PlayerPickerModal.jsx'
import {
  POSITIONS,
  CLUBS,
  FORMATIONS,
  DEFAULT_FORMATION,
  slotCounts,
  initials,
} from '../lib/squadData.js'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

// Boş kadro yapısı: field ve bench için mevki başına null dizileri
function makeSquad(formation) {
  const { field, bench } = slotCounts(formation)
  const build = (counts) =>
    POS_ORDER.reduce((acc, pos) => ({ ...acc, [pos]: Array(counts[pos]).fill(null) }), {})
  return { field: build(field), bench: build(bench) }
}

// Diziliş değişince: her mevkideki seçili oyuncuları topla, önce sahayı sonra
// yedeği dolduracak şekilde yeniden dağıt (hiçbir seçim kaybolmaz).
function redistribute(squad, formation) {
  const { field, bench } = slotCounts(formation)
  const next = { field: {}, bench: {} }
  for (const pos of POS_ORDER) {
    const pool = [...squad.field[pos], ...squad.bench[pos]].filter(Boolean)
    const fieldSlots = Array(field[pos]).fill(null)
    const benchSlots = Array(bench[pos]).fill(null)
    let i = 0
    for (; i < fieldSlots.length && i < pool.length; i++) fieldSlots[i] = pool[i]
    for (let j = 0; i < pool.length && j < benchSlots.length; i++, j++) benchSlots[j] = pool[i]
    next.field[pos] = fieldSlots
    next.bench[pos] = benchSlots
  }
  return next
}

// Tek oyuncu yuvası. Boş/dolu fark etmez tıklanınca popup açılır.
function Slot({ player, pos, isCaptain, onOpen }) {
  const meta = POSITIONS[pos]

  if (!player) {
    return (
      <button
        type="button"
        className="slot slot-empty"
        style={{ '--pos-color': meta.color }}
        onClick={onOpen}
        aria-label={`${meta.label} ekle`}
      >
        <span className="slot-jersey empty">+</span>
      </button>
    )
  }

  const club = CLUBS[player.club]
  return (
    <button type="button" className="slot slot-filled" onClick={onOpen} title="Düzenle">
      {isCaptain && <span className="cap-badge">C</span>}
      <span className="slot-jersey" style={{ background: club.bg, color: club.fg }}>
        {initials(player.name)}
      </span>
      <span className="slot-name" style={{ background: club.bg, color: club.fg }}>
        {player.name.split(' ').slice(-1)[0]}
      </span>
    </button>
  )
}

export default function Takimim() {
  const { user } = useAuth()
  const [formation, setFormation] = useState(DEFAULT_FORMATION)
  const [squad, setSquad] = useState(() => makeSquad(DEFAULT_FORMATION))
  const [captainId, setCaptainId] = useState(null)
  const [picker, setPicker] = useState(null) // { zone: 'field'|'bench', pos, index } | null

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
  const totalValue = allPicked.reduce((sum, p) => sum + p.price, 0)

  const openPicker = (zone, pos, index) => setPicker({ zone, pos, index })
  const closePicker = () => setPicker(null)

  const pickerCurrent = picker ? squad[picker.zone][picker.pos][picker.index] : null

  const assignPlayer = (playerOrNull) => {
    if (!picker) return
    const { zone, pos, index } = picker
    // Boşaltılan oyuncu kaptansa kaptanlığı düşür
    if (!playerOrNull && pickerCurrent && pickerCurrent.id === captainId) {
      setCaptainId(null)
    }
    setSquad((s) => {
      const arr = [...s[zone][pos]]
      arr[index] = playerOrNull
      return { ...s, [zone]: { ...s[zone], [pos]: arr } }
    })
    closePicker()
  }

  const makeCaptain = () => {
    if (!pickerCurrent) return
    // Tek kaptan: aynı oyuncuya tekrar basılırsa kaldır, değilse bu oyuncuyu kaptan yap
    setCaptainId((cur) => (cur === pickerCurrent.id ? null : pickerCurrent.id))
    closePicker()
  }

  const renderRow = (zone, pos) =>
    squad[zone][pos].map((player, i) => (
      <Slot
        key={`${zone}-${pos}-${i}`}
        player={player}
        pos={pos}
        isCaptain={player ? player.id === captainId : false}
        onOpen={() => openPicker(zone, pos, i)}
      />
    ))

  // Yedek yuvaları tek satırda, mevki sırasına göre
  const benchSlots = POS_ORDER.flatMap((pos) => renderRow('bench', pos))

  return (
    <div className="squad">
      <header className="squad-head">
        <div>
          <h1>Takımım</h1>
          <p className="page-sub">
            {user ? `${user.username}, kadronu kur.` : 'Kadronu kur ve dizilişini belirle.'}
          </p>
        </div>
        <div className="squad-controls">
          <label className="formation-field">
            <span>Diziliş</span>
            <select
              value={formation}
              onChange={(e) => changeFormation(e.target.value)}
              className="formation-select"
            >
              {Object.keys(FORMATIONS).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
          <div className="squad-summary">
            <div>
              <strong>{allPicked.length}</strong>
              <span>/ 15 oyuncu</span>
            </div>
            <div>
              <strong>{totalValue.toFixed(1)}</strong>
              <span>M değer</span>
            </div>
          </div>
        </div>
      </header>

      <div className="squad-pitch">
        <div className="field">
          <div className="field-line field-mid" />
          <div className="field-circle" />
          <div className="field-box field-box-top" />
          <div className="field-box field-box-bottom" />

          <div className="field-rows">
            {/* Üstten alta: forvet, orta saha, defans, kaleci */}
            <div className="squad-row">{renderRow('field', 'FW')}</div>
            <div className="squad-row">{renderRow('field', 'OS')}</div>
            <div className="squad-row">{renderRow('field', 'DF')}</div>
            <div className="squad-row">{renderRow('field', 'KL')}</div>
          </div>
        </div>

        <div className="bench">
          <span className="bench-label">Yedek Kulübesi</span>
          <div className="bench-row">{benchSlots}</div>
        </div>
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
