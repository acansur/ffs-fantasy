import { useMemo, useState } from 'react'
import { SCORING, SCORING_TABS } from '../lib/squadData.js'
import './ScoringGuide.css'

// Sekme → pozisyon renkli nokta ipucu (Genel altın · KL yeşil · DF kırmızı · OS mavi · FW turuncu)
const TAB_DOT = {
  Genel: 'var(--gold, #f0a500)',
  Kaleci: 'var(--gk, #1bb87c)',
  Defans: 'var(--def, #f05a58)',
  'Orta Saha': 'var(--mid, #4a8bf0)',
  Forvet: 'var(--fwd, #f4903a)',
}

const IconStar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
  </svg>
)

// Puanlama rehberi — koyu premium tasarım (Transfer hero'daki butondan açılır).
// Veri gerçek puanlama tablosundan (SCORING) gelir; her sekmede kalemler
// "Puan Kazandıran" (yeşil) ve "Puan Kaybettiren" (kırmızı) olarak gruplanır.
// Çarpan (Kaptan ×2) ekleme/çıkarma olmadığı için ayrı özel kart olarak gösterilir.
export default function ScoringGuide() {
  const [tab, setTab] = useState('Genel')

  const { pos, neg, special } = useMemo(() => {
    const items = SCORING[tab] || []
    const nums = items.filter((r) => typeof r.pts === 'number')
    return {
      pos: nums.filter((r) => r.pts > 0).sort((a, b) => b.pts - a.pts), // yüksekten düşüğe
      neg: nums.filter((r) => r.pts < 0).sort((a, b) => a.pts - b.pts), // en ağır ceza önce
      // Çarpan/özel satır (metin pts, örn. '×2') — yalnızca bulunduğu sekmede
      special: items.find((r) => typeof r.pts === 'string') || null,
    }
  }, [tab])

  return (
    <div className="sg2">
      <div className="g-head">
        <div>
          <div className="g-title semi">Puanlama Rehberi</div>
          <div className="g-sub">Oyuncular maçtaki performanslarına göre puan kazanır.</div>
        </div>
      </div>

      <div className="g-tabs">
        {SCORING_TABS.map((t) => (
          <button key={t} type="button" className={`g-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            <span className="tdot" style={{ background: TAB_DOT[t] }} />
            {t}
          </button>
        ))}
      </div>

      <div className="g-list">
        {pos.length > 0 && (
          <>
            <div className="g-sec pos">
              <span className="sdot" />
              Puan Kazandıran
            </div>
            {pos.map((row) => (
              <div key={row.label} className="g-row">
                <span className="gl">{row.label}</span>
                <span className="g-badge b-pos cond tnum">+{row.pts}</span>
              </div>
            ))}
          </>
        )}

        {neg.length > 0 && (
          <>
            <div className="g-sec neg">
              <span className="sdot" />
              Puan Kaybettiren
            </div>
            {neg.map((row) => (
              <div key={row.label} className="g-row">
                <span className="gl">{row.label}</span>
                <span className="g-badge b-neg cond tnum">−{Math.abs(row.pts)}</span>
              </div>
            ))}
          </>
        )}

        {special && (
          <div className="g-special">
            <span className="si"><IconStar /></span>
            <div className="sc">
              <div className="sn">{special.label}</div>
              <div className="sd">Kaptanının o haftaki toplam puanı 2 ile çarpılır.</div>
            </div>
            <span className="g-badge cond">{special.pts}</span>
          </div>
        )}
      </div>
    </div>
  )
}
