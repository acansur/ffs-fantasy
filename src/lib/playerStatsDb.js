// /players2 (admin) — player_season_stats_2025 tablosu okuma/yazma.
// AYRI tablo; orijinal squads/squad_players/users'a dokunmaz.

import { supabase, isSupabaseConfigured } from './supabase.js'

// Tüm satırlar, toplam puana göre azalan (oynamamış olanlar sona)
export async function loadPlayerStats() {
  if (!isSupabaseConfigured || !supabase) return { ok: false, rows: [], reason: 'no-supabase' }
  try {
    const { data, error } = await supabase
      .from('player_season_stats_2025')
      .select('*')
      .order('total_points', { ascending: false, nullsFirst: false })
    if (error) throw error
    return { ok: true, rows: data || [] }
  } catch (err) {
    console.error('[FFS] player_season_stats_2025 yükleme hatası:', err)
    return { ok: false, rows: [], reason: err.message || String(err) }
  }
}

// Satırları upsert (player_id primary key). Büyük diziyi parça parça yazar.
export async function savePlayerStats(rows) {
  if (!isSupabaseConfigured || !supabase) return { ok: false, reason: 'no-supabase' }
  try {
    const stamped = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }))
    const CHUNK = 200
    for (let i = 0; i < stamped.length; i += CHUNK) {
      const slice = stamped.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('player_season_stats_2025')
        .upsert(slice, { onConflict: 'player_id' })
      if (error) throw error
    }
    return { ok: true, count: stamped.length }
  } catch (err) {
    console.error('[FFS] player_season_stats_2025 kaydetme hatası:', err)
    return { ok: false, reason: err.message || String(err) }
  }
}
