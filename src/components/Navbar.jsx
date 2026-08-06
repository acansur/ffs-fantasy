import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import './Navbar.css'

const loggedInLinks = [
  { to: '/', label: 'Ana Sayfa', end: true },
  { to: '/takimim', label: 'Takımım' },
  { to: '/kim-kazanir', label: 'Kim Kazanır?' },
  { to: '/liglerim', label: 'Liglerim' },
]

const loggedOutLinks = [{ to: '/', label: 'Ana Sayfa', end: true }]

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const links = user ? loggedInLinks : loggedOutLinks

  const onLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="ffs-nav">
      <div className="ffs-nav-in">
        <Link to="/" className="ffs-nav-brand">
          <span className="ffs-nav-crest">FFS</span>
          <span className="ffs-nav-name">Fantasy <span>Süper Lig</span></span>
        </Link>
        <nav className="ffs-nav-links">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {user ? (
          <>
            <span className="ffs-nav-user">Merhaba, <b>{user.username}</b></span>
            <button type="button" className="ffs-nav-logout" onClick={onLogout}>
              Çıkış
            </button>
          </>
        ) : (
          <>
            <Link to="/giris" className="ffs-nav-logout">Giriş Yap</Link>
            <Link to="/kayit" className="ffs-nav-cta">Kayıt Ol</Link>
          </>
        )}
      </div>
    </header>
  )
}
