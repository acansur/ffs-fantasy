// Saha görünümünün altında o haftanın fikstürü — timeline görünüm.
// Durum (başlamadı/canlı/bitti), skor, dakika MEVCUT veriden (fixtures) okunur;
// veri çekme/polling/hesap koduna dokunulmaz — burası yalnızca görsel katmandır.
// Transfer: preMatchOnly → yalnızca saat (o sayfa deadline'da kapandığından
// canlı/biten durumuna hiç ulaşmaz).

import { useMemo } from 'react'
import { normalizeText } from '../lib/normalize.js'
import './WeekFixtures.css'

const roundNo = (r) => Number(String(r).match(/\d+/)?.[0] ?? 0)
const NOT_STARTED = new Set(['NS', 'TBD', 'PST', 'CANC', 'ABD', 'AWD'])
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])
const isLive = (f) => {
  const s = f.fixture?.status?.short
  return Boolean(s) && !NOT_STARTED.has(s) && !FINISHED.has(s)
}

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' })
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })

// Takım forma renkleri — kart şeridi + isim yanı çubuğu için (isimle eşle).
const TEAM_COLORS = {
  Galatasaray: '#e11a2c',
  'Çorum FK': '#c0392b',
  Konyaspor: '#0a9a4a',
  Rizespor: '#0a8a46',
  Kasımpaşa: '#1e4c8f',
  Trabzonspor: '#8a2547',
  'Gençlerbirliği S.K.': '#c81430',
  Fenerbahçe: '#15468f',
  'Gaziantep FK': '#c01324',
  Alanyaspor: '#ef8320',
  Başakşehir: '#254a86',
  Kocaelispor: '#0a8a4a',
  Beşiktaş: '#40464e',
  Eyüpspor: '#8a244a',
  Amed: '#0a9a4a',
  'Erzurumspor FK': '#1e6ec0',
  Samsunspor: '#e01a2c',
  Göztepe: '#e01a10',
}
// Ad varyantları için normalize edilmiş eşleşme (ör. "Çaykur Rizespor" → Rizespor)
const _NORM_COLORS = Object.entries(TEAM_COLORS).map(([k, c]) => [
  normalizeText(k.replace(/\b(FK|S\.?K\.?)\b/gi, '').trim()),
  c,
])
function teamColor(name) {
  if (!name) return '#888'
  if (TEAM_COLORS[name]) return TEAM_COLORS[name]
  const n = normalizeText(name)
  for (const [kn, c] of _NORM_COLORS) {
    if (kn && (n.includes(kn) || kn.includes(n))) return c
  }
  return '#888'
}

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export default function WeekFixtures({ fixtures, round, preMatchOnly = false }) {
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
    return [...groups.entries()]
  }, [fixtures, round])

  if (!days.length) return null

  return (
    <div className="wfx-wrap">
      <div className="wfx-head">
        <span className="ttl">
          Bu Haftanın <b>Maçları</b>
        </span>
        <span className="wk">Hafta {round}</span>
      </div>
      {days.map(([key, list]) => {
        const hasLive = !preMatchOnly && list.some(isLive)
        return (
          <div key={key} className={`wfx-day${hasLive ? ' hasLive' : ''}`}>
            <span className="wfx-node" />
            <div className="wfx-date">{fmtDay(list[0].fixture.date)}</div>
            <div className="wfx-list">
              {list.map((f) => (
                <FxMatch key={f.fixture.id} f={f} preMatchOnly={preMatchOnly} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FxMatch({ f, preMatchOnly }) {
  const status = f.fixture?.status?.short
  const started = Boolean(status) && !NOT_STARTED.has(status)
  const finished = FINISHED.has(status)
  const live = !preMatchOnly && started && !finished
  const done = !preMatchOnly && finished
  const home = f.teams?.home?.name || '—'
  const away = f.teams?.away?.name || '—'
  const hc = teamColor(home)
  const ac = teamColor(away)
  const hs = f.goals?.home ?? 0
  const as = f.goals?.away ?? 0
  const elapsed = f.fixture?.status?.elapsed
  const prog = Math.max(0, Math.min(100, ((elapsed ?? 0) / 90) * 100))

  return (
    <div className={`wfx-match${live ? ' is-live' : ''}${done ? ' is-done' : ''}`} style={{ '--hc': hc, '--ac': ac }}>
      <span className="strip" />
      {live && (
        <span className="wfx-live-badge">
          <span className="ld" />
          CANLI
        </span>
      )}
      {live && <span className="wfx-prog" style={{ width: `${prog}%` }} />}

      <div className="wfx-team home">
        <span className="tn">{home}</span>
        <span className="dot" style={{ '--c': hc }} />
      </div>

      {live ? (
        <div className="wfx-cap live">
          <div className="sc">{hs} - {as}</div>
          <div className="lm">
            <span className="ld" />
            {elapsed != null ? `${elapsed}'` : 'CANLI'}
          </div>
        </div>
      ) : done ? (
        <div className="wfx-cap done">
          <div className="sc">{hs} - {as}</div>
          <div className="ft">Maç Sonu</div>
        </div>
      ) : (
        <div className="wfx-cap time">
          <span className="tm">
            <ClockIcon />
            {fmtTime(f.fixture.date)}
          </span>
        </div>
      )}

      <div className="wfx-team away">
        <span className="dot" style={{ '--c': ac }} />
        <span className="tn">{away}</span>
      </div>
    </div>
  )
}
