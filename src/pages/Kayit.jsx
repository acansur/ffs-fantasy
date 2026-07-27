import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { TEAMS } from '../lib/teams.js'

export default function Kayit() {
  const { register, loading, isConfigured } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    password2: '',
    favoriteTeam: '',
  })
  const [error, setError] = useState('')

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.username.trim().length < 3) {
      setError('Kullanıcı adı en az 3 karakter olmalı.')
      return
    }
    if (form.password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.')
      return
    }
    if (form.password !== form.password2) {
      setError('Şifreler eşleşmiyor.')
      return
    }

    try {
      await register({
        username: form.username,
        email: form.email,
        password: form.password,
        favoriteTeam: form.favoriteTeam,
      })
      navigate('/takimim')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Kayıt Ol</h1>
        <p className="page-sub">FFS Fantasy Süper Lig'e katıl.</p>

        {!isConfigured && (
          <div className="notice">
            ⚠️ Supabase bağlı değil. Kayıt için <code>.env</code> dosyasını doldurman gerekiyor.
          </div>
        )}

        <form onSubmit={onSubmit} className="form">
          <label className="field">
            <span>Kullanıcı Adı</span>
            <input
              type="text"
              value={form.username}
              onChange={update('username')}
              placeholder="menajer_adi"
              autoComplete="username"
              required
            />
          </label>

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
              placeholder="En az 6 karakter"
              autoComplete="new-password"
              required
            />
          </label>

          <label className="field">
            <span>Şifre (Tekrar)</span>
            <input
              type="password"
              value={form.password2}
              onChange={update('password2')}
              autoComplete="new-password"
              required
            />
          </label>

          <label className="field">
            <span>Favori Takım</span>
            <select value={form.favoriteTeam} onChange={update('favoriteTeam')}>
              <option value="">Seçiniz (opsiyonel)</option>
              {TEAMS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !isConfigured}>
            {loading ? 'Kaydediliyor…' : 'Kayıt Ol'}
          </button>
        </form>

        <p className="auth-alt">
          Zaten hesabın var mı? <Link to="/giris">Giriş yap</Link>
        </p>
      </div>
    </div>
  )
}
