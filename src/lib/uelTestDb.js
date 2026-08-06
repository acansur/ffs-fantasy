// UEL test sayfası kadro kalıcılığı — AYRI tablolar:
//   uel_test_squads + uel_test_squad_players
// Orijinal squads/squad_players/users tablolarına KESİNLİKLE dokunulmaz.
// Anahtar: (user_id, slot) — slot = 'uel-test' | 'uel-test2'.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { POS_DB } from './squadData.js'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const DB_TO_POS = { GK: 'KL', DF: 'DF', MF: 'OS', FW: 'FW' }

// Kaydedilmiş satırlardan UEL kadrosunu yeniden kur — formation'a BAĞLI DEĞİL.
// (squadStore.rebuildRoster slotCounts(FORMATIONS[formation]) kullanır; "5-3-2"
// gibi geçerli ama map'te olmayan bir diziliş undefined→çökme yaratıyordu.)
// Burada yapı doğrudan kayıttaki is_starter/bench_order'dan kurulur.
export function rebuildUelRoster(rows, playersById) {
  const poolKeys = Object.keys(playersById)
  console.log('[UEL] rebuild START: rows=%d, havuz anahtar sayısı=%d', (rows || []).length, poolKeys.length)
  console.log('[UEL] havuz örnek anahtarlar:', poolKeys.slice(0, 8))
  const byPos = { KL: [], DF: [], OS: [], FW: [] }
  let found = 0
  let missing = 0
  for (const r of rows || []) {
    const pos = DB_TO_POS[r.position_type]
    if (!pos) {
      console.warn('[UEL] rebuild: bilinmeyen position_type=%o → satır atlandı', r.position_type)
      continue
    }
    const key = String(r.player_id)
    const player = playersById[key] || null
    if (player) found += 1
    else {
      missing += 1
      if (missing <= 6)
        console.warn('[UEL] BULUNAMADI: player_id=%o (tip:%s) key="%s" pos=%s', r.player_id, typeof r.player_id, key, r.position_type)
    }
    byPos[pos].push({ player, starter: !!r.is_starter, benchOrder: r.is_starter ? null : r.bench_order })
  }
  console.log('[UEL] rebuild SONUÇ: eşleşen=%d, eşleşmeyen=%d / %d', found, missing, (rows || []).length)
  const roster = {}
  for (const pos of POS_ORDER) {
    const starters = byPos[pos].filter((e) => e.starter)
    const bench = byPos[pos]
      .filter((e) => !e.starter)
      .sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99))
    roster[pos] = [...starters, ...bench]
  }
  return roster
}

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
    console.log('[UEL] SAVE user_id=%s slot=%s → squad_id=%s players=%d', userId, slot, squad.id, rows.length)
    return { ok: true, squadId: squad.id }
  } catch (err) {
    console.error('[FFS] UEL test kadro kaydı hatası:', err)
    return { ok: false, error: err }
  }
}

export async function loadUelSquad({ userId, slot }) {
  if (!isSupabaseConfigured || !supabase || !userId) return null
  try {
    // maybeSingle YERİNE order+limit: olası duplicate satırlarda hata vermez,
    // en güncel kaydı alır.
    const { data: squads, error } = await supabase
      .from('uel_test_squads')
      .select('id, formation, captain_player_id, updated_at')
      .eq('user_id', userId)
      .eq('slot', slot)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (error) {
      console.error('[UEL] load squad error', error)
      return null
    }
    const squad = squads?.[0]
    console.log('[UEL] LOAD user_id=%s slot=%s → squad_id=%s', userId, slot, squad?.id ?? 'YOK')
    if (!squad) return null
    const { data: rows, error: pErr } = await supabase
      .from('uel_test_squad_players')
      .select('player_id, position_type, is_starter, bench_order')
      .eq('squad_id', squad.id)
    if (pErr) {
      console.error('[UEL] load players error', pErr)
      return null
    }
    console.log('[UEL] LOAD player rows=%d', (rows || []).length)
    console.log(
      '[UEL] LOAD kayıtlı player_id örnek:',
      (rows || []).slice(0, 8).map((x) => `${x.player_id}(${typeof x.player_id})/${x.position_type}/${x.is_starter ? 'st' : 'b' + x.bench_order}`)
    )
    return { formation: squad.formation, captainId: squad.captain_player_id, rows: rows || [] }
  } catch (err) {
    console.error('[FFS] UEL test kadro yükleme hatası:', err)
    return null
  }
}
