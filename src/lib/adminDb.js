// Admin paneli veri katmanı (/admin). RLS kapalı olduğundan anon key ile
// okuma/yazma yapılır. Orijinal tablo yapısına dokunmaz; yalnızca admin
// işlemleri için okuma/yazma yapar.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { loadSuperLigPlayers, POSITION_VALUE } from './apiFootball.js'

const ok = () => isSupabaseConfigured && supabase

/* ---------- 1) Kullanıcılar ---------- */
export async function listUsers() {
  if (!ok()) return []
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, created_at, last_seen, is_admin')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

// Kullanıcıyı ve bağımlı kayıtlarını sil (squads/uel_test cascade yok → önce onlar)
export async function deleteUser(userId) {
  if (!ok()) throw new Error('Supabase yok')
  await supabase.from('squads').delete().eq('user_id', userId) // squad_players cascade
  await supabase.from('uel_test_squads').delete().eq('user_id', userId) // cascade
  const { error } = await supabase.from('users').delete().eq('id', userId)
  if (error) throw error
  return true
}

/* ---------- 2) Oyuncular ---------- */
export async function listPlayers() {
  if (!ok()) return []
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('team_name', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

export async function savePlayerValue(id, value) {
  if (!ok()) throw new Error('Supabase yok')
  const { error } = await supabase
    .from('players')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  return true
}

// API'den bu sezon kadrolarını çekip players tablosuna yazar (mevcut değerleri korur)
export async function refreshPlayersFromApi(onProgress) {
  if (!ok()) throw new Error('Supabase yok')
  onProgress?.('Kadrolar API\'den çekiliyor…')
  const { players } = await loadSuperLigPlayers()
  const existing = await listPlayers()
  const valById = new Map(existing.map((p) => [p.id, p.value]))
  const seen = new Set()
  const rows = []
  for (const p of players) {
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
      updated_at: new Date().toISOString(),
    })
  }
  onProgress?.(`${rows.length} oyuncu kaydediliyor…`)
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('players').upsert(rows.slice(i, i + CHUNK), { onConflict: 'id' })
    if (error) throw error
  }
  return rows.length
}

/* ---------- 3) Ligler ---------- */
export async function listLeagues() {
  if (!ok()) return []
  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('id, name, code, owner_id, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  if (!leagues?.length) return []
  const { data: members } = await supabase.from('league_members').select('league_id, user_id')
  const { data: users } = await supabase.from('users').select('id, username')
  const nameById = new Map((users || []).map((u) => [u.id, u.username]))
  const countByLeague = {}
  for (const m of members || []) countByLeague[m.league_id] = (countByLeague[m.league_id] || 0) + 1
  return leagues.map((l) => ({
    ...l,
    owner_name: nameById.get(l.owner_id) || '—',
    member_count: countByLeague[l.id] || 0,
  }))
}

/* ---------- 4) Sistem durumu ---------- */
const COUNT_TABLES = [
  'users', 'squads', 'squad_players', 'uel_test_squads', 'uel_test_squad_players',
  'player_season_stats_2025', 'players', 'leagues', 'league_members', 'announcements', 'week_overrides',
]
export async function getTableCounts() {
  if (!ok()) return []
  const out = []
  for (const t of COUNT_TABLES) {
    try {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
      out.push({ table: t, count: error ? null : count })
    } catch {
      out.push({ table: t, count: null })
    }
  }
  return out
}

// API-Football kota durumu (/status)
export async function getApiStatus() {
  try {
    const r = await fetch('/api/football?path=status')
    const d = await r.json()
    const req = d?.response?.requests
    const sub = d?.response?.subscription
    if (!req) return { ok: false, error: JSON.stringify(d?.errors || d) }
    return {
      ok: true,
      limit_day: req.limit_day,
      current: req.current,
      remaining: (req.limit_day ?? 0) - (req.current ?? 0),
      plan: sub?.plan,
      active: sub?.active,
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

/* ---------- 5) Duyuru ---------- */
export async function getActiveAnnouncement() {
  if (!ok()) return null
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data || null
}

export async function setAnnouncement(message) {
  if (!ok()) throw new Error('Supabase yok')
  await supabase.from('announcements').update({ active: false }).eq('active', true)
  const msg = (message || '').trim()
  if (!msg) return null // boş → sadece temizle
  const { data, error } = await supabase.from('announcements').insert({ message: msg, active: true }).select().single()
  if (error) throw error
  return data
}

/* ---------- 6) Hafta override ---------- */
export async function getWeekOverrides() {
  if (!ok()) return []
  const { data, error } = await supabase.from('week_overrides').select('*').order('round', { ascending: true })
  if (error) throw error
  return data || []
}

// locked null → override kaldır (otomatik); true/false → ayarla
export async function setWeekOverride(round, locked) {
  if (!ok()) throw new Error('Supabase yok')
  if (locked === null) {
    const { error } = await supabase.from('week_overrides').delete().eq('round', round)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('week_overrides')
    .upsert({ round, locked, updated_at: new Date().toISOString() }, { onConflict: 'round' })
  if (error) throw error
}
