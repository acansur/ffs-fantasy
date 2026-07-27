import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page notfound">
      <h1>404</h1>
      <p>Aradığın sayfa saha dışına çıktı. ⚽</p>
      <Link to="/" className="btn btn-primary">
        Ana Sayfaya Dön
      </Link>
    </div>
  )
}
