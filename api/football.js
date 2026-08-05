// Vercel serverless proxy — API-Football (api-sports.io)
//
// Key SUNUCUDA kalır (API_FOOTBALL_KEY, VITE_ öneki YOK) ve tarayıcıya
// gömülmez. İstemci /api/football?path=fixtures&league=203&season=2026 çağırır.

const API_BASE = 'https://v3.football.api-sports.io'
const ALLOWED_PATHS = ['fixtures', 'fixtures/players', 'fixtures/events', 'leagues', 'teams', 'players', 'players/squads', 'players/profiles', 'standings', 'status']

export default async function handler(req, res) {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) {
    res.status(500).json({ error: 'API_FOOTBALL_KEY tanımlı değil (Vercel environment variable).' })
    return
  }

  // path query paramı hedef endpoint'i seçer; diğer paramlar API'ye iletilir.
  const { path = 'fixtures', ...params } = req.query || {}
  if (!ALLOWED_PATHS.includes(path)) {
    res.status(400).json({ error: `Geçersiz path: ${path}` })
    return
  }

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((val) => qs.append(k, val))
    else if (v != null) qs.append(k, v)
  }
  const url = `${API_BASE}/${path}${qs.toString() ? `?${qs}` : ''}`

  try {
    const apiRes = await fetch(url, { headers: { 'x-apisports-key': key } })
    const data = await apiRes.json()
    // Fikstür sık değişmez — CDN'de 1 saat cache, 1 gün stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(apiRes.status).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Proxy hatası', detail: String(err) })
  }
}
