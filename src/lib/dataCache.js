// Oyuncu ve fikstür verisi için Supabase önbellek katmanı.
//
// Mantık (24 saat TTL):
//   - Veriyi çekmeden önce Supabase'e bakılır.
//   - En yeni updated_at 24 saatten yeni ise → Supabase'den okunur.
//   - Eski/yok ise → API-Football'dan çekilir, Supabase'e yazılır, döndürülür.
// Admin panelindeki "Güncelle" butonları (refreshPlayers/refreshFixtures)
// API'den zorla çekip önbelleği tazeler.
//
// Supabase yapılandırılmamışsa (yerel dev) önbellek atlanır; doğrudan API'den
// çekilir — davranış eski hâliyle aynıdır.

import { supabase, isSupabaseConfigured } from './supabase.js'
import {
  fetchSuperLigPlayers,
  fetchSuperLigFixtures,
  toAppPlayers,
  clubColors,
  clubShort,
  POSITION_VALUE,
} from './apiFootball.js'

const DAY_MS = 24 * 60 * 60 * 1000
const ok = () => isSupabaseConfigured && supabase
const isFresh = (iso) => Boolean(iso) && Date.now() - new Date(iso).getTime() < DAY_MS

/* ==================== OYUNCULAR ==================== */

// players tablosu satırı → uygulama oyuncu nesnesi (fiyat = admin değeri)
function rowToAppPlayer(r) {
  const pos = r.position === 'GK' ? 'KL' : r.position
  const c = clubColors(r.team_name)
  return {
    id: r.id,
    name: r.name,
    pos,
    club: r.team_name,
    clubShort: clubShort(r.team_name || ''),
    clubBg: c.bg,
    clubFg: c.fg,
    price: r.value != null ? Number(r.value) : POSITION_VALUE[pos] ?? 5,
  }
}

// Satırlardan kulüp listesi (Transfer kulüp filtresi için — yalnızca ad gerekli)
function teamsFromRows(rows) {
  const names = [...new Set(rows.map((r) => r.team_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'tr')
  )
  return names.map((name) => ({ name }))
}

// API ham oyuncularını players tablosuna yaz (mevcut özel değerleri KORU).
async function savePlayers(apiPlayers) {
  const nowIso = new Date().toISOString()
  const { data: existing } = await supabase.from('players').select('id, value')
  const valById = new Map((existing || []).map((p) => [p.id, p.value]))
  const seen = new Set()
  const rows = []
  for (const p of apiPlayers) {
    const pos = p.position === 'GK' ? 'KL' : p.position
    if (!['KL', 'DF', 'OS', 'FW'].includes(pos)) continue
    if (seen.has(p.id)) continue
    seen.add(p.id)
    rows.push({
      id: p.id,
      name: p.name,
      team_name: p.team,
      position: pos,
      value: valById.get(p.id) ?? POSITION_VALUE[pos] ?? 6,
      updated_at: nowIso,
    })
  }
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('players').upsert(rows.slice(i, i + CHUNK), { onConflict: 'id' })
    if (error) throw error
  }
  return { count: rows.length, updatedAt: nowIso }
}

let _playersPromise = null
export function loadCachedPlayers() {
  if (!_playersPromise) {
    _playersPromise = (async () => {
      // 1) Supabase taze mi?
      if (ok()) {
        const { data } = await supabase
          .from('players')
          .select('*')
          .order('updated_at', { ascending: false })
        if (data && data.length && isFresh(data[0].updated_at)) {
          return {
            players: data.map(rowToAppPlayer),
            teams: teamsFromRows(data),
            source: 'cache',
            updatedAt: data[0].updated_at,
          }
        }
      }
      // 2) API'den çek
      const { players: apiPlayers, teams } = await fetchSuperLigPlayers()
      // 3) Supabase'e yaz, sonra oradan (özel değerlerle) oku
      if (ok()) {
        try {
          await savePlayers(apiPlayers)
          const { data } = await supabase
            .from('players')
            .select('*')
            .order('updated_at', { ascending: false })
          if (data && data.length) {
            return {
              players: data.map(rowToAppPlayer),
              teams: teamsFromRows(data),
              source: 'api',
              updatedAt: data[0].updated_at,
            }
          }
        } catch (e) {
          console.warn('[FFS] players önbelleği yazılamadı:', e.message)
        }
      }
      // 4) Supabase yok → doğrudan API
      return { players: toAppPlayers(apiPlayers), teams, source: 'api-nodb', updatedAt: null }
    })().catch((e) => {
      _playersPromise = null // hata → yeniden denenebilsin
      throw e
    })
  }
  return _playersPromise
}

