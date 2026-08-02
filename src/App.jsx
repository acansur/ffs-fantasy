import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { fetchSuperLigFixtures } from './lib/apiFootball.js'
import { useAuth } from './lib/auth.jsx'
import Navbar from './components/Navbar.jsx'
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

  // Fikstürü çekip konsola logla (inceleme amaçlı — sadece geliştirmede).
  // Manuel tetiklemek için konsoldan: window.ffsFetchFixtures()
  useEffect(() => {
    if (typeof window !== 'undefined') window.ffsFetchFixtures = fetchSuperLigFixtures
    if (import.meta.env.DEV) fetchSuperLigFixtures()
  }, [])

  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <Routes>
          {/* Giriş yapmış kullanıcı ana sayfaya her gelişinde Takımım'a yönlenir */}
          <Route path="/" element={user ? <Navigate to="/takimim" replace /> : <Home />} />
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
