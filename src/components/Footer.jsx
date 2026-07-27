export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="brand-mark small">FFS</span>
        <p>© {year} FFS Fantasy Süper Lig — Tüm hakları saklıdır.</p>
      </div>
    </footer>
  )
}
