// Yalnızca admin kullanıcıların erişebileceği rotalar için sarmalayıcı.
// Admin değilse (veya giriş yapılmamışsa) ana sayfaya yönlendirir.
// Admin panelindeki aynı kontrolle tutarlıdır (user.is_admin).

import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function RequireAdmin({ children }) {
  const { user } = useAuth()
  if (!user || !user.is_admin) return <Navigate to="/" replace />
  return children
}
