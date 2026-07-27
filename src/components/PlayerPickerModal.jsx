import { useMemo, useState } from 'react'
import {
  PLAYERS,
  CLUBS,
  POSITIONS,
  SORT_OPTIONS,
  sortPlayers,
  initials,
} from '../lib/squadData.js'

// Oyuncu seçim popup'ı.
// - Arka plan silikleşir ama kaybolmaz (overlay + blur).
// - Kulüp filtresi çoklu seçim (details/summary dropdown).
// - Sıralama dropdown (puan/fiyat, azalan/artan).
export default function PlayerPickerModal({
  allowedPos, // 'KL' | 'DF' | 'OS' | 'FW'
  takenIds, // başka yuvalarda seçili oyuncu id'leri (devre dışı)
  currentId, // bu yuvadaki oyuncunun id'si (varsa)
  isCaptain, // bu yuvadaki oyuncu kaptan mı
  onSelect,
  onClear,
  onMakeCaptain,
  onClose,
}) {
  const [selectedClubs, setSelectedClubs] = useState([]) // boş = tümü
  const [sortKey, setSortKey] = useState('points-desc')

  const title = allowedPos ? POSITIONS[allowedPos].label : 'Yedek Oyuncu'

  const toggleClub = (code) => {
    setSelectedClubs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const players = useMemo(() => {
    let list = PLAYERS
    if (allowedPos) list = list.filter((p) => p.pos === allowedPos)
    if (selectedClubs.length > 0) list = list.filter((p) => selectedClubs.includes(p.club))
    return sortPlayers(list, sortKey)
  }, [allowedPos, selectedClubs, sortKey])

  const clubLabel =
    selectedClubs.length === 0
      ? 'Tüm kulüpler'
      : `${selectedClubs.length} kulüp seçili`

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title} Seç</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        <div className="modal-controls">
          <details className="dropdown">
            <summary>{clubLabel}</summary>
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
              {selectedClubs.length > 0 && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setSelectedClubs([])}
                >
                  Filtreyi temizle
                </button>
              )}
            </div>
          </details>

          <select
            className="sort-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            aria-label="Sıralama"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>

        {currentId && (
          <div className="modal-actions">
            <button
              type="button"
              className={`btn btn-sm btn-captain${isCaptain ? ' active' : ''}`}
              onClick={onMakeCaptain}
            >
              {isCaptain ? '✓ Kaptan (kaldır)' : 'Kaptan yap'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
              Bu yuvayı boşalt
            </button>
          </div>
        )}

        <ul className="player-list">
          {players.map((p) => {
            const club = CLUBS[p.club]
            const taken = takenIds.has(p.id) && p.id !== currentId
            const isCurrent = p.id === currentId
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`player-row${isCurrent ? ' current' : ''}`}
                  disabled={taken}
                  onClick={() => onSelect(p)}
                >
                  <span
                    className="player-jersey"
                    style={{ background: club.bg, color: club.fg }}
                  >
                    {initials(p.name)}
                  </span>
                  <span className="player-meta">
                    <span className="player-name">{p.name}</span>
                    <span className="player-club">
                      {club.name}
                      {taken && ' • kadroda'}
                    </span>
                  </span>
                  <span className="player-stats">
                    <span className="player-points">{p.points} P</span>
                    <span className="player-price">{p.price.toFixed(1)} M</span>
                  </span>
                </button>
              </li>
            )
          })}
          {players.length === 0 && (
            <li className="player-empty">Seçilen filtreye uygun oyuncu yok.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
