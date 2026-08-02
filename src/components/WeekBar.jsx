import { weekStatus } from '../lib/weeks.js'

// Yatay hafta bar'ı: aynı anda 3 hafta (seçili ortada), sol/sağ ok ile kaydırılır.
export default function WeekBar({ weeks, visible, selected, onSelect, now, loading }) {
  if (loading) {
    return (
      <div className="wk-bar">
        <div className="wk-loading">Haftalar yükleniyor…</div>
      </div>
    )
  }
  if (!visible.length) return null

  const rounds = visible.map((w) => w.round)
  const idx = rounds.indexOf(selected)
  // 3'lük pencere: seçili ortada
  const win = [rounds[idx - 1], rounds[idx], rounds[idx + 1]].filter((r) => r != null)

  return (
    <div className="wk-bar">
      <button
        type="button"
        className="wk-arrow"
        disabled={idx <= 0}
        onClick={() => onSelect(rounds[idx - 1])}
        aria-label="Önceki hafta"
      >
        ‹
      </button>

      <div className="wk-cells">
        {win.map((r) => {
          const w = weeks.find((x) => x.round === r)
          const st = weekStatus(w, now)
          const isSel = r === selected
          return (
            <button
              key={r}
              type="button"
              className={`wk-cell st-${st}${isSel ? ' sel' : ''}`}
              onClick={() => onSelect(r)}
            >
              <span className="wk-name">Week {r}</span>
              <span className="wk-status">
                {st === 'open' && (
                  <>
                    <span className="wk-dot" />
                    Transfer Aktif
                  </>
                )}
                {st === 'locked' && (
                  <>
                    <span className="wk-lock" aria-hidden="true">🔒</span>
                    Kilitli
                  </>
                )}
                {st === 'finished' && <span className="wk-pts">0 P</span>}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="wk-arrow"
        disabled={idx >= rounds.length - 1}
        onClick={() => onSelect(rounds[idx + 1])}
        aria-label="Sonraki hafta"
      >
        ›
      </button>
    </div>
  )
}
