// Kadro kalıcılığı — Supabase squads + squad_players tabloları.
// UI mevki kodu (KL/DF/OS/FW) ↔ DB position_type (GK/DF/MF/FW) eşlemesi POS_DB.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { POS_DB } from './squadData.js'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

// Admin panelinden konulmuş manuel hafta kilidi override'ları → { round: locked }
export async function loadWeekOverrides() {
  if (!isSupabaseConfigured || !supabase) return {}
  try {
    const { data, error } = await supabase.from('week_overrides').select('round, locked')
    if (error) return {}
    const map = {}
    for (const r of data || []) map[r.round] = r.locked
    return map
  } catch {
    return {}
  }
}

// Kadroyu kaydet: squads'e upsert (user_id+week benzersiz) + squad_players yenile.
export async function saveSquadToDb({ userId, week, formation, captainId, roster }) {
  if (!isSupabaseConfigured || !supabase || !userId) return { ok: false, skipped: true }
  try {
    const { data: squad, error: sErr } = await supabase
      .from('squads')
      .upsert(
        {
          user_id: userId,
          week,
          formation,
          captain_player_id: captainId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,week' }
      )
      .select('id')
      .single()
    if (sErr) throw sErr

    // Bu haftanın oyuncularını temizle ve yeniden yaz
    await supabase.from('squad_players').delete().eq('squad_id', squad.id)

    const rows = []
    for (const pos of POS_ORDER) {
      for (const slot of roster[pos]) {
        if (!slot.player) continue
        rows.push({
          squad_id: squad.id,
          player_id: slot.player.id,
          position_type: POS_DB[pos],
          is_starter: slot.starter,
          bench_order: slot.starter ? null : slot.benchOrder,
        })
      }
    }
    if (rows.length) {
      const { error: pErr } = await supabase.from('squad_players').insert(rows)
      if (pErr) throw pErr
    }
    return { ok: true, squadId: squad.id }
  } catch (err) {
    console.error('[FFS] Kadro kaydı hatası:', err)
    return { ok: false, error: err }
  }
}

// Kadroyu yükle → { formation, captainId, rows } | null
export async function loadSquadFromDb({ userId, week }) {
  if (!isSupabaseConfigured || !supabase || !userId) return null
  try {
    const { data: squad, error } = await supabase
      .from('squads')
      .select('id, formation, captain_player_id')
      .eq('user_id', userId)
      .eq('week', week)
      .maybeSingle()
    if (error || !squad) return null
    const { data: rows, error: pErr } = await supabase
      .from('squad_players')
      .select('player_id, position_type, is_starter, bench_order')
      .eq('squad_id', squad.id)
    if (pErr) return null
    return { formation: squad.formation, captainId: squad.captain_player_id, rows: rows || [] }
  } catch (err) {
    console.error('[FFS] Kadro yükleme hatası:', err)
    return null
  }
}
