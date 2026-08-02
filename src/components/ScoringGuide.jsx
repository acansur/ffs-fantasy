import { useState } from 'react'
import { SCORING, SCORING_TABS } from '../lib/squadData.js'
import './ScoringGuide.css'

// Puanlama rehberi kartı (Transfer ekranının sağ panelinde kullanılır)
export default function ScoringGuide() {
  const [tab, setTab] = useState('Genel')
  return (
    <div className="sg-card">
      <h3>Puanlama Rehberi</h3>
      <div className="sg-tabs">
        {SCORING_TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`sg-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <ul className="sg-list">
        {SCORING[tab].map((row) => {
          const cls = row.pts.startsWith('+') ? 'pos' : row.pts.startsWith('-') ? 'neg' : 'mult'
          return (
            <li key={row.label}>
              <span>{row.label}</span>
              <span className={`sg-pts ${cls}`}>{row.pts}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
