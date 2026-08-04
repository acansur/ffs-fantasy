import { useState, useEffect } from 'react'
import './StatsTest.css'

// Gizli test sayfası: geçen sezon (2025) tamamlanmış (FT) bir maçın
// /fixtures/players verisindeki TÜM oyuncu istatistik alanlarını gösterir.
// Hiçbir alan filtrelenmez; dolu alanlar normal, null/boş alanlar soluk.

const LEAGUE = 203
const SEASON = 2025

// API-Football mevki kodu → grup
const POS_GROUP = { G: 'Kaleci', D: 'Defans', M: 'Orta Saha', F: 'Forvet' }
const GROUP_ORDER = ['Kaleci', 'Defans', 'Orta Saha', 'Forvet', 'Diğer']

// İç içe istatistik nesnesini nokta-yollu düz alanlara çevir (games.minutes, shots.total…)
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = v
  }
  return out
}

const isEmpty = (v) => v === null || v === undefined || v === ''

export default function StatsTest() {
  const [state, setState] = useState({ loading: true, error: null, fixture: null, groups: {}, columns: [] })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 1) Geçen sezondan tamamlanmış (FT) bir maç bul
        const fxRes = await fetch(`/api/football?path=fixtures&league=${LEAGUE}&season=${SEASON}&status=FT`)
        const fxData = await fxRes.json()
        if (!fxRes.ok) throw new Error(fxData?.error || `Fikstür alınamadı (${fxRes.status})`)
        const errs = fxData?.errors
        if (Array.isArray(errs) ? errs.length : errs && Object.keys(errs).length) {
          throw new Error('API hata: ' + JSON.stringify(errs))
        }
        const fx = (fxData.response || []).find((f) => f?.fixture?.id)
        if (!fx) throw new Error('Tamamlanmış maç bulunamadı.')
        const fixtureId = fx.fixture.id

        // 2) Maçın oyuncu istatistiklerini çek
        const pRes = await fetch(`/api/football?path=fixtures/players&fixture=${fixtureId}`)
        const pData = await pRes.json()
        if (!pRes.ok) throw new Error(pData?.error || `Oyuncu istatistikleri alınamadı (${pRes.status})`)
        const teams = pData.response || []

        // 3) Düzleştir + mevkiye göre grupla + tüm sütunları topla
        const colSet = new Set()
        const groups = {}
        for (const g of GROUP_ORDER) groups[g] = []
        for (const t of teams) {
          const teamName = t?.team?.name || '—'
          for (const p of t?.players || []) {
            const st = flatten(p?.statistics?.[0] || {})
            Object.keys(st).forEach((k) => colSet.add(k))
            const posCode = p?.statistics?.[0]?.games?.position
            const group = POS_GROUP[posCode] || 'Diğer'
            groups[group].push({
              id: p?.player?.id,
              name: p?.player?.name || '—',
              team: teamName,
              stats: st,
            })
          }
        }
        // Sütunları anlamlı sırayla: games.* önce, sonra alfabetik
        const columns = [...colSet].sort((a, b) => {
          const ag = a.startsWith('games.') ? 0 : 1
          const bg = b.startsWith('games.') ? 0 : 1
          return ag - bg || a.localeCompare(b)
        })

        if (!alive) return
        setState({
          loading: false,
          error: null,
          fixture: {
            id: fixtureId,
            date: fx.fixture?.date,
            home: fx.teams?.home?.name,
            away: fx.teams?.away?.name,
            score: `${fx.goals?.home ?? '-'} - ${fx.goals?.away ?? '-'}`,
          },
          groups,
          columns,
        })
      } catch (e) {
        if (alive) setState({ loading: false, error: e.message || String(e), fixture: null, groups: {}, columns: [] })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const { loading, error, fixture, groups, columns } = state

  // Tüm oyuncu + istatistik verisini CSV olarak indir
  const downloadCsv = () => {
    const esc = (val) => {
      if (val === null || val === undefined) return ''
      const s = String(val)
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Mevki', 'Oyuncu', 'Takım', ...columns]
    const lines = [header.map(esc).join(',')]
    for (const g of GROUP_ORDER) {
      for (const pl of groups[g] || []) {
        const row = [g, pl.name, pl.team, ...columns.map((c) => pl.stats[c])]
        lines.push(row.map(esc).join(','))
      }
    }
    // Excel'de Türkçe karakterler için UTF-8 BOM
    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fixture-${fixture?.id ?? 'stats'}-oyuncu-istatistikleri.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stx">
      <h1 className="stx-title">Fixture Players — İstatistik Testi</h1>
      <p className="stx-sub">
        Geçen sezon (Süper Lig {SEASON}) tamamlanmış bir maçın <code>/fixtures/players</code> verisindeki
        tüm oyuncu istatistik alanları. Dolu alanlar normal, boş (null) alanlar <span className="stx-emptylabel">soluk</span>.
      </p>

      {loading && <div className="stx-note">Yükleniyor…</div>}
      {error && <div className="stx-note err">⚠ {error}</div>}

      {!loading && !error && fixture && (
        <>
          <div className="stx-fixture">
            <div className="stx-fx-info">
              <div>
                <b>{fixture.home}</b> <span className="stx-score">{fixture.score}</span> <b>{fixture.away}</b>
              </div>
              <div className="stx-fx-meta">
                Fixture ID: <code>{fixture.id}</code>
                {fixture.date && <> · {new Date(fixture.date).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</>}
                · {columns.length} istatistik alanı
              </div>
            </div>
            <button type="button" className="stx-csv-btn" onClick={downloadCsv}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
              </svg>
              CSV İndir
            </button>
          </div>

          {GROUP_ORDER.map((g) => {
            const players = groups[g] || []
            if (!players.length) return null
            return (
              <section key={g} className="stx-group">
                <h2 className="stx-group-title">
                  {g} <span className="stx-count">({players.length})</span>
                </h2>
                <div className="stx-tablewrap">
                  <table className="stx-table">
                    <thead>
                      <tr>
                        <th className="stx-sticky">Oyuncu</th>
                        <th>Takım</th>
                        {columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((pl, i) => (
                        <tr key={`${pl.id}-${i}`}>
                          <td className="stx-sticky stx-name">{pl.name}</td>
                          <td className="stx-team">{pl.team}</td>
                          {columns.map((c) => {
                            const v = pl.stats[c]
                            const empty = isEmpty(v)
                            return (
                              <td key={c} className={empty ? 'stx-empty' : ''}>
                                {empty ? 'null' : String(v)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
