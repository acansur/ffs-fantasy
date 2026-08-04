import FixtureStats from '../components/FixtureStats.jsx'

const LEAGUE = 203
const SEASON = 2025

// Geçen sezondan tamamlanmış (FT) ilk maçı bul
async function findFirstFT() {
  const res = await fetch(`/api/football?path=fixtures&league=${LEAGUE}&season=${SEASON}&status=FT`)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Fikstür alınamadı (${res.status})`)
  const errs = data?.errors
  if (Array.isArray(errs) ? errs.length : errs && Object.keys(errs).length) throw new Error('API hata: ' + JSON.stringify(errs))
  const fx = (data.response || []).find((f) => f?.fixture?.id)
  if (!fx) throw new Error('Tamamlanmış maç bulunamadı.')
  return fx
}

export default function StatsTest() {
  return (
    <FixtureStats
      title="Fixture Players — İstatistik Testi"
      subtitle={
        <>
          Geçen sezon (Süper Lig {SEASON}) tamamlanmış bir maçın <code>/fixtures/players</code> verisindeki tüm
          oyuncu istatistik alanları. Dolu alanlar normal, boş (null) alanlar{' '}
          <span className="stx-emptylabel">soluk</span>.
        </>
      }
      findFixture={findFirstFT}
    />
  )
}
