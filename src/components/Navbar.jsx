import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

const links = [
  { to: '/', label: 'Ana Sayfa', end: true },
  { to: '/lig', label: 'Lig' },
  { to: '/takimim', label: 'Takımım' },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">FFS</span>
          <span className="brand-text">Fantasy Süper Lig</span>
        </Link>
        <nav className="nav-links">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {user ? (
          <div className="nav-user">
            <span className="nav-username">Merhaba, {user.username}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
              Çıkış
            </button>
          </div>
        ) : (
          <div className="nav-user">
            <Link to="/giris" className="nav-link">Giriş</Link>
            <Link to="/kayit" className="btn btn-primary btn-sm">
              Kayıt Ol
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
