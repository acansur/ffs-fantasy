// Canlı maç puanları — Supabase live_scores tablosundan okuma (API isteği YOK).
// live_scores, GitHub Actions (.github/workflows/live-scores.yml) tarafından her
// 5 dakikada bir doldurulur: satır başına fixture_id + players (jsonb) —
// [{ id, name, teamId, position, minutes, base, total, parts }].
// Detay modalı, maç DEVAM EDERKEN (LIVE) oyuncunun anlık kırılımını buradan okur.

import { supabase, isSupabaseConfigured } from './supabase.js'

// Bir maçtaki (fixtureId) bir oyuncunun (playerId) canlı skor kaydını döner.
// Dönüş: { id, name, total, parts, minutes, ... } | null
export async function getLivePlayerScore(fixtureId, playerId) {
  if (!isSupabaseConfigured || !supabase || !fixtureId || playerId == null) return null
  try {
    const { data, error } = await supabase
      .from('live_scores')
      .select('players')
      .eq('fixture_id', fixtureId)
      .maybeSingle()
    if (error || !data) return null
    return (data.players || []).find((p) => p.id === playerId) || null
  } catch {
    return null
  }
}
