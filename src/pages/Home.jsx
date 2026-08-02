import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

const features = [
  {
    icon: '⚽',
    title: 'Kadronu Kur',
    text: 'Süper Lig oyuncularından bütçene göre 15 kişilik kadronu oluştur. Kaleci, defans, orta saha ve forvet dengeni kur.',
  },
  {
    icon: '📊',
    title: 'Puan Topla',
    text: 'Oyuncuların gerçek maç performanslarına göre puan kazan. Gol, asist, clean sheet ve daha fazlası.',
  },
  {
    icon: '🔁',
    title: 'Transfer Yap',
    text: 'Her hafta transfer hakkını kullan, formda olmayan oyuncuları çıkar, yükselen yıldızları kadrona kat.',
  },
  {
    icon: '🏆',
    title: 'Mini Ligler',
    text: 'Arkadaşlarınla özel lig kur, kıyasıya rekabet et. Haftalık ve sezonluk şampiyonu belirle.',
  },
]

const teams = [
  'Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor',
  'Başakşehir', 'Adana Demirspor', 'Kasımpaşa', 'Konyaspor',
]

export default function Home() {
  const { user } = useAuth()
  // Giriş yapmışsa kadroya, değilse giriş ekranına yönlendir
  const startTo = user ? '/takimim' : '/giris'
  const joinTo = user ? '/takimim' : '/kayit'

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <span className="badge">2025/26 Sezonu Başladı</span>
          <h1 className="hero-title">
            Süper Lig'in <span className="accent">menajeri</span> sensin.
          </h1>
          <p className="hero-sub">
            FFS Fantasy Süper Lig'de kendi hayalindeki kadroyu kur, her hafta
            puan topla ve arkadaşlarınla ligin zirvesi için yarış.
          </p>
          <div className="hero-actions">
            <Link to={startTo} className="btn btn-primary">
              Hemen Başla
            </Link>
            <Link to="/kurallar" className="btn btn-ghost">
              Kurallar
            </Link>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <strong>18</strong>
              <span>Takım</span>
            </div>
            <div className="stat">
              <strong>500+</strong>
              <span>Oyuncu</span>
            </div>
            <div className="stat">
              <strong>38</strong>
              <span>Hafta</span>
            </div>
          </div>
        </div>
        <div className="hero-pitch" aria-hidden="true">
          <div className="pitch">
            <div className="pitch-line pitch-mid" />
            <div className="pitch-circle" />
            <div className="pitch-box pitch-box-top" />
            <div className="pitch-box pitch-box-bottom" />
            <div className="pitch-rows">
              {/* 4-4-2 dizilişi — üstten alta: forvet, orta saha, defans, kaleci */}
              {[
                { pos: 'FW', count: 2 },
                { pos: 'MF', count: 4 },
                { pos: 'DF', count: 4 },
                { pos: 'GK', count: 1 },
              ].map((row) => (
                <div className="pitch-row" key={row.pos}>
                  {Array.from({ length: row.count }).map((_, i) => (
                    <span key={i} className={`player player-${row.pos.toLowerCase()}`}>
                      {row.pos}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <h2 className="section-title">Nasıl Oynanır?</h2>
        <div className="feature-grid">
          {features.map((f) => (
            <article key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="teams">
        <h2 className="section-title">Ligdeki Takımlar</h2>
        <div className="team-chips">
          {teams.map((t) => (
            <span key={t} className="team-chip">{t}</span>
          ))}
          <span className="team-chip muted">ve daha fazlası…</span>
        </div>
      </section>

      <section className="cta">
        <h2>Kadronu kurmaya hazır mısın?</h2>
        <p>Ücretsiz katıl, ilk haftadan itibaren puan toplamaya başla.</p>
        <Link to={joinTo} className="btn btn-primary btn-lg">
          Ücretsiz Katıl
        </Link>
      </section>
    </>
  )
}
