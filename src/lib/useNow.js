import { useState, useEffect } from 'react'

// Gerçek zamanlı "şimdi": her `intervalMs` (varsayılan 30 sn) yeniden render
// tetikler → Date.now()'a bağlı hesaplar (deadline/kilit) sayfa açıkken güncellenir.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
