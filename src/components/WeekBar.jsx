import { weekStatus } from '../lib/weeks.js'
import './WeekBar.css'

// İnce kilit ikonu (deadline geçmiş haftalar)
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
)

// weekStatus (open/locked/finished) → görsel durum rozeti
function WeekStatus({ status }) {
  if (status === 'open')
    return (
      <span className="st st-active">
        <span className="wkdot" />
        Transfer Aktif
      </span>
    )
  if (status === 'locked')
    return (
      <span className="st st-locked">
        <LockIcon />
        Kilitli
      </span>
    )
  if (status === 'finished')
    // Puanlama sistemi netleşene kadar biten haftalar 0 P gösterir
    return <span className="st st-points">0 P</span>
  return <span className="st st-future">Henüz açılmadı</span>
}

// Yatay hafta bar'ı: aynı anda 3 hafta (seçili ortada), sol/sağ ok ile kaydırılır.
// Kenarda kalınca ortalama korunsun diye boş (görünmez) slotlar render edilir.
export default function WeekBar({ weeks, visible, selected, onSelect, now, loading }) {
  if (loading) {
    return (
      <div className="gwbar">
        <div className="gw-loading">Haftalar yükleniyor…</div>
      </div>
    )
  }
  if (!visible.length) return null

  const rounds = visible.map((w) => w.round)
  const idx = rounds.indexOf(selected)

  return (
    <div className="gwbar">
      <button
        type="button"
        className="gw-arrow"
        disabled={idx <= 0}
        onClick={() => onSelect(rounds[idx - 1])}
        aria-label="Önceki hafta"
      >
        ‹
      </button>

      <div className="gw-track">
        {[idx - 1, idx, idx + 1].map((i, slot) => {
          if (i < 0 || i >= rounds.length) return <div key={slot} className="gw-card empty" />
          const r = rounds[i]
          const w = weeks.find((x) => x.round === r)
          const st = weekStatus(w, now)
          return (
            <button
              key={slot}
              type="button"
              className={`gw-card${i === idx ? ' sel' : ''}`}
              onClick={() => onSelect(r)}
            >
              <span className="wk">HAFTA {r}</span>
              <WeekStatus status={st} />
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="gw-arrow"
        disabled={idx >= rounds.length - 1}
        onClick={() => onSelect(rounds[idx + 1])}
        aria-label="Sonraki hafta"
      >
        ›
      </button>
    </div>
  )
}
