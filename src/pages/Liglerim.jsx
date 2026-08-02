import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function Liglerim() {
  const { user } = useAuth()

  if (!user) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Liglerim</h1>
          <p className="page-sub">Liglerini görmek için giriş yapmalısın.</p>
        </header>
        <div className="squad-placeholder">
          <div className="hero-actions" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
            <Link to="/giris" className="btn btn-primary">Giriş Yap</Link>
            <Link to="/kayit" className="btn btn-ghost">Kayıt Ol</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Liglerim</h1>
        <p className="page-sub">Katıldığın mini ligler ve genel klasman yakında burada.</p>
      </header>
      <div className="squad-placeholder">
        <p>Henüz bir lige katılmadın. 🏆</p>
        <p className="muted">
          Yakında arkadaşlarınla özel lig kurabilecek ve klasmanları buradan takip edebileceksin.
        </p>
      </div>
    </div>
  )
}
