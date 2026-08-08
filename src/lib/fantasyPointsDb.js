// Fantasy kümülatif puan katmanı — fantasy_points (SL) / pl_test_fantasy_points (PL).
// Bir haftanın final puanını saklar; sezon toplamı = tüm haftaların Σ'sı.
// squads/squad_players/users tablolarına DOKUNMAZ. Tablo yoksa (migration
// uygulanmadıysa) hatalar YOK SAYILIR → uygulama akışı bozulmaz (toplam 0 kalır).

import { supabase, isSupabaseConfigured } from './supabase.js'

const ok = () => isSupabaseConfigured && supabase

// Tablo adına göre saveFantasyWeekPoints + loadCumulativePoints üretir.
export function makeFantasyPointsDb(table) {
  return {
    // Bir haftanın (final) puanını kaydet — idempotent upsert (user_id+week).
    async saveFantasyWeekPoints(userId, week, points) {
      if (!ok() || !userId || typeof points !== 'number' || Number.isNaN(points)) return
      try {
        await supabase
          .from(table)
          .upsert(
            { user_id: userId, week, points, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,week' }
          )
      } catch {
        /* tablo yok / geçici hata → yok say */
      }
    },

    // Kullanıcının hafta hafta puanları → { [week]: points }.
    // Sezon toplamı client'ta Σ ile hesaplanır (canlı haftayı üzerine yazabilmek için).
    async loadCumulativePoints(userId) {
      if (!ok() || !userId) return {}
      try {
        const { data, error } = await supabase.from(table).select('week, points').eq('user_id', userId)
        if (error || !data) return {}
        const map = {}
        for (const r of data) map[r.week] = r.points || 0
        return map
      } catch {
        return {}
      }
    },
  }
}

export const SL_FANTASY_POINTS = makeFantasyPointsDb('fantasy_points')
export const PL_FANTASY_POINTS = makeFantasyPointsDb('pl_test_fantasy_points')
