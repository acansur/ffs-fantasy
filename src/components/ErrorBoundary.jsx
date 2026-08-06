import { Component } from 'react'

// Render sırasında bir hata olursa tüm ağaç boş sayfaya (arka plan) düşmesin;
// anlaşılır bir hata ekranı + yeniden yükleme göster.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[FFS] Render hatası:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 24px', textAlign: 'center', color: '#eaf3ec', fontFamily: "'Inter', system-ui, sans-serif" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px' }}>Bir şeyler ters gitti</h2>
          <p style={{ color: '#9cb0a4', margin: '0 0 20px' }}>Sayfa yüklenirken beklenmeyen bir hata oluştu.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: 14, color: '#3a2a00', background: 'linear-gradient(180deg,#ffcb52,#f0a500)', border: '1px solid #c98600', padding: '11px 22px', borderRadius: 11, cursor: 'pointer' }}
          >
            Yeniden Yükle
          </button>
          <pre style={{ marginTop: 22, fontSize: 12, color: '#6d8175', whiteSpace: 'pre-wrap', textAlign: 'left', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 12 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
