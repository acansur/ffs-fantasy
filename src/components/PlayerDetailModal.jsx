import { useState, useEffect } from 'react'
import PlayerPhoto from './PlayerPhoto.jsx'
import { clubShort, fetchPlayerFullName } from '../lib/apiFootball.js'
import { getTeamFixture } from '../lib/weeks.js'
import { POSITIONS } from '../lib/squadData.js'
import './PlayerDetailModal.css'

// Maçın başlamadığı sayılan durumlar
const NOT_STARTED = new Set(['NS', 'TBD', 'PST', 'CANC', 'ABD', 'AWD'])
// Maçın bittiği (puanların kesinleştiği) durumlar
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])

// Pozisyon → hero bandı renk sınıfı
const POS_HEAD = { KL: 'pos-gk', DF: 'pos-def', OS: 'pos-mid', FW: 'pos-fwd' }

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
  hideActions = false, // kaptan/yedek butonlarını gizle (örn. UEL kilitli görünüm)
  breakdown = null, // gerçek puan kırılımı [{ stat, value, pts }] (yalnızca maç bittiyse)
}) {
  const isInfo = variant === 'info'
  const bd = breakdown || []
  const bdTotal = bd.reduce((s, r) => s + r.pts, 0)
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
  const isFinished = FINISHED.has(status) // FT/AET/PEN/WO → puanlar kesin
  const inPlay = started && !isFinished // LIVE/1H/2H/HT/ET → maç sürüyor
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
          {week != null && (
            <>
              <strong>{week}. Hafta</strong>
              <span className="pdm-bar">|</span>
            </>
          )}
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

        {/* Maç devam ediyor (LIVE/1H/2H/HT/ET) — puanlar henüz kesin değil */}
        {!isInfo && inPlay && (
          <div className="pdm-live-note">Maç devam ediyor</div>
        )}

        {/* Puan toggle — yalnızca maç BİTTİYSE (FT), gerçek verilerden */}
        {!isInfo && isFinished && (
          <button className="pdm-toggle" onClick={() => setOpen((o) => !o)}>
            {bdTotal} puan <span className="pdm-arrow">{open ? '▲' : '▼'}</span>
          </button>
        )}

        {/* Puan kırılım tablosu — gerçek istatistiklerden (maç bittiyse) */}
        {!isInfo && isFinished && open && (
          <table className="pdm-breakdown">
            <thead>
              <tr>
                <th>İstatistik</th>
                <th>Değer</th>
                <th>Puan</th>
              </tr>
            </thead>
            <tbody>
              {bd.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: '#9aa9c6' }}>Puan kaydı yok</td>
                </tr>
              ) : (
                bd.map((r, i) => (
                  <tr key={r.stat + i}>
                    <td>{r.stat}</td>
                    <td>{r.value}</td>
                    <td>{r.pts > 0 ? `+${r.pts}` : r.pts}</td>
                  </tr>
                ))
              )}
              <tr className="pdm-total">
                <td>Toplam</td>
                <td />
                <td>{bdTotal}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Info görünümü (Transfer): haftalık rakip + puan tablosu */}
        {isInfo && <WeeklyPointsTable weeks={weeks} fixtures={fixtures} playerClub={player.club} />}

        {/* Aksiyonlar: kaptan + yer değiştirme (info görünümünde / hideActions ile gizli) */}
        {!isInfo && !hideActions && (
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

        {/* Geçmiş hafta puanları (Takımım, deadline öncesi) — aksiyon butonlarının
            ALTINDA; Transfer info tablosuyla birebir aynı. Puanlar sezon başlayınca dolar. */}
        {!isInfo && !hideActions && !locked && (
          <WeeklyPointsTable weeks={weeks} fixtures={fixtures} playerClub={player.club} />
        )}

        {/* Info görünümünde alt boşluk */}
        {isInfo && <div className="pdm-info-foot" />}
      </div>
    </div>
  )
}

// Geçmiş hafta puanları tablosu (Hafta | Rakip | Puan). Puan verisi gelene kadar
// "—" gösterilir. Transfer info kartı ile Takımım detay modalı ORTAK kullanır.
function WeeklyPointsTable({ weeks = [], fixtures = [], playerClub }) {
  return (
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
            const fx = getTeamFixture(fixtures, playerClub, w.round)
            const h = fx?.teams?.home
            const a = fx?.teams?.away
            const isHome = h?.name === playerClub
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
  )
}
