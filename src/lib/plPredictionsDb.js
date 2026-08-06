// /pl-test/kim-kazanir tahmin oyunu veri katmanı — AYRI tablo: pl_test_predictions.
// /kim-kazanir'ın match_predictions/prediction_points tablolarına DOKUNMAZ.
// Mantık predictionsDb.js ile birebir aynıdır; yalnızca tablo farklıdır ve hafta
// toplamı bu tablodan (points toplanarak) türetilir (ayrı cache tablosu yok).

import { supabase, isSupabaseConfigured } from './supabase.js'
import { fixtureOutcome } from './predictionsDb.js' // saf sonuç mantığı — ortak

const ok = () => isSupabaseConfigured && supabase
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])
const TABLE = 'pl_test_predictions'

// Kullanıcının o haftaki tahminlerini yükle; biten maçları puanla; toplamı döndür.
export async function loadAndScorePlWeek(userId, week, fixtures) {
  if (!ok() || !userId) return { byFixture: {}, total: 0 }
  const { data: rows, error } = await supabase
    .from(TABLE)
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
        .from(TABLE)
        .update({ is_correct: isCorrect, points: pts, updated_at: new Date().toISOString() })
        .eq('id', pred.id)
    }
  }

  const total = Object.values(byFixture).reduce((s, r) => s + (r.points || 0), 0)
  return { byFixture, total }
}

// Kullanıcının tüm haftalardaki puanları → { [week]: total } (bu tablodan toplanır)
export async function loadAllPlWeekPoints(userId) {
  if (!ok() || !userId) return {}
  const { data, error } = await supabase.from(TABLE).select('week, points').eq('user_id', userId)
  if (error) return {}
  const map = {}
  for (const r of data || []) map[r.week] = (map[r.week] || 0) + (r.points || 0)
  return map
}

// Tek maç tahmini kaydet/güncelle (deadline öncesi).
export async function savePlPrediction(userId, week, fixtureId, prediction) {
  if (!ok() || !userId) throw new Error('Supabase veya oturum yok')
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: userId, week, fixture_id: fixtureId, prediction, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,fixture_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// KimKazanir bileşenine predDb prop'u olarak geçilir (SL ile aynı arayüz).
export const PL_PRED_DB = {
  loadAndScoreWeek: loadAndScorePlWeek,
  savePrediction: savePlPrediction,
  loadAllWeekPoints: loadAllPlWeekPoints,
}