// Admin: API'den zorla çek, önbelleği tazele. onProgress(pct, label) adım adım.
export async function refreshPlayers(onProgress) {
  if (!ok()) throw new Error('Supabase yapılandırılmadı')
  onProgress?.(3, 'Takımlar alınıyor…')
  const { players } = await fetchSuperLigPlayers({
    onProgress: (done, total) =>
      onProgress?.(Math.round((done / Math.max(total, 1)) * 88) + 5, `Kadrolar ${done}/${total}`),
  })
  onProgress?.(94, 'Kaydediliyor…')
  const res = await savePlayers(players)
  _playersPromise = null // sonraki okuma tazelensin
  onProgress?.(100, 'Tamamlandı')
  return res
}

export async function getPlayersUpdatedAt() {
  if (!ok()) return null
  const { data } = await supabase
    .from('players')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.updated_at || null
}

/* ==================== FİKSTÜR ==================== */

async function saveFixtures(fixtures) {
  const nowIso = new Date().toISOString()
  const rows = fixtures
    .filter((f) => f?.fixture?.id)
    .map((f) => ({
      fixture_id: f.fixture.id,
      round: f.league?.round || null,
      match_date: f.fixture?.date || null,
      data: f,
      updated_at: nowIso,
    }))
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('fixtures').upsert(rows.slice(i, i + CHUNK), { onConflict: 'fixture_id' })
    if (error) throw error
  }
  return { count: rows.length, updatedAt: nowIso }
}

function roundsFromFixtures(fixtures) {
  return [...new Set(fixtures.map((f) => f.league?.round).filter(Boolean))].sort((a, b) => {
    const na = Number(a.match(/\d+/)?.[0] ?? 0)
    const nb = Number(b.match(/\d+/)?.[0] ?? 0)
    return na - nb
  })
}

let _fixturesPromise = null
export function loadCachedFixtures() {
  if (!_fixturesPromise) {
    _fixturesPromise = (async () => {
      // 1) Supabase taze mi?
      if (ok()) {
        const { data } = await supabase
          .from('fixtures')
          .select('data, updated_at')
          .order('updated_at', { ascending: false })
        if (data && data.length && isFresh(data[0].updated_at)) {
          const fixtures = data.map((r) => r.data).filter(Boolean)
          return {
            fixtures,
            rounds: roundsFromFixtures(fixtures),
            count: fixtures.length,
            source: 'cache',
            updatedAt: data[0].updated_at,
          }
        }
      }
      // 2) API'den çek
      const res = await fetchSuperLigFixtures()
      const fixtures = res?.fixtures || []
      // 3) Supabase'e yaz
      if (ok() && fixtures.length) {
        try {
          await saveFixtures(fixtures)
        } catch (e) {
          console.warn('[FFS] fixtures önbelleği yazılamadı:', e.message)
        }
      }
      return {
        fixtures,
        rounds: res?.rounds || roundsFromFixtures(fixtures),
        count: fixtures.length,
        source: 'api',
        updatedAt: null,
      }
    })().catch((e) => {
      _fixturesPromise = null
      throw e
    })
  }
  return _fixturesPromise
}

// Admin: fikstürü API'den zorla çek, önbelleği tazele. (Tek istek → hızlı.)
export async function refreshFixtures(onProgress) {
  if (!ok()) throw new Error('Supabase yapılandırılmadı')
  onProgress?.(15, 'Fikstür API\'den alınıyor…')
  const res = await fetchSuperLigFixtures()
  if (!res || !res.fixtures?.length) throw new Error('Fikstür alınamadı (API boş döndü)')
  onProgress?.(65, 'Kaydediliyor…')
  const saved = await saveFixtures(res.fixtures)
  _fixturesPromise = null
  onProgress?.(100, 'Tamamlandı')
  return saved
}

export async function getFixturesUpdatedAt() {
  if (!ok()) return null
  const { data } = await supabase
    .from('fixtures')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.updated_at || null
}
