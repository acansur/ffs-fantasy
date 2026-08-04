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
          // Pozitif → yeşil (işaretsiz), negatif → kırmızı (- ile), '×2' → sarı
          const isMult = typeof row.pts === 'string'
          const cls = isMult ? 'mult' : row.pts >= 0 ? 'pos' : 'neg'
          return (
            <li key={row.label}>
              <span>{row.label}</span>
              <span className={`sg-pts ${cls}`}>{isMult ? row.pts : String(row.pts)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
