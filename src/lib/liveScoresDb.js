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

// Bir haftadaki fixture id kümesi için TÜM live_scores satırlarını tek istekte
// okur (kart puanları için — API isteği YOK). Kadrodaki canlı maçların oyuncu
// puanları buradan gelir; GitHub Actions cron'u tabloyu 5 dakikada bir tazeler.
// Dönüş: Map<fixture_id, { players, status, elapsed, home_goals, away_goals, updated_at }>
export async function getLiveScoresByFixtures(fixtureIds) {
  const ids = [...(fixtureIds || [])].filter((x) => x != null)
  if (!isSupabaseConfigured || !supabase || ids.length === 0) return new Map()
  try {
    const { data, error } = await supabase
      .from('live_scores')
      .select('fixture_id, status, elapsed, home_goals, away_goals, players, updated_at')
      .in('fixture_id', ids)
    if (error || !data) return new Map()
    return new Map(data.map((r) => [r.fixture_id, r]))
  } catch {
    return new Map()
  }
}
