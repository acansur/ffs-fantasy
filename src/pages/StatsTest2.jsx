import FixtureStats from '../components/FixtureStats.jsx'

const LEAGUE = 203
const SEASON = 2025 // 2025-26 sezonu — Mart 2026 bu sezona ait
const MATCH_DATE = '2026-03-01'

const norm = (s) => (s || '').toLocaleLowerCase('tr')

// 1 Mart 2026 Antalyaspor - Fenerbahçe maçının fixture'ını API'den bul
async function findAntalyaFener() {
  const res = await fetch(`/api/football?path=fixtures&league=${LEAGUE}&season=${SEASON}&date=${MATCH_DATE}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Fikstür alınamadı (${res.status})`)
  const errs = data?.errors
  if (Array.isArray(errs) ? errs.length : errs && Object.keys(errs).length) throw new Error('API hata: ' + JSON.stringify(errs))
  const fx = (data.response || []).find((f) => {
    const names = [f?.teams?.home?.name, f?.teams?.away?.name].map(norm)
    return names.some((n) => n.includes('antalya')) && names.some((n) => n.includes('fenerbah'))
  })
  if (!fx) throw new Error('Antalyaspor - Fenerbahçe (1 Mart 2026) maçı bulunamadı.')
  return fx
}

export default function StatsTest2() {
  return (
    <FixtureStats
      title="Antalyaspor - Fenerbahçe — İstatistik Testi"
      subtitle={
        <>
          1 Mart 2026 tarihli Antalyaspor - Fenerbahçe maçının <code>/fixtures/players</code> verisindeki tüm
          oyuncu istatistik alanları. Dolu alanlar normal, boş (null) alanlar{' '}
          <span className="stx-emptylabel">soluk</span>.
        </>
      }
      findFixture={findAntalyaFener}
    />
  )
}
