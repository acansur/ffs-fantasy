// Saha görünümünün altında o haftanın fikstürü — timeline görünüm.
// Takvim (takımlar, gün, saat) `fixtures` prop'undan gelir; CANLI skor, maç
// DURUMU ve DAKİKA ise Supabase live_scores tablosundan okunur — API polling YOK.
// GitHub Actions cron'u tabloyu 5 dk'da bir günceller; bu bileşen de sayfa
// açılınca ve 5 dk'da bir Supabase'den okur.
//   - live_scores'ta satır yok → maç başlamadı (NS) → saat gösterilir
//   - satır status='IN_PLAY' → canlı → skor + dakika (elapsed)
//   - satır status='FT'      → maç sonu → final skor
// Transfer: preMatchOnly → yalnızca saat (o sayfa deadline'da kapandığından
// canlı/biten durumuna hiç ulaşmaz; live_scores da çekilmez).

import { useMemo, useState, useEffect } from 'react'
import { normalizeText } from '../lib/normalize.js'
import { getLiveScoresByFixtures } from '../lib/liveScoresDb.js'
import './WeekFixtures.css'

const roundNo = (r) => Number(String(r).match(/\d+/)?.[0] ?? 0)

// live_scores.status kodları. Cron güncel olarak 'IN_PLAY'/'FT' yazar; eski
// format kodlarına da (2H, HT, AET…) karşı dayanıklı olalım.
const LIVE_CODES = new Set(['IN_PLAY', '1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'SUSP', 'INT'])
const DONE_CODES = new Set(['FT', 'AET', 'PEN', 'WO'])
const isRowLive = (row) => Boolean(row?.status) && LIVE_CODES.has(row.status)
const isRowDone = (row) => Boolean(row?.status) && DONE_CODES.has(row.status)

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

  // O haftanın fixture id'leri (canlı veri okuması için)
  const roundIds = useMemo(
    () =>
      (fixtures || [])
        .filter((f) => roundNo(f.league?.round) === round && f.fixture?.id)
        .map((f) => f.fixture.id),
    [fixtures, round]
  )
  const idsKey = roundIds.join('-')

  // Canlı skor/durum/dakika: Supabase live_scores'tan — sayfa açılınca + 5 dk'da bir.
  // preMatchOnly (Transfer) yalnızca saat gösterdiğinden hiç okuma yapılmaz.
  const [liveMap, setLiveMap] = useState(() => new Map())
  useEffect(() => {
    if (preMatchOnly || !roundIds.length) {
      setLiveMap(new Map())
      return
    }
    let alive = true
    const load = () =>
      getLiveScoresByFixtures(roundIds)
        .then((m) => { if (alive) setLiveMap(m) })
        .catch(() => {})
    load()
    const id = setInterval(load, 300000) // 5 dk (cron cadence'i ile hizalı)
    return () => { alive = false; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, preMatchOnly])

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
        const hasLive = !preMatchOnly && list.some((f) => isRowLive(liveMap.get(f.fixture.id)))
        return (
          <div key={key} className={`wfx-day${hasLive ? ' hasLive' : ''}`}>
            <span className="wfx-node" />
            <div className="wfx-date">{fmtDay(list[0].fixture.date)}</div>
            <div className="wfx-list">
              {list.map((f) => (
                <FxMatch key={f.fixture.id} f={f} live={liveMap.get(f.fixture.id) || null} preMatchOnly={preMatchOnly} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FxMatch({ f, live: row, preMatchOnly }) {
  const home = f.teams?.home?.name || '—'
  const away = f.teams?.away?.name || '—'
  const hc = teamColor(home)
  const ac = teamColor(away)

  // Canlı skor/durum/dakika Supabase live_scores satırından. Satır yoksa maç
  // başlamamış (NS) → yalnızca saat. (preMatchOnly'de satır zaten çekilmez.)
  const r = preMatchOnly ? null : row
  const live = isRowLive(r)
  const done = isRowDone(r)
  const hs = r?.home_goals ?? 0
  const as = r?.away_goals ?? 0
  const elapsed = r?.elapsed
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
