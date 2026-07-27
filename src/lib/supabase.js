import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Env değişkenleri henüz doldurulmadıysa uygulamayı çökertmek yerine uyar.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.warn(
    '[FFS] Supabase yapılandırılmadı. .env dosyasına VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY ekle.'
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
