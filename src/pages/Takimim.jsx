import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function Takimim() {
  const { user } = useAuth()

  if (!user) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Takımım</h1>
          <p className="page-sub">Kadronu görmek için giriş yapmalısın.</p>
        </header>
        <div className="squad-placeholder">
          <p>Bu sayfa üyelere özel.</p>
          <div className="hero-actions" style={{ justifyContent: 'center', marginTop: '1rem' }}>
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
        <h1>Takımım</h1>
        <p className="page-sub">Hoş geldin, {user.username}! 👋</p>
      </header>

      <div className="profile-grid">
        <div className="profile-item">
          <span className="profile-label">Kullanıcı Adı</span>
          <span className="profile-value">{user.username}</span>
        </div>
        <div className="profile-item">
          <span className="profile-label">E-posta</span>
          <span className="profile-value">{user.email}</span>
        </div>
        <div className="profile-item">
          <span className="profile-label">Favori Takım</span>
          <span className="profile-value">{user.favorite_team || '—'}</span>
        </div>
        <div className="profile-item">
          <span className="profile-label">Üyelik</span>
          <span className="profile-value">
            {user.created_at ? new Date(user.created_at).toLocaleDateString('tr-TR') : '—'}
          </span>
        </div>
      </div>

      <div className="squad-placeholder">
        <p>Henüz bir kadron yok.</p>
        <p className="muted">
          Kadro kurma ekranı geliştirme aşamasında. Buradan 15 oyunculu kadronu
          oluşturabilecek, kaptanını seçebilecek ve transfer yapabileceksin.
        </p>
      </div>
    </div>
  )
}
