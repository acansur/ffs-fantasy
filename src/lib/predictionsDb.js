// "Kim Kazanır?" tahmin oyunu veri katmanı — match_predictions + prediction_points.
// Fantasy (squads/squad_players) tablolarından tamamen bağımsızdır.

import { supabase, isSupabaseConfigured } from './supabase.js'

const ok = () => isSupabaseConfigured && supabase
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])

// Tamamlanmış maçın sonucu → 'home' | 'draw' | 'away' | null
export function fixtureOutcome(fx) {
  const h = fx?.goals?.home
  const a = fx?.goals?.away
  if (h == null || a == null) return null
  return h > a ? 'home' : h < a ? 'away' : 'draw'
}

// Kullanıcının o haftaki tahminlerini yükle; biten maçları puanla; toplamı yaz.
// Dönüş: { byFixture: { [fixture_id]: row }, total }
export async function loadAndScoreWeek(userId, week, fixtures) {
  if (!ok() || !userId) return { byFixture: {}, total: 0 }
  const { data: rows, error } = await supabase
    .from('match_predictions')
    .select('*')
    .eq('user_id', userId)
    .eq('week', week)
  if (error) return { byFixture: {}, total: 0 }

  const byFixture = {}
  for (const r of rows || []) byFixture[r.fixture_id] = r

  // Biten maçları puanla (idempotent — yalnızca değişenleri güncelle)
  for (const fx of fixtures) {
    const fid = fx.fixture?.id
    const pred = byFixture[fid]
    if (!pred) continue
    if (!FINISHED.has(fx.fixture?.status?.short)) continue
    const out = fixtureOutcome(fx)
    if (out == null) continue
    const isCorrect = pred.prediction === out
    const pts = isCorrect ? 1 : 0
    if (pred.is_correct !== isCorrect || pred.points !== pts) {
      pred.is_correct = isCorrect
      pred.points = pts
      await supabase
        .from('match_predictions')
        .update({ is_correct: isCorrect, points: pts, updated_at: new Date().toISOString() })
        .eq('id', pred.id)
    }
  }

  const total = Object.values(byFixture).reduce((s, r) => s + (r.points || 0), 0)
  await supabase
    .from('prediction_points')
    .upsert({ user_id: userId, week, total_points: total, updated_at: new Date().toISOString() }, { onConflict: 'user_id,week' })

  return { byFixture, total }
}

// Kullanıcının tüm haftalardaki tahmin puanları → { [week]: total } (yalnızca gösterim)
export async function loadAllWeekPoints(userId) {
  if (!ok() || !userId) return {}
  const { data, error } = await supabase
    .from('prediction_points')
    .select('week, total_points')
    .eq('user_id', userId)
  if (error) return {}
  const map = {}
  for (const r of data || []) map[r.week] = r.total_points
  return map
}

// Tek maç tahmini kaydet/güncelle (deadline öncesi). Dönüş: satır
export async function savePrediction(userId, week, fixtureId, prediction) {
  if (!ok() || !userId) throw new Error('Supabase veya oturum yok')
  const { data, error } = await supabase
    .from('match_predictions')
    .upsert(
      { user_id: userId, week, fixture_id: fixtureId, prediction, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,fixture_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}
