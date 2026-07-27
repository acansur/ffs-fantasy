import { NavLink, Link } from 'react-router-dom'

const links = [
  { to: '/', label: 'Ana Sayfa', end: true },
  { to: '/lig', label: 'Lig' },
  { to: '/takimim', label: 'Takımım' },
]

export default function Navbar() {
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
        <Link to="/takimim" className="btn btn-primary btn-sm">
          Giriş Yap
        </Link>
      </div>
    </header>
  )
}
