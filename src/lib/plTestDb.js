// /pl-test kadro kalıcılığı — AYRI tablolar: pl_test_squads + pl_test_squad_players.
// Orijinal squads/squad_players/users tablolarına KESİNLİKLE dokunulmaz.
// Anahtar: (user_id, week) — squadDb.js ile aynı arayüz (loadSquad/saveSquad).

import { supabase, isSupabaseConfigured } from './supabase.js'
import { POS_DB } from './squadData.js'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

// /pl-test admin override kullanmaz.
export async function loadPlOverrides() {
  return {}
}

export async function savePlSquad({ userId, week, formation, captainId, roster }) {
  if (!isSupabaseConfigured || !supabase || !userId) return { ok: false, skipped: true }
  try {
    const { data: squad, error: sErr } = await supabase
      .from('pl_test_squads')
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

    await supabase.from('pl_test_squad_players').delete().eq('squad_id', squad.id)

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
      const { error: pErr } = await supabase.from('pl_test_squad_players').insert(rows)
      if (pErr) throw pErr
    }
    return { ok: true, squadId: squad.id }
  } catch (err) {
    console.error('[PL] Kadro kaydı hatası:', err)
    return { ok: false, error: err }
  }
}

export async function loadPlSquad({ userId, week }) {
  if (!isSupabaseConfigured || !supabase || !userId) return null
  try {
    const { data: squads, error } = await supabase
      .from('pl_test_squads')
      .select('id, formation, captain_player_id, updated_at')
      .eq('user_id', userId)
      .eq('week', week)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (error) return null
    const squad = squads?.[0]
    if (!squad) return null
    const { data: rows, error: pErr } = await supabase
      .from('pl_test_squad_players')
      .select('player_id, position_type, is_starter, bench_order')
      .eq('squad_id', squad.id)
    if (pErr) return null
    return { formation: squad.formation, captainId: squad.captain_player_id, rows: rows || [] }
  } catch (err) {
    console.error('[PL] Kadro yükleme hatası:', err)
    return null
  }
}
