import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { fetchSuperLigFixtures } from './lib/apiFootball.js'
import { useAuth } from './lib/auth.jsx'
import Navbar from './components/Navbar.jsx'

// Uygulama ilk yüklendiğindeki (tam sayfa yüklemesi) adres. In-app gezinme
// (navbar tıklaması vb.) bu modül değerini değiştirmez.
const ENTERED_AT_ROOT = typeof window !== 'undefined' && window.location.pathname === '/'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import Lig from './pages/Lig.jsx'
import Takimim from './pages/Takimim.jsx'
import Transfer from './pages/Transfer.jsx'
import Liglerim from './pages/Liglerim.jsx'
import Kurallar from './pages/Kurallar.jsx'
import Fikstur from './pages/Fikstur.jsx'
import Players from './pages/Players.jsx'
import StatsTest from './pages/StatsTest.jsx'
import StatsTest2 from './pages/StatsTest2.jsx'
import ScoringTest from './pages/ScoringTest.jsx'
import UelTest from './pages/UelTest.jsx'
import { SquadProvider } from './lib/squadStore.jsx'
import { PL_CONFIG } from './lib/plConfig.js'
import RequireAdmin from './components/RequireAdmin.jsx'
import Players2 from './pages/Players2.jsx'
import Admin from './pages/Admin.jsx'
import KimKazanir from './pages/KimKazanir.jsx'
import AnnouncementBanner from './components/AnnouncementBanner.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Giris from './pages/Giris.jsx'
import Kayit from './pages/Kayit.jsx'
import NotFound from './pages/NotFound.jsx'
import './App.css'

export default function App() {
  const { user } = useAuth()

  // "İlk yükleme" aşaması: yalnızca uygulamanın ilk render'ında true. Mount
  // sonrası false olur; böylece sonraki gezinmeler (navbar "Ana Sayfa") ana
  // sayfayı gösterir, yönlendirme yapılmaz.
  const [initialPhase, setInitialPhase] = useState(true)
  useEffect(() => {
    setInitialPhase(false)
  }, [])

  // Fikstürü çekip konsola logla (inceleme amaçlı — sadece geliştirmede).
  // Manuel tetiklemek için konsoldan: window.ffsFetchFixtures()
  useEffect(() => {
    if (typeof window !== 'undefined') window.ffsFetchFixtures = fetchSuperLigFixtures
    if (import.meta.env.DEV) fetchSuperLigFixtures()
  }, [])

  // Giriş yapmış kullanıcı yalnızca siteye ilk gelişinde (kök adrese taze
  // yükleme) Takımım'a yönlenir; navbar'dan Ana Sayfa'ya tıklayınca yönlenmez.
  const redirectToSquad = user && initialPhase && ENTERED_AT_ROOT

  return (
    <div className="app">
      <Navbar />
      <AnnouncementBanner />
      <main className="app-main">
        <ErrorBoundary>
        <Routes>
          {/* Yalnızca siteye ilk gelişte (kök adres) yönlendir; sonra Ana Sayfa görünür */}
          <Route path="/" element={redirectToSquad ? <Navigate to="/takimim" replace /> : <Home />} />
          <Route path="/lig" element={<Lig />} />
          <Route path="/takimim" element={<Takimim />} />
          <Route path="/kim-kazanir" element={<KimKazanir />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/liglerim" element={<Liglerim />} />
          <Route path="/kurallar" element={<Kurallar />} />
          {/* Geliştirici araçları — yalnızca admin (admin değilse ana sayfaya yönlenir) */}
          <Route path="/fikstur" element={<RequireAdmin><Fikstur /></RequireAdmin>} />
          <Route path="/players" element={<RequireAdmin><Players /></RequireAdmin>} />
          <Route path="/stats-test" element={<RequireAdmin><StatsTest /></RequireAdmin>} />
          <Route path="/stats-test2" element={<RequireAdmin><StatsTest2 /></RequireAdmin>} />
          <Route path="/scoring-test" element={<RequireAdmin><ScoringTest /></RequireAdmin>} />
          <Route path="/uel-test" element={<UelTest slot="uel-test" />} />
          {/* Polonya Ekstraklasa test ortamı — aynı Takımım/Transfer, PL verisi + izole tablolar.
              Navbar'da görünmez; sadece bu adreslerden erişilir. */}
          <Route path="/pl-test" element={<SquadProvider config={PL_CONFIG}><Takimim /></SquadProvider>} />
          <Route path="/pl-test/transfer" element={<SquadProvider config={PL_CONFIG}><Transfer /></SquadProvider>} />
          <Route path="/players2" element={<RequireAdmin><Players2 /></RequireAdmin>} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/giris" element={<Giris />} />
          <Route path="/kayit" element={<Kayit />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  )
}
