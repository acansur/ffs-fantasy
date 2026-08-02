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
      <main className="app-main">
        <Routes>
          {/* Yalnızca siteye ilk gelişte (kök adres) yönlendir; sonra Ana Sayfa görünür */}
          <Route path="/" element={redirectToSquad ? <Navigate to="/takimim" replace /> : <Home />} />
          <Route path="/lig" element={<Lig />} />
          <Route path="/takimim" element={<Takimim />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/liglerim" element={<Liglerim />} />
          <Route path="/kurallar" element={<Kurallar />} />
          <Route path="/fikstur" element={<Fikstur />} />
          <Route path="/giris" element={<Giris />} />
          <Route path="/kayit" element={<Kayit />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
