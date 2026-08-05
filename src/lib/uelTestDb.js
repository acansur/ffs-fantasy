// UEL test sayfası kadro kalıcılığı — AYRI tablolar:
//   uel_test_squads + uel_test_squad_players
// Orijinal squads/squad_players/users tablolarına KESİNLİKLE dokunulmaz.
// Anahtar: (user_id, slot) — slot = 'uel-test' | 'uel-test2'.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { POS_DB } from './squadData.js'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

export async function saveUelSquad({ userId, slot, formation, captainId, roster }) {
  if (!isSupabaseConfigured || !supabase || !userId) return { ok: false, skipped: true }
  try {
    const { data: squad, error: sErr } = await supabase
      .from('uel_test_squads')
      .upsert(
        {
          user_id: userId,
          slot,
          formation,
          captain_player_id: captainId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,slot' }
      )
      .select('id')
      .single()
    if (sErr) throw sErr

    await supabase.from('uel_test_squad_players').delete().eq('squad_id', squad.id)

    const rows = []
    for (const pos of POS_ORDER) {
      for (const s of roster[pos]) {
        if (!s.player) continue
        rows.push({
          squad_id: squad.id,
          player_id: s.player.id,
          position_type: POS_DB[pos],
          is_starter: s.starter,
          bench_order: s.starter ? null : s.benchOrder,
        })
      }
    }
    if (rows.length) {
      const { error: pErr } = await supabase.from('uel_test_squad_players').insert(rows)
      if (pErr) throw pErr
    }
    return { ok: true, squadId: squad.id }
  } catch (err) {
    console.error('[FFS] UEL test kadro kaydı hatası:', err)
    return { ok: false, error: err }
  }
}

export async function loadUelSquad({ userId, slot }) {
  if (!isSupabaseConfigured || !supabase || !userId) return null
  try {
    const { data: squad, error } = await supabase
      .from('uel_test_squads')
      .select('id, formation, captain_player_id')
      .eq('user_id', userId)
      .eq('slot', slot)
      .maybeSingle()
    if (error || !squad) return null
    const { data: rows, error: pErr } = await supabase
      .from('uel_test_squad_players')
      .select('player_id, position_type, is_starter, bench_order')
      .eq('squad_id', squad.id)
    if (pErr) return null
    return { formation: squad.formation, captainId: squad.captain_player_id, rows: rows || [] }
  } catch (err) {
    console.error('[FFS] UEL test kadro yükleme hatası:', err)
    return null
  }
}
