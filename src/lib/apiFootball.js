// API-Football entegrasyonu — Vercel serverless proxy üzerinden.
// İstemci doğrudan API'ye gitmez; /api/football proxy'sine gider ve key
// sunucuda kalır (API_FOOTBALL_KEY). Docs: https://www.api-football.com

const SUPER_LIG_ID = 203 // Süper Lig (Türkiye)
const SEASON = 2026 // 2026-27 sezonu

// Sınırlı eşzamanlılıkla map (aynı anda en fazla `limit` iş çalışır)
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// API-Football mevkileri → oyun mevki kodları
const POSITION_MAP = {
  Goalkeeper: 'GK',
  Defender: 'DF',
  Midfielder: 'OS', // MF → OS (Orta Saha)
  Attacker: 'FW',
}

// Mevkiye göre varsayılan oyuncu değeri (milyon)
export const POSITION_VALUE = { KL: 6, DF: 5, OS: 6, FW: 7 }

// Gerçek kulüp renkleri (forma: bg = birincil, fg = ikincil/yazı rengi).
// API takım adları anahtar; kısa/uzun ad varyantları için alias eklendi.
const CLUB_COLORS = {
  Galatasaray: { bg: '#E30A17', fg: '#FFB300' },
  Fenerbahçe: { bg: '#002F6C', fg: '#FFD700' },
  Beşiktaş: { bg: '#1A1A1A', fg: '#F5F5F5' },
  Trabzonspor: { bg: '#7B1C2B', fg: '#1B4F8A' },
  Başakşehir: { bg: '#00337A', fg: '#F47920' },
  Konyaspor: { bg: '#006B35', fg: '#F0F0F0' },
  Alanyaspor: { bg: '#FF5500', fg: '#2D6A2D' },
  Samsunspor: { bg: '#C80000', fg: '#FAFAFA' },
  Eyüpspor: { bg: '#B80000', fg: '#FFC200' },
  Kasımpaşa: { bg: '#002855', fg: '#EBEBEB' },
  'Gençlerbirliği S.K.': { bg: '#D40000', fg: '#111111' },
  Gençlerbirliği: { bg: '#D40000', fg: '#111111' },
  'Gaziantep FK': { bg: '#1C1C1C', fg: '#CC0000' },
  Göztepe: { bg: '#F5C400', fg: '#D10000' },
  Rizespor: { bg: '#00743A', fg: '#002D6E' },
  'Çaykur Rizespor': { bg: '#00743A', fg: '#002D6E' },
  Kocaelispor: { bg: '#005C1E', fg: '#0A0A0A' },
  'Çorum FK': { bg: '#BF0000', fg: '#121212' },
  Amed: { bg: '#006630', fg: '#F8F8F8' },
  'Amed Sportif': { bg: '#006630', fg: '#F8F8F8' },
  'Erzurumspor FK': { bg: '#003A99', fg: '#F2F2F2' },
}

