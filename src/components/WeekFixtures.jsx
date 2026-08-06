// Saha görünümünün altında o haftanın fikstürü (Takımım/Transfer + PL test).
// Maçlar gün gün gruplandırılır; her maçta ev sahibi — skor — deplasman + saat.
// Durum: başlamadı → saat + "-"; canlı → anlık skor (CANLI); bitti → final skor.

import { useMemo } from 'react'
import './WeekFixtures.css'

const roundNo = (r) => Number(String(r).match(/\d+/)?.[0] ?? 0)
const NOT_STARTED = new Set(['NS', 'TBD', 'PST', 'CANC', 'ABD', 'AWD'])
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' })
// Gün anahtarı (Türkiye günü) — YYYY-MM-DD
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })

export default function WeekFixtures({ fixtures, round }) {
  const days = useMemo(() => {
    const wk = (fixtures || [])
      .filter((f) => roundNo(f.league?.round) === round && f.fixture?.date)
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
    const groups = new Map()
    for (const f of wk) {
      const k = dayKey(f.fixture.date)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(f)
    }
    return [...groups.entries()] // zaten tarihe göre sıralı
  }, [fixtures, round])

  if (!days.length) return null

  return (
    <div className="wf">
      <div className="wf-head">Bu Haftanın Maçları</div>
      {days.map(([key, list]) => (
        <div className="wf-day" key={key}>
          <div className="wf-daylabel">{fmtDay(list[0].fixture.date)}</div>
          <div className="wf-matches">
            {list.map((f) => (
              <FixtureRow key={f.fixture.id} f={f} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FixtureRow({ f }) {
  const status = f.fixture?.status?.short
  const started = Boolean(status) && !NOT_STARTED.has(status)
  const finished = FINISHED.has(status)
  const live = started && !finished
  const home = f.teams?.home?.name || '—'
  const away = f.teams?.away?.name || '—'
  const hs = started ? f.goals?.home ?? 0 : null
  const as = started ? f.goals?.away ?? 0 : null
  const elapsed = f.fixture?.status?.elapsed

  return (
    <div className={`wf-row${live ? ' live' : ''}`}>
      <span className="wf-team home">{home}</span>
      <div className="wf-mid">
        <div className="wf-score">
          {started ? (
            <>
              {hs}
              <i>-</i>
              {as}
            </>
          ) : (
            <span className="wf-nostart">-</span>
          )}
        </div>
        <div className="wf-status">
          {!started && <span className="wf-time">{fmtTime(f.fixture.date)}</span>}
          {live && <span className="wf-live">CANLI{elapsed != null ? ` ${elapsed}'` : ''}</span>}
          {finished && <span className="wf-ft">Bitti</span>}
        </div>
      </div>
      <span className="wf-team away">{away}</span>
    </div>
  )
}
