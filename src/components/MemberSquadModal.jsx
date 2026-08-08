// Bir kullanıcının verilen haftadaki kadrosunu "Takımım" saha görünümüyle SALT
// OKUNUR gösterir — sahibinin deadline sonrası gördüğüyle AYNI: formasyon,
// oyuncu PUANLARI, otomatik yedek uygulanmış diziliş, kaptan. Fikstür/aksiyon YOK.
// Puanlar Takımım ile ORTAK mantıktan gelir (computeWeekScores + applyAutoSubs).

import { useEffect, useState } from 'react'
import PlayerPhoto from './PlayerPhoto.jsx'
import { loadSquadFromDb } from '../lib/squadDb.js'
import { loadCachedPlayers, loadCachedFixtures } from '../lib/dataCache.js'
import { rebuildRoster, rosterPlayers } from '../lib/squadStore.jsx'
import { computeWeekScores, applyAutoSubs } from '../lib/weekScores.js'
import { getLiveScoresByFixtures } from '../lib/liveScoresDb.js'
import './MemberSquadModal.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const roundNo = (r) => Number(String(r).match(/\d+/)?.[0] ?? 0)
const shortName = (n) => {
  const parts = (n || '').trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : (n || '')
}

const POS_LABEL = { KL: 'KL', DF: 'DF', OS: 'OS', FW: 'FW' }

function PitchCard({ entry, pos, captainId, startedById, bench }) {
  const p = entry.player
  if (!p) return null
  const started = startedById?.get(p.id)
  return (
    <div className={`msq-card pos-${pos}${bench ? ' bench' : ''}`}>
      {bench && <span className="msq-tag">{POS_LABEL[pos]}</span>}
      {p.id === captainId && <span className="msq-capc">C</span>}
      {entry.subIn && <span className="msq-sub in" title="Yedekten girdi">↑</span>}
      {entry.subOut && <span className="msq-sub out" title="Sahadan çıktı">↓</span>}
      <span className="msq-ava">
        <PlayerPhoto id={p.id} name={p.name} bg={p.clubBg} fg={p.clubFg} />
      </span>
      <span className="msq-plate">
        <span className="msq-nm">{shortName(p.name)}</span>
        <span className="msq-meta">
          <span className="msq-club">{p.clubShort || ''}</span>
          <span className="msq-pts">{started ? (entry.pts ?? 0) : '–'}</span>
        </span>
      </span>
    </div>
  )
}

export default function MemberSquadModal({ userId, username, week, onClose }) {
  const [st, setSt] = useState({ loading: true, field: null, bench: [], captainId: null, startedById: null, error: '' })

  useEffect(() => {
    if (week == null) {
      setSt({ loading: false, field: null, bench: [], captainId: null, startedById: null, error: 'Henüz oynanmış hafta yok — kadrolar ilk hafta deadline\'ından sonra görünür.' })
      return
    }
    let alive = true
    ;(async () => {
      try {
        const [loaded, raw, fxRes] = await Promise.all([
          loadSquadFromDb({ userId, week }),
          loadCachedPlayers().catch(() => null),
          loadCachedFixtures().catch(() => null),
        ])
        if (!alive) return
        if (!loaded || !raw) {
          setSt({ loading: false, field: null, bench: [], captainId: null, startedById: null, error: 'Bu haftaya ait kadro bulunamadı.' })
          return
        }
        const byId = Object.fromEntries(raw.players.map((p) => [String(p.id), p]))
        const roster = rebuildRoster(loaded.rows, byId)
        const rosterList = rosterPlayers(roster)
        const captainId0 = loaded.captainId ?? null

        // O haftanın puanları — Takımım ile aynı: live_scores'tan.
        const fixtures = fxRes?.fixtures || []
        const weekIds = fixtures.filter((f) => roundNo(f.league?.round) === week && f.fixture?.id).map((f) => f.fixture.id)
        const liveMap = weekIds.length ? await getLiveScoresByFixtures(weekIds) : new Map()
        if (!alive) return
        const sc = await computeWeekScores(rosterList, week, fixtures, liveMap)

        // Saha + yedek düzeni; hafta tamamen bitmişse otomatik yedek uygula.
        const fieldByPos = {}
        for (const pos of POS_ORDER) fieldByPos[pos] = roster[pos].map((slot, index) => ({ slot, pos, index })).filter((e) => e.slot.starter)
        const benchEntries = []
        for (const pos of POS_ORDER) roster[pos].forEach((slot, index) => { if (!slot.starter) benchEntries.push({ slot, pos, index }) })
        benchEntries.sort((a, b) => (a.slot.benchOrder ?? 99) - (b.slot.benchOrder ?? 99))
        const weekAllFinished = rosterList.length > 0 && rosterList.every((p) => sc.finishedById.get(p.id))
        const disp = applyAutoSubs({ fieldByPos, benchEntries, ptsById: sc.ptsById, finishedById: sc.finishedById, apply: weekAllFinished, captainId: captainId0 })

        if (alive) setSt({ loading: false, field: disp.field, bench: disp.bench, captainId: disp.captainId, startedById: sc.startedById, error: '' })
      } catch (e) {
        if (alive) setSt({ loading: false, field: null, bench: [], captainId: null, startedById: null, error: e.message || 'Hata' })
      }
    })()
    return () => { alive = false }
  }, [userId, week])

  const { loading, field, bench, captainId, startedById, error } = st

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
                    {(field[pos] || []).map((e) => (
                      <PitchCard key={e.player?.id ?? e.index} entry={e} pos={pos} captainId={captainId} startedById={startedById} />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="msq-benchbar"><span>Yedekler</span></div>
            <div className="msq-bench">
              {bench.filter((e) => e.player).map((e) => (
                <PitchCard key={e.player.id} entry={e} pos={e.pos} captainId={captainId} startedById={startedById} bench />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
