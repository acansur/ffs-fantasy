import { useState, useEffect } from 'react'
import PlayerPhoto from './PlayerPhoto.jsx'
import { clubShort, fetchPlayerFullName } from '../lib/apiFootball.js'
import { getTeamFixture } from '../lib/weeks.js'
import { POSITIONS } from '../lib/squadData.js'
import './PlayerDetailModal.css'

// Maçın başlamadığı sayılan durumlar
const NOT_STARTED = new Set(['NS', 'TBD', 'PST', 'CANC', 'ABD', 'AWD'])

// Pozisyon → hero bandı renk sınıfı
const POS_HEAD = { KL: 'pos-gk', DF: 'pos-def', OS: 'pos-mid', FW: 'pos-fwd' }

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
  onMoveToBench,
  onMoveToStarter,
  onClose,
  variant = 'full', // 'full' (Takımım) | 'info' (Transfer — salt görüntüleme, aksiyon yok)
  weeks = [],
  fixtures = [], // info görünümünde haftalık rakip için
}) {
  const isInfo = variant === 'info'
  const [open, setOpen] = useState(false)

  // Hero'da tam ad göster: players/squads kısaltılmış ad döndüğü için
  // (örn. "D. Alemdar") tam adı players/profiles'tan çekip günceleriz.
  const [full, setFull] = useState(null) // { id, name }
  useEffect(() => {
    let alive = true
    fetchPlayerFullName(player.id).then((n) => {
      if (alive && n) setFull({ id: player.id, name: n })
    })
    return () => {
      alive = false
    }
  }, [player.id])
  const displayName = full && full.id === player.id ? full.name : player.name

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
        <div className={`pdm-hero ${POS_HEAD[player.pos] || 'pos-mid'}`}>
          <div className="pdm-hero-info">
            <div className="pdm-name">{displayName}</div>
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

        {/* Skor satırı — tam görünüm */}
        {!isInfo && (
          <div className="pdm-score">
            <span className="pdm-team">{home ? clubShort(home.name) : '—'}</span>
            <span className="pdm-scorebox">{homeScore}</span>
            <span className="pdm-scorebox">{awayScore}</span>
            <span className="pdm-team">{away ? clubShort(away.name) : '—'}</span>
          </div>
        )}

        {/* Müsabaka satırı — info görünümü (skor kutusu yok) */}
        {isInfo && (
          <div className="pdm-fixture">
            {home && away ? (
              <>
                <span>{home.name}</span>
                <span className="pdm-vs">vs</span>
                <span>{away.name}</span>
              </>
            ) : (
              <span className="pdm-vs">Bu hafta maç yok</span>
            )}
          </div>
        )}

        {/* Puan toggle — yalnızca maç başladıysa (tam görünüm) */}
        {!isInfo && started && (
          <button className="pdm-toggle" onClick={() => setOpen((o) => !o)}>
            {MOCK_TOTAL} puan <span className="pdm-arrow">{open ? '▲' : '▼'}</span>
          </button>
        )}

        {/* Puan kırılım tablosu (tam görünüm) */}
        {!isInfo && started && open && (
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

        {/* Info görünümü: haftalık rakip + puan tablosu (puan şimdilik "—") */}
        {isInfo && (
          <table className="pdm-breakdown pdm-weekly">
            <thead>
              <tr>
                <th>Hafta</th>
                <th>Rakip</th>
                <th>Puan</th>
              </tr>
            </thead>
            <tbody>
              {weeks.length === 0 ? (
                <tr>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              ) : (
                weeks.map((w) => {
                  const fx = getTeamFixture(fixtures, player.club, w.round)
                  const h = fx?.teams?.home
                  const a = fx?.teams?.away
                  const isHome = h?.name === player.club
                  const opp = fx ? (isHome ? a?.name : h?.name) : null
                  return (
                    <tr key={w.round}>
                      <td>{w.round}. Hafta</td>
                      <td className="pdm-opp">
                        {opp ? (
                          <>
                            <span className="pdm-ha">{isHome ? 'E' : 'D'}</span> {opp}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>—</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}

        {/* Aksiyonlar: kaptan + yer değiştirme (info görünümünde gizli) */}
        {!isInfo && (
          <div className="pdm-actions">
            {isStarter && (
              <button
                className={`pdm-captain${isCaptain ? ' active' : ''}`}
                disabled={locked}
                onClick={isCaptain ? onClearCaptain : onMakeCaptain}
              >
                {isCaptain ? 'Kaptanlığı Kaldır' : 'Kaptan Yap'}
              </button>
            )}
            {isStarter ? (
              <button className="pdm-move" disabled={locked} onClick={onMoveToBench}>
                Yedeğe Al
              </button>
            ) : (
              <button className="pdm-move" disabled={locked} onClick={onMoveToStarter}>
                İlk 11'e Al
              </button>
            )}
          </div>
        )}

        {/* Info görünümünde alt boşluk */}
        {isInfo && <div className="pdm-info-foot" />}
      </div>
    </div>
  )
}
