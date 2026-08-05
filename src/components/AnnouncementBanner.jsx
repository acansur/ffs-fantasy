import { useEffect, useState } from 'react'
import { getActiveAnnouncement } from '../lib/adminDb.js'

// Site geneli duyuru bandı — admin panelinden yayınlanan aktif mesajı gösterir.
// Kullanıcı kapatabilir (oturum boyunca). Duyuru yoksa hiçbir şey render etmez.
export default function AnnouncementBanner() {
  const [ann, setAnn] = useState(null)
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    let alive = true
    getActiveAnnouncement()
      .then((a) => alive && setAnn(a))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!ann || closed) return null
  return (
    <div className="ann-banner">
      <span className="ann-ico">📢</span>
      <span className="ann-msg">{ann.message}</span>
      <button className="ann-close" onClick={() => setClosed(true)} aria-label="Kapat">×</button>
      <style>{`
        .ann-banner{display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,rgba(240,165,0,.18),rgba(240,165,0,.08));border-bottom:1px solid rgba(240,165,0,.4);color:#ffe6ad;padding:10px 18px;font-size:14px;font-weight:600}
        .ann-ico{flex:none}
        .ann-msg{flex:1;min-width:0}
        .ann-close{flex:none;background:rgba(0,0,0,.2);border:none;color:#ffe6ad;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:15px}
        .ann-close:hover{background:rgba(0,0,0,.4)}
      `}</style>
    </div>
  )
}
