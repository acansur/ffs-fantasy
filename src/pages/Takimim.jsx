import { isSupabaseConfigured } from '../lib/supabase.js'

export default function Takimim() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Takımım</h1>
        <p className="page-sub">Kadronu buradan yönet.</p>
      </header>

      <div className="notice">
        {isSupabaseConfigured
          ? '✅ Supabase bağlı. Giriş ve kadro yönetimi yakında eklenecek.'
          : '🔒 Kadro yönetimi için önce Supabase kimlik doğrulaması kurulacak. .env dosyasını doldurduktan sonra bu bölüm aktifleşecek.'}
      </div>

      <div className="squad-placeholder">
        <p>Henüz bir kadron yok.</p>
        <p className="muted">
          Kadro kurma ekranı geliştirme aşamasında. Buradan 15 oyunculu
          kadronu oluşturabilecek, kaptanını seçebilecek ve transfer
          yapabileceksin.
        </p>
      </div>
    </div>
  )
}
