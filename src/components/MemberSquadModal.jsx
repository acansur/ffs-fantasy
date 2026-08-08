// Bir kullanıcının verilen haftadaki kadrosunu "Takımım" saha görünümüyle SALT
// OKUNUR gösterir (formasyonda oyuncu kartları). Fikstür/aksiyon YOK.
// Lig sıralamasında kullanıcı adına tıklayınca açılır.

import { useEffect, useState } from 'react'
import PlayerPhoto from './PlayerPhoto.jsx'
import { loadSquadFromDb } from '../lib/squadDb.js'
import { loadCachedPlayers } from '../lib/dataCache.js'
import { rebuildRoster } from '../lib/squadStore.jsx'
import './MemberSquadModal.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const shortName = (n) => {
  const parts = (n || '').trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : (n || '')
}

function PitchCard({ slot, pos, isCaptain, bench }) {
  const p = slot.player
  return (
    <div className={`msq-card pos-${pos}${bench ? ' bench' : ''}`}>
      {isCaptain && <span className="msq-capc">C</span>}
      <span className="msq-ava">
        <PlayerPhoto id={p.id} name={p.name} bg={p.clubBg} fg={p.clubFg} />
      </span>
      <span className="msq-nm">{shortName(p.name)}</span>
    </div>
  )
}

export default function MemberSquadModal({ userId, username, week, onClose }) {
  const [state, setState] = useState({ loading: true, roster: null, captainId: null, error: '' })

  useEffect(() => {
    // Deadline'ı geçmiş (oynanmış) hafta yoksa kadro da yoktur → bilgi göster.
    if (week == null) {
      setState({ loading: false, roster: null, captainId: null, error: 'Henüz oynanmış hafta yok — kadrolar ilk hafta deadline\'ından sonra görünür.' })
      return
    }
    let alive = true
    ;(async () => {
      try {
        const [loaded, raw] = await Promise.all([
          loadSquadFromDb({ userId, week }),
          loadCachedPlayers().catch(() => null),
        ])
        if (!alive) return
        if (!loaded || !raw) {
          setState({ loading: false, roster: null, captainId: null, error: 'Bu haftaya ait kadro bulunamadı.' })
          return
        }
        const byId = Object.fromEntries(raw.players.map((p) => [String(p.id), p]))
        const roster = rebuildRoster(loaded.rows, byId)
        setState({ loading: false, roster, captainId: loaded.captainId ?? null, error: '' })
      } catch (e) {
        if (alive) setState({ loading: false, roster: null, captainId: null, error: e.message || 'Hata' })
      }
    })()
    return () => { alive = false }
  }, [userId, week])

  const { loading, roster, captainId, error } = state

  // İlk 11 mevkiye göre (FW üstte → KL altta) + yedekler (benchOrder'a göre)
  const starters = (pos) => (roster?.[pos] || []).filter((s) => s.starter && s.player)
  const bench = roster
    ? POS_ORDER.flatMap((pos) => (roster[pos] || []).filter((s) => !s.starter && s.player).map((s) => ({ ...s, pos })))
        .sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99))
    : []

  return (
    <div className="msq-overlay" onClick={onClose}>
      <div className="msq" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="msq-close" onClick={onClose} aria-label="Kapat">×</button>
        <div className="msq-head">
          <div className="msq-name">{username}</div>
          <div className="msq-sub">{week != null ? `Hafta ${week} kadrosu · salt okunur` : 'Salt okunur'}</div>
        </div>

        {loading ? (
          <div className="msq-note">Yükleniyor…</div>
        ) : error ? (
          <div className="msq-note">{error}</div>
        ) : (
          <>
            <div className="msq-pitch">
              <div className="msq-lines" aria-hidden="true">
                <span className="msq-halfway" /><span className="msq-circle" />
                <span className="msq-box top" /><span className="msq-box bot" />
              </div>
              <div className="msq-rows">
                {['FW', 'OS', 'DF', 'KL'].map((pos) => (
                  <div key={pos} className="msq-row">
                    {starters(pos).map((s) => (
                      <PitchCard key={s.player.id} slot={s} pos={pos} isCaptain={s.player.id === captainId} />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="msq-benchbar"><span>Yedekler</span></div>
            <div className="msq-bench">
              {bench.map((s) => (
                <PitchCard key={s.player.id} slot={s} pos={s.pos} isCaptain={s.player.id === captainId} bench />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
