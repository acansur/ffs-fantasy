import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchSuperLigPlayers } from '../lib/apiFootball.js'
import { POSITIONS } from '../lib/squadData.js'
import './Players.css'

const POS_ORDER = ['GK', 'DF', 'OS', 'FW']
const POS_TABS = [
  { key: null, label: 'Tümü' },
  { key: 'GK', label: 'GK' },
  { key: 'DF', label: 'DF' },
  { key: 'OS', label: 'OS' },
  { key: 'FW', label: 'FW' },
]

// Mevki renkleri (KL = GK ile aynı)
const posColor = (pos) => (pos === 'GK' ? POSITIONS.KL.color : POSITIONS[pos]?.color || '#94a3b8')
const posLabel = (pos) =>
  ({ GK: 'Kaleci', DF: 'Defans', OS: 'Orta Saha', FW: 'Forvet' }[pos] || pos)

export default function Players() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [posFilter, setPosFilter] = useState(null)
  const [selectedTeams, setSelectedTeams] = useState([])
  const [teamOpen, setTeamOpen] = useState(false)
  const teamRef = useRef(null)

  useEffect(() => {
    let alive = true
    fetchSuperLigPlayers()
      .then((res) => alive && setState({ loading: false, error: null, data: res }))
      .catch((err) => alive && setState({ loading: false, error: err.message || String(err), data: null }))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!teamOpen) return
    const onDown = (e) => {
      if (teamRef.current && !teamRef.current.contains(e.target)) setTeamOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [teamOpen])

  const { loading, error, data } = state
  const teams = data?.teams ?? []

  const rows = useMemo(() => {
    if (!data) return []
    let list = data.players
    if (posFilter) list = list.filter((p) => p.position === posFilter)
    if (selectedTeams.length) list = list.filter((p) => selectedTeams.includes(p.team))
    return [...list].sort((a, b) => {
      const pa = POS_ORDER.indexOf(a.position)
      const pb = POS_ORDER.indexOf(b.position)
      if (pa !== pb) return pa - pb
      if (a.team !== b.team) return a.team.localeCompare(b.team, 'tr')
      return a.name.localeCompare(b.name, 'tr')
    })
  }, [data, posFilter, selectedTeams])

  const toggleTeam = (name) =>
    setSelectedTeams((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]))

  const teamLabel = selectedTeams.length === 0 ? 'Tüm takımlar' : `${selectedTeams.length} takım`

  return (
    <div className="page pl">
      <header className="page-head">
        <h1>Oyuncular — Süper Lig 2026-27</h1>
        <p className="page-sub">API-Football kadro verileri (gizli test sayfası).</p>
      </header>

      {loading && <div className="pl-note">Yükleniyor… (takımlar ve kadrolar çekiliyor)</div>}
      {error && <div className="notice">⚠️ {error}</div>}

      {data && (
        <>
          {/* Filtreler — Transfer paneli görünümü */}
          <div className="pl-filters">
            <div className="pl-pos-tabs">
              {POS_TABS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className={`pl-pos-tab${posFilter === t.key ? ' active' : ''}`}
                  onClick={() => setPosFilter(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="dropdown" ref={teamRef}>
              <button type="button" className="dropdown-toggle" onClick={() => setTeamOpen((o) => !o)}>
                {teamLabel}
              </button>
              {teamOpen && (
                <div className="dropdown-panel">
                  {teams.map((t) => (
                    <label key={t.id} className="check-row">
                      <input
                        type="checkbox"
                        checked={selectedTeams.includes(t.name)}
                        onChange={() => toggleTeam(t.name)}
                      />
                      {t.name}
                    </label>
                  ))}
                  <div className="dropdown-foot">
                    {selectedTeams.length > 0 && (
                      <button type="button" className="link-btn" onClick={() => setSelectedTeams([])}>
                        Temizle
                      </button>
                    )}
                    <button type="button" className="link-btn dropdown-done" onClick={() => setTeamOpen(false)}>
                      Tamam
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pl-count">{rows.length} oyuncu</div>

          <div className="pl-table-wrap">
            <table className="pl-table">
              <thead>
                <tr>
                  <th className="pl-th-pos">Mevki</th>
                  <th>Oyuncu</th>
                  <th>Takım</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={`${p.team}-${p.id}`}>
                    <td>
                      <span className="pl-pos" style={{ '--pos': posColor(p.position) }}>
                        {p.position}
                      </span>
                      <span className="pl-pos-long">{posLabel(p.position)}</span>
                    </td>
                    <td className="pl-name">{p.name}</td>
                    <td className="pl-team">{p.team}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="pl-empty">Filtreye uygun oyuncu yok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
