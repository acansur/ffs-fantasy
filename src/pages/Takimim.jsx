import { useMemo, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import PlayerPickerModal from '../components/PlayerPickerModal.jsx'
import {
  POSITIONS,
  CLUBS,
  FORMATIONS,
  DEFAULT_FORMATION,
  BENCH_SIZE,
  initials,
} from '../lib/squadData.js'

// Satır anahtarı → mevki kodu eşlemesi
const LINE_POS = { gk: 'KL', def: 'DF', mid: 'OS', fwd: 'FW' } // bench → null (tüm mevkiler)

function makeSquad(formation) {
  const f = FORMATIONS[formation]
  return {
    gk: null,
    def: Array(f.DF).fill(null),
    mid: Array(f.OS).fill(null),
    fwd: Array(f.FW).fill(null),
    bench: Array(BENCH_SIZE).fill(null),
  }
}

// Diziliş değişince mevcut seçimleri koru (satırı kırp/doldur)
function resizeLine(arr, n) {
  const next = arr.slice(0, n)
  while (next.length < n) next.push(null)
  return next
}

// Tek bir oyuncu yuvası
function Slot({ player, pos, isCaptain, onOpen, onToggleCaptain }) {
  const meta = POSITIONS[pos] // yedek için POSITIONS[null] undefined olabilir → aşağıda korunuyor

  if (!player) {
    return (
      <button
        type="button"
        className="slot slot-empty"
        style={meta ? { '--pos-color': meta.color } : undefined}
        onClick={onOpen}
      >
        <span className="slot-jersey empty">{pos ?? '＋'}</span>
        <span className="slot-name muted">{meta ? meta.label : 'Yedek'}</span>
      </button>
    )
  }

  const club = CLUBS[player.club]
  return (
    <div className="slot slot-filled">
      <button type="button" className="slot-jersey-btn" onClick={onOpen} title="Değiştir">
        <span className="slot-jersey" style={{ background: club.bg, color: club.fg }}>
          {initials(player.name)}
        </span>
      </button>
      <button
        type="button"
        className={`cap-btn${isCaptain ? ' active' : ''}`}
        onClick={onToggleCaptain}
        title={isCaptain ? 'Kaptanlığı kaldır' : 'Kaptan yap'}
      >
        C
      </button>
      <span className="slot-name" style={{ background: club.bg, color: club.fg }}>
        {player.name.split(' ').slice(-1)[0]}
      </span>
    </div>
  )
}

export default function Takimim() {
  const { user } = useAuth()
  const [formation, setFormation] = useState(DEFAULT_FORMATION)
  const [squad, setSquad] = useState(() => makeSquad(DEFAULT_FORMATION))
  const [captainId, setCaptainId] = useState(null)
  const [picker, setPicker] = useState(null) // { line, index } | null

  const changeFormation = (next) => {
    setFormation(next)
    const f = FORMATIONS[next]
    setSquad((s) => ({
      ...s,
      def: resizeLine(s.def, f.DF),
      mid: resizeLine(s.mid, f.OS),
      fwd: resizeLine(s.fwd, f.FW),
    }))
  }

  // Kadrodaki tüm oyuncular ve id'leri
  const allPicked = useMemo(() => {
    const list = [squad.gk, ...squad.def, ...squad.mid, ...squad.fwd, ...squad.bench].filter(Boolean)
    return list
  }, [squad])
  const takenIds = useMemo(() => new Set(allPicked.map((p) => p.id)), [allPicked])

  const totalValue = allPicked.reduce((sum, p) => sum + p.price, 0)

  const openPicker = (line, index) => setPicker({ line, index })
  const closePicker = () => setPicker(null)

  const assignPlayer = (playerOrNull) => {
    if (!picker) return
    const { line, index } = picker
    setSquad((s) => {
      if (line === 'gk') return { ...s, gk: playerOrNull }
      const arr = [...s[line]]
      arr[index] = playerOrNull
      return { ...s, [line]: arr }
    })
    // boşaltılan oyuncu kaptan idiyse kaptanlığı düşür
    if (!playerOrNull) {
      const removed = picker.line === 'gk' ? squad.gk : squad[picker.line][picker.index]
      if (removed && removed.id === captainId) setCaptainId(null)
    }
    closePicker()
  }

  const toggleCaptain = (playerId) => {
    setCaptainId((cur) => (cur === playerId ? null : playerId))
  }

  // Aktif picker için mevki ve mevcut oyuncu
  const pickerPos = picker ? (picker.line === 'bench' ? null : LINE_POS[picker.line]) : null
  const pickerCurrent = picker
    ? picker.line === 'gk'
      ? squad.gk
      : squad[picker.line][picker.index]
    : null

  const renderLine = (line, pos) =>
    squad[line].map((player, i) => (
      <Slot
        key={`${line}-${i}`}
        player={player}
        pos={pos}
        isCaptain={player ? player.id === captainId : false}
        onOpen={() => openPicker(line, i)}
        onToggleCaptain={() => player && toggleCaptain(player.id)}
      />
    ))

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
              <span>/ 11+4</span>
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
            <div className="squad-row">{renderLine('fwd', 'FW')}</div>
            <div className="squad-row">{renderLine('mid', 'OS')}</div>
            <div className="squad-row">{renderLine('def', 'DF')}</div>
            <div className="squad-row">
              <Slot
                player={squad.gk}
                pos="KL"
                isCaptain={squad.gk ? squad.gk.id === captainId : false}
                onOpen={() => openPicker('gk', 0)}
                onToggleCaptain={() => squad.gk && toggleCaptain(squad.gk.id)}
              />
            </div>
          </div>
        </div>

        <div className="bench">
          <span className="bench-label">Yedek Kulübesi</span>
          <div className="bench-row">{renderLine('bench', null)}</div>
        </div>
      </div>

      {picker && (
        <PlayerPickerModal
          allowedPos={pickerPos}
          takenIds={takenIds}
          currentId={pickerCurrent ? pickerCurrent.id : null}
          onSelect={(p) => assignPlayer(p)}
          onClear={() => assignPlayer(null)}
          onClose={closePicker}
        />
      )}
    </div>
  )
}
