import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function Giris() {
  const { login, loading, isConfigured } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await login({ email: form.email, password: form.password })
      navigate('/takimim')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Giriş Yap</h1>
        <p className="page-sub">Kadronu yönetmek için giriş yap.</p>

        {!isConfigured && (
          <div className="notice">
            ⚠️ Supabase bağlı değil. Giriş için <code>.env</code> dosyasını doldurman gerekiyor.
          </div>
        )}

        <form onSubmit={onSubmit} className="form">
          <label className="field">
            <span>E-posta</span>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="ornek@eposta.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>Şifre</span>
            <input
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !isConfigured}>
            {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>

        <p className="auth-alt">
          Hesabın yok mu? <Link to="/kayit">Kayıt ol</Link>
        </p>
      </div>
    </div>
  )
}
