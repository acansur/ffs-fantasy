import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const API_BASE = 'https://v3.football.api-sports.io'
const ALLOWED_PATHS = ['fixtures', 'leagues', 'teams', 'players', 'players/squads', 'standings']

// Geliştirmede /api/football'ı yerelde çalıştırır (Vercel serverless yerine).
// Key non-VITE env'den (API_FOOTBALL_KEY) okunur — tarayıcıya gömülmez.
function apiFootballDevProxy(env) {
  return {
    name: 'dev-api-football-proxy',
    configureServer(server) {
      server.middlewares.use('/api/football', async (req, res) => {
        const send = (code, obj) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        const key = env.API_FOOTBALL_KEY || process.env.API_FOOTBALL_KEY
        if (!key) return send(500, { error: 'API_FOOTBALL_KEY tanımlı değil (.env).' })

        const url = new URL(req.originalUrl || req.url, 'http://localhost')
        const params = url.searchParams
        const path = params.get('path') || 'fixtures'
        if (!ALLOWED_PATHS.includes(path)) return send(400, { error: `Geçersiz path: ${path}` })
        params.delete('path')
        const target = `${API_BASE}/${path}${params.toString() ? `?${params}` : ''}`

        try {
          const apiRes = await fetch(target, { headers: { 'x-apisports-key': key } })
          const data = await apiRes.json()
          send(apiRes.status, data)
        } catch (err) {
          send(502, { error: 'Proxy hatası', detail: String(err) })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), apiFootballDevProxy(env)],
  }
})
