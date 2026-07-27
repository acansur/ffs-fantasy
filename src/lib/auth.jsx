import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from './supabase.js'

// ⚠️ PROTOTİP AUTH — düz metin şifre, istemci taraflı doğrulama.
// Gerçek kullanıcı verisiyle kullanma. Detay: supabase/migrations/0001_create_users.sql

const STORAGE_KEY = 'ffs.user'
const AuthContext = createContext(null)

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Şifreyi asla localStorage'a / context'e taşımıyoruz.
function stripPassword(row) {
  if (!row) return null
  const { password: _password, ...safe } = row
  return safe
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadStoredUser())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(STORAGE_KEY)
  }, [user])

  const ensureReady = () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase yapılandırılmadı. .env dosyasına VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY ekle.'
      )
    }
  }

  const register = useCallback(async ({ username, email, password, favoriteTeam }) => {
    ensureReady()
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .insert({
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password, // ⚠️ plaintext (prototip)
          favorite_team: favoriteTeam || null,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          // unique ihlali — hangi alan olduğunu mesajdan çıkar
          const dup = /email/i.test(error.message) ? 'E-posta' : 'Kullanıcı adı'
          throw new Error(`${dup} zaten kullanılıyor.`)
        }
        throw new Error(error.message)
      }

      const safe = stripPassword(data)
      setUser(safe)
      return safe
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async ({ email, password }) => {
    ensureReady()
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .eq('password', password) // ⚠️ plaintext karşılaştırma (prototip)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('E-posta veya şifre hatalı.')

      // last_seen güncelle (best-effort)
      const now = new Date().toISOString()
      await supabase.from('users').update({ last_seen: now }).eq('id', data.id)

      const safe = stripPassword({ ...data, last_seen: now })
      setUser(safe)
      return safe
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
  }, [])

  const value = { user, loading, register, login, logout, isConfigured: isSupabaseConfigured }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı.')
  return ctx
}
