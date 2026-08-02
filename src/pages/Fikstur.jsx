import { useEffect, useState } from 'react'
import { fetchSuperLigFixtures } from '../lib/apiFootball.js'
import './Fikstur.css'

const roundNo = (r) => Number(String(r).match(/\d+/)?.[0] ?? 0)

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  })

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  })

const STATUS_TR = {
  NS: 'Başlamadı',
  FT: 'Bitti',
  AET: 'Uzatma',
  PEN: 'Penaltı',
  PST: 'Ertelendi',
  CANC: 'İptal',
  '1H': 'İlk Yarı',
  '2H': '2. Yarı',
  HT: 'Devre',
  LIVE: 'Canlı',
  TBD: 'Belirsiz',
}

export default function Fikstur() {
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let alive = true
    fetchSuperLigFixtures().then((res) => {
      if (!alive) return
      if (!res) {
        setState({ loading: false, error: 'Fikstür alınamadı (API/proxy). Konsolu kontrol et.', data: null })
      } else {
        setState({ loading: false, error: null, data: res })
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const { loading, error, data } = state

  // Tarihi belli maçlar (TBD/tarihi olmayan hariç), haftaya göre gruplanmış
  const groups = []
  if (data) {
    const filtered = data.fixtures.filter(
      (f) => f.fixture?.date && f.fixture?.status?.short !== 'TBD'
    )
    const byRound = {}
    for (const f of filtered) (byRound[f.league.round] ??= []).push(f)
    for (const round of Object.keys(byRound).sort((a, b) => roundNo(a) - roundNo(b))) {
      const list = byRound[round].sort(
        (a, b) => new Date(a.fixture.date) - new Date(b.fixture.date)
      )
      groups.push({ round, list })
    }
  }

  const shownCount = groups.reduce((n, g) => n + g.list.length, 0)

  return (
    <div className="page fx">
      <header className="page-head">
        <h1>Fikstür — Süper Lig 2026-27</h1>
        <p className="page-sub">API-Football'dan çekilen fikstür (geçici test sayfası).</p>
      </header>

      {loading && <div className="fx-note">Yükleniyor…</div>}
      {error && <div className="notice">⚠️ {error}</div>}

      {data && (
        <>
          <div className="fx-summary">
            {data.count} maç · {data.rounds.length} hafta · {shownCount} tarihi belli maç gösteriliyor
          </div>

          {groups.map((g) => (
            <section key={g.round} className="fx-week">
              <h2 className="fx-week-title">{roundNo(g.round)}. Hafta</h2>
              <ul className="fx-list">
                {g.list.map((f) => {
                  const s = f.fixture.status?.short
                  return (
                    <li key={f.fixture.id} className="fx-match">
                      <span className="fx-dt">
                        <span className="fx-date">{fmtDate(f.fixture.date)}</span>
                        <span className="fx-time">{fmtTime(f.fixture.date)}</span>
                      </span>
                      <span className="fx-teams">
                        <span className="fx-home">{f.teams.home.name}</span>
                        <span className="fx-vs">–</span>
                        <span className="fx-away">{f.teams.away.name}</span>
                      </span>
                      <span
                        className={`fx-status s-${s}`}
                        title={f.fixture.status?.long || ''}
                      >
                        {s}
                        <small>{STATUS_TR[s] || ''}</small>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
