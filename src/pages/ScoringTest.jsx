import { useState, useEffect } from 'react'
import { scoreFixture } from '../lib/scoring.js'
import './ScoringTest.css'

// Gizli test sayfası: geçen sezondan (2025) 5 tamamlanmış maçın her oyuncusunu
// scoring.js motorundan geçirip puan kırılımını (her istatistik başına puan)
// gösterir.

const LEAGUE = 203
const SEASON = 2025
// 6. maç olarak her zaman eklenen sabit maç: 1 Mart 2026 Antalyaspor - Fenerbahçe
const EXTRA_FIXTURE_ID = 1394640
const ROLE_GROUP = { gk: 'Kaleci', def: 'Defans', mid: 'Orta Saha', fwd: 'Forvet' }
const GROUP_ORDER = ['Kaleci', 'Defans', 'Orta Saha', 'Forvet', 'Diğer']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Rate-limit (dakikalık istek limiti) yenince bekleyip yeniden dener.
const getJson = async (url, attempt = 0) => {
  const res = await fetch(url)
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* boş yanıt */
  }
  const errs = data?.errors
  const rateLimited =
    errs && typeof errs === 'object' && JSON.stringify(errs).toLowerCase().includes('too many')
  if (rateLimited && attempt < 8) {
    await sleep(6000 + attempt * 3000) // dakikalık pencere sıfırlanana kadar bekle
    return getJson(url, attempt + 1)
  }
  if (!res.ok) throw new Error(data?.error || `İstek başarısız (${res.status})`)
  if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) {
    throw new Error('API hata: ' + JSON.stringify(errs))
  }
  return data
}

export default function ScoringTest() {
  const [state, setState] = useState({ loading: true, error: null, matches: [] })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 1) Sezonun tamamlanmış (FT) maçları
        const fxData = await getJson(`/api/football?path=fixtures&league=${LEAGUE}&season=${SEASON}&status=FT`)
        const all = fxData.response || []
        if (all.length < 5) throw new Error('Yeterli tamamlanmış maç bulunamadı.')
        // Sezona yayılmış 5 farklı maç seç
        const step = Math.floor(all.length / 5)
        const picks = [0, 1, 2, 3, 4].map((i) => all[i * step])
        // 6. maç: 1 Mart 2026 Antalyaspor - Fenerbahçe (sabit)
        const extra = all.find((f) => f.fixture?.id === EXTRA_FIXTURE_ID)
        if (extra && !picks.some((p) => p.fixture?.id === EXTRA_FIXTURE_ID)) picks.push(extra)

        const matches = []
        for (let mi = 0; mi < picks.length; mi++) {
          const fx = picks[mi]
          const id = fx.fixture.id
          if (mi > 0) await sleep(1500) // maçlar arası nefes (rate-limit için)
          const [pData, eData] = await Promise.all([
            getJson(`/api/football?path=fixtures/players&fixture=${id}`),
            getJson(`/api/football?path=fixtures/events&fixture=${id}`),
          ])
          const players = pData.response || []
          const events = eData.response || []
          const teamName = {}
          for (const t of players) teamName[t.team?.id] = t.team?.name
          const scored = scoreFixture(players, events)

          const groups = {}
          for (const g of GROUP_ORDER) groups[g] = []
          for (const s of scored) {
            const g = ROLE_GROUP[s.role] || 'Diğer'
            groups[g].push({ ...s, team: teamName[s.teamId] || '—' })
          }
          for (const g of GROUP_ORDER) groups[g].sort((a, b) => b.total - a.total)

          matches.push({
            id,
            home: fx.teams?.home?.name,
            away: fx.teams?.away?.name,
            score: `${fx.goals?.home ?? '-'} - ${fx.goals?.away ?? '-'}`,
            date: fx.fixture?.date,
            groups,
          })
        }
        if (alive) setState({ loading: false, error: null, matches })
      } catch (e) {
        if (alive) setState({ loading: false, error: e.message || String(e), matches: [] })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const { loading, error, matches } = state

  return (
    <div className="sct">
      <h1 className="sct-title">Puanlama Motoru — Test</h1>
      <p className="sct-sub">
        Geçen sezon (Süper Lig {SEASON}) 6 tamamlanmış maç. Her oyuncu <code>scoring.js</code> motorundan geçirildi;
        her istatistik başına aldığı puan ayrı ayrı gösterilir. Toplam: <span className="sct-tp">yeşil pozitif</span>,{' '}
        <span className="sct-tn">kırmızı negatif</span>.
      </p>

      {loading && <div className="sct-note">Yükleniyor… (6 maç · 12+ API isteği)</div>}
      {error && <div className="sct-note err">⚠ {error}</div>}

      {!loading && !error &&
        matches.map((m) => (
          <section key={m.id} className="sct-match">
            <div className="sct-match-head">
              <div className="sct-match-title">
                <b>{m.home}</b> <span className="sct-score">{m.score}</span> <b>{m.away}</b>
              </div>
              <div className="sct-match-meta">
                Fixture ID: <code>{m.id}</code>
                {m.date && <> · {new Date(m.date).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}</>}
              </div>
            </div>

            {GROUP_ORDER.map((g) => {
              const players = m.groups[g] || []
              if (!players.length) return null
              return (
                <div key={g} className="sct-group">
                  <h3 className="sct-group-title">{g}</h3>
                  <div className="sct-players">
                    {players.map((p) => (
                      <div key={`${m.id}-${p.id}`} className="sct-player">
                        <div className="sct-p-head">
                          <div className="sct-p-id">
                            <span className="sct-p-name">{p.name}</span>
                            <span className="sct-p-sub">
                              {ROLE_GROUP[p.role] || p.position || '—'} · {p.team}
                              {p.captain && <span className="sct-cap">C</span>}
                            </span>
                          </div>
                          <div className={`sct-total ${p.total >= 0 ? 'pos' : 'neg'}`}>{p.total}</div>
                        </div>
                        <div className="sct-parts">
                          {p.parts.length === 0 ? (
                            <span className="sct-nopart">— puan yok —</span>
                          ) : (
                            p.parts.map((part) => (
                              <span key={part.key} className={`sct-chip ${part.pts >= 0 ? 'pos' : 'neg'}`}>
                                {part.label}
                                {typeof part.n === 'number' && part.n > 0 && <em> ·{part.n}</em>}
                                <b>{part.pts >= 0 ? `+${part.pts}` : part.pts}</b>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        ))}
    </div>
  )
}
