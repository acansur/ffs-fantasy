import { useState, useEffect } from 'react'
import { initials } from '../lib/squadData.js'
import './PlayerPhoto.css'

const photoUrl = (id) => `https://media.api-sports.io/football/players/${id}.png`

// Oyuncu profil fotoğrafı; yüklenemezse takım rengi + baş harfleri fallback.
export default function PlayerPhoto({ id, name, bg, fg }) {
  const [failed, setFailed] = useState(false)
  // id değişince hata durumunu sıfırla (transfer'de yuva değişimi için)
  useEffect(() => {
    setFailed(false)
  }, [id])

  if (failed || !id) {
    return (
      <span className="pp-fallback" style={{ background: bg, color: fg }}>
        {initials(name)}
      </span>
    )
  }

  return (
    <img
      className="pp-img"
      src={photoUrl(id)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
