import { useState } from 'react'
import PlayerPhoto from './PlayerPhoto.jsx'
import { clubShort } from '../lib/apiFootball.js'
import { POSITIONS } from '../lib/squadData.js'
import './PlayerDetailModal.css'

// Maçın başlamadığı sayılan durumlar
const NOT_STARTED = new Set(['NS', 'TBD', 'PST', 'CANC', 'ABD', 'AWD'])

// Mock puan kırılımı (gerçek istatistik entegrasyonu sonraki adım)
const MOCK_BREAKDOWN = [
  { stat: 'Oynadığı dakika', value: '90', pts: 2 },
  { stat: 'Gol', value: '1', pts: 4 },
  { stat: 'Asist', value: '1', pts: 3 },
  { stat: 'Sarı kart', value: '1', pts: -1 },
]
const MOCK_TOTAL = MOCK_BREAKDOWN.reduce((s, r) => s + r.pts, 0)

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  })
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })

export default function PlayerDetailModal({
  player,
  isStarter,
  isCaptain,
  locked,
  week,
  fixture,
  onMakeCaptain,
  onClearCaptain,
  onClose,
}) {
  const [open, setOpen] = useState(false)

  const posLabel = POSITIONS[player.pos]?.label || player.pos
  const status = fixture?.fixture?.status?.short
  const started = Boolean(status) && !NOT_STARTED.has(status)
  const home = fixture?.teams?.home
  const away = fixture?.teams?.away
  const homeScore = started ? fixture?.goals?.home ?? 0 : '-'
  const awayScore = started ? fixture?.goals?.away ?? 0 : '-'
  const date = fixture?.fixture?.date

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <div className="pdm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="pdm-close" onClick={onClose} aria-label="Kapat">
          ×
        </button>

        {/* Hero */}
        <div className="pdm-hero">
          <div className="pdm-hero-info">
            <div className="pdm-name">{player.name}</div>
            <div className="pdm-club">{player.club}</div>
            <div className="pdm-meta">
              <span>{posLabel}</span>
              <span className="pdm-sep" />
              <span>₺{player.price}M</span>
            </div>
          </div>
          <div className="pdm-photo">
            <PlayerPhoto id={player.id} name={player.name} bg={player.clubBg} fg={player.clubFg} />
          </div>
          <svg className="pdm-wave" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,42 C40,14 90,58 140,30 C170,14 190,34 200,24 L200,60 L0,60 Z" fill="rgba(255,255,255,0.14)" />
            <path d="M0,50 C50,28 100,62 160,38 C180,30 195,44 200,38 L200,60 L0,60 Z" fill="rgba(255,255,255,0.1)" />
          </svg>
        </div>

        {/* Maç bilgi barı */}
        <div className="pdm-matchbar">
          <strong>{week}. Hafta</strong>
          <span className="pdm-bar">|</span>
          {date ? fmtDate(date) : '—'}
          <span className="pdm-bar">|</span>
          {date ? fmtTime(date) : '—'}
        </div>

        {/* Skor satırı */}
        <div className="pdm-score">
          <span className="pdm-team">{home ? clubShort(home.name) : '—'}</span>
          <span className="pdm-scorebox">{homeScore}</span>
          <span className="pdm-scorebox">{awayScore}</span>
          <span className="pdm-team">{away ? clubShort(away.name) : '—'}</span>
        </div>

        {/* Puan toggle — yalnızca maç başladıysa */}
        {started && (
          <button className="pdm-toggle" onClick={() => setOpen((o) => !o)}>
            {MOCK_TOTAL} puan <span className="pdm-arrow">{open ? '▲' : '▼'}</span>
          </button>
        )}

        {/* Puan kırılım tablosu */}
        {started && open && (
          <table className="pdm-breakdown">
            <thead>
              <tr>
                <th>İstatistik</th>
                <th>Değer</th>
                <th>Puan</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_BREAKDOWN.map((r) => (
                <tr key={r.stat}>
                  <td>{r.stat}</td>
                  <td>{r.value}</td>
                  <td>{r.pts > 0 ? `+${r.pts}` : r.pts}</td>
                </tr>
              ))}
              <tr className="pdm-total">
                <td>Toplam</td>
                <td />
                <td>{MOCK_TOTAL}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Kaptan seçimi — yalnızca ilk 11 oyuncuları için */}
        {isStarter && (
          <button
            className={`pdm-captain${isCaptain ? ' active' : ''}`}
            disabled={locked}
            onClick={isCaptain ? onClearCaptain : onMakeCaptain}
          >
            {isCaptain ? 'Kaptanlığı Kaldır' : 'Kaptan Yap'}
          </button>
        )}
      </div>
    </div>
  )
}