// Bilinmeyen takım için deterministik yedek renk
function fallbackColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 50% 32%)`
}

// Takım adından forma renkleri: gerçek kulüp rengi varsa onu, yoksa yedek
export function clubColors(name) {
  return CLUB_COLORS[name] || { bg: fallbackColor(name), fg: '#ffffff' }
}

export function clubShort(name) {
  return name.trim().slice(0, 3).toLocaleUpperCase('tr')
}

// API oyuncularını uygulama (transfer/kadro) formatına çevirir:
// pos KL/DF/OS/FW, mevkiye göre değer, kulüp = takım adı + forma stili.
export function toAppPlayers(apiPlayers) {
  const seen = new Set()
  const out = []
  for (const p of apiPlayers) {
    const pos = p.position === 'GK' ? 'KL' : p.position
    if (!['KL', 'DF', 'OS', 'FW'].includes(pos)) continue
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const colors = clubColors(p.team)
    out.push({
      id: p.id,
      name: p.name,
      pos,
      club: p.team, // takım adı = kulüp kimliği (filtre + aynı-kulüp kuralı)
      clubShort: clubShort(p.team),
      clubBg: colors.bg,
      clubFg: colors.fg,
      price: POSITION_VALUE[pos] ?? 5,
    })
  }
  return out
}

// Oyuncunun tam adı (ad + soyad). players/squads endpoint'i kısaltılmış ad
// döner ("D. Alemdar"); tam ad players/profiles'tan firstname+lastname ile alınır.
// Sonuç oyuncu id'sine göre önbelleğe alınır (aynı oyuncu için tek istek).
const _fullNameCache = new Map()
export async function fetchPlayerFullName(id) {
  if (id == null) return null
  if (_fullNameCache.has(id)) return _fullNameCache.get(id)
  try {
    const r = await fetch(`/api/football?path=players/profiles&player=${id}`)
    const d = await r.json()
    const p = d?.response?.[0]?.player
    const full = p ? [p.firstname, p.lastname].filter(Boolean).join(' ').trim() : ''
    const result = full || null
    _fullNameCache.set(id, result)
    return result
  } catch {
    return null
  }
}

// Oyuncu listesi için modül düzeyinde önbellek (promise). Böylece Takımım
// sayfasında arka planda başlatılıp Transfer'de anında kullanılabilir.
let _playersPromise = null
export function loadSuperLigPlayers() {
  if (!_playersPromise) {
    _playersPromise = fetchSuperLigPlayers().catch((e) => {
      _playersPromise = null // hata olursa yeniden denenebilsin
      throw e
    })
  }
  return _playersPromise
}

// Süper Lig 2026-27 tüm oyuncuları (kadrolar) proxy üzerinden çeker.
// Önce takımları, sonra her takımın kadrosunu çeker.
// Dönüş: { teams, players } | atar (throw) hata olursa
export async function fetchSuperLigPlayers() {
  // 1) Takımlar
  const teamsRes = await fetch(`/api/football?path=teams&league=${SUPER_LIG_ID}&season=${SEASON}`)
  const teamsData = await teamsRes.json()
  if (!teamsRes.ok) throw new Error(teamsData?.error || `Takımlar alınamadı (${teamsRes.status})`)
  const tErrs = teamsData?.errors
  if (Array.isArray(tErrs) ? tErrs.length : tErrs && Object.keys(tErrs).length) {
    throw new Error('API-Football hata: ' + JSON.stringify(tErrs))
  }
  const teams = (teamsData.response ?? [])
    .map((t) => ({ id: t.team.id, name: t.team.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  if (!teams.length) throw new Error('Takım listesi boş döndü.')

  // 2) Her takımın kadrosu. Rate limit'e takılmamak için eşzamanlılık sınırlı
  // (aynı anda en fazla 4 istek) + boş dönerse 1 kez tekrar dener.
  const fetchSquad = async (team) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(`/api/football?path=players/squads&team=${team.id}`)
        const d = await r.json()
        const players = d?.response?.[0]?.players ?? []
        if (players.length) {
          return players.map((p) => ({
            id: p.id,
            name: p.name,
            number: p.number,
            position: POSITION_MAP[p.position] || p.position || '—',
            team: team.name,
          }))
        }
      } catch {
        // yut, tekrar dene
      }
      // rate limit olabilir → artan bekleme ile tekrar dene
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)))
    }
    return []
  }

  const squads = await mapWithConcurrency(teams, 2, fetchSquad)
  const players = squads.flat()
  console.log(`[FFS] Süper Lig 2026-27 kadrolar — ${teams.length} takım, ${players.length} oyuncu`)
  return { teams, players }
}

// Süper Lig 2026-27 fikstürünü proxy üzerinden çeker.
// Dönüş: { count, rounds, fixtures } | null
export async function fetchSuperLigFixtures() {
  try {
    const url = `/api/football?path=fixtures&league=${SUPER_LIG_ID}&season=${SEASON}`
    const res = await fetch(url)
    const data = await res.json()

    if (!res.ok) {
      console.error('[FFS] Proxy/API hatası:', data?.error || res.status, data)
      return null
    }

    // API-Football hataları response gövdesinde döner (HTTP 200 olsa bile)
    const errs = data?.errors
    const hasErrors = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0
    if (hasErrors) {
      console.error('[FFS] API-Football hata:', errs)
      return null
    }

    const fixtures = data?.response ?? []
    const rounds = [...new Set(fixtures.map((f) => f.league?.round).filter(Boolean))].sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0)
      const nb = Number(b.match(/\d+/)?.[0] ?? 0)
      return na - nb
    })

    console.log(
      `[FFS] Süper Lig 2026-27 fikstürü — Toplam maç: ${fixtures.length}, Hafta sayısı: ${rounds.length}`
    )
    console.log('[FFS] Haftalar:', rounds)
    if (fixtures[0]) {
      const f = fixtures[0]
      console.log(
        '[FFS] Örnek maç:',
        `${f.teams?.home?.name} - ${f.teams?.away?.name}`,
        `| ${f.league?.round}`,
        `| ${f.fixture?.date}`
      )
    }
    console.log('[FFS] Ham fikstür verisi:', fixtures)

    return { count: fixtures.length, rounds, fixtures }
  } catch (err) {
    console.error('[FFS] Fikstür çekme hatası:', err)
    return null
  }
}
