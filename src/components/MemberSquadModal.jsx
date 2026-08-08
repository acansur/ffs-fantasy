// Bir kullanıcının verilen haftadaki kadrosunu SALT OKUNUR gösterir (fikstür yok).
// Lig sıralamasında kullanıcı adına tıklayınca açılır.

import { useEffect, useState } from 'react'
import { loadSquadFromDb } from '../lib/squadDb.js'
import { loadCachedPlayers } from '../lib/dataCache.js'
import { rebuildRoster } from '../lib/squadStore.jsx'
import './MemberSquadModal.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const POS_LABEL = { KL: 'Kaleci', DF: 'Defans', OS: 'Orta Saha', FW: 'Forvet' }

export default function MemberSquadModal({ userId, username, week, onClose }) {
  const [state, setState] = useState({ loading: true, roster: null, captainId: null, error: '' })

  useEffect(() => {
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

  return (
    <div className="msq-overlay" onClick={onClose}>
      <div className="msq" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="msq-close" onClick={onClose} aria-label="Kapat">×</button>
        <div className="msq-head">
          <div className="msq-name">{username} · Kadro</div>
          <div className="msq-sub">Son deadline'ı gelmiş haftanın kadrosu · salt okunur</div>
        </div>

        {loading ? (
          <div className="msq-note">Yükleniyor…</div>
        ) : error ? (
          <div className="msq-note">{error}</div>
        ) : (
          <div className="msq-body">
            {POS_ORDER.map((pos) => {
              const starters = (roster[pos] || []).filter((s) => s.starter && s.player)
              const bench = (roster[pos] || []).filter((s) => !s.starter && s.player)
              return (
                <div key={pos} className="msq-line">
                  <div className="msq-line-lbl">{POS_LABEL[pos]}</div>
                  <div className="msq-players">
                    {starters.map((s) => (
                      <span key={s.player.id} className={`msq-pl pos-${pos}${s.player.id === captainId ? ' cap' : ''}`}>
                        {s.player.name}
                        {s.player.id === captainId && <span className="msq-c">C</span>}
                      </span>
                    ))}
                    {bench.map((s) => (
                      <span key={s.player.id} className={`msq-pl pos-${pos} bench`}>{s.player.name}</span>
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="msq-legend">İlk 11 · <span className="dim">soluk = yedek</span> · <b>C</b> = kaptan</div>
          </div>
        )}
      </div>
    </div>
  )
}
