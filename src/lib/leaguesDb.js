// Ligler veri katmanı — leagues / league_members / league_blacklist.
// Genel Lig ve Favori Takım Ligi SANAL'dır (tablo yok); özel ligler burada tutulur.
// Sıralama fantasy_points'ten, joker sayısı squad_transfers'ten hesaplanır.
// RLS kapalı → anon client ile doğrudan okuma/yazma (prototip).

import { supabase, isSupabaseConfigured } from './supabase.js'

const ok = () => isSupabaseConfigured && supabase

export const MAX_OWNED = 5 // 1 kişi en fazla 5 lig kurabilir
export const MAX_MEMBERSHIPS = 15 // toplam 15 özel ligde olabilir (kurduğu + katıldığı)

// Karışması kolay karakterler (0/O, 1/I) hariç 5 haneli kod
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randCode() {
  let s = ''
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}
async function uniqueCode() {
  for (let i = 0; i < 12; i++) {
    const c = randCode()
    const { data } = await supabase.from('leagues').select('id').eq('code', c).maybeSingle()
    if (!data) return c
  }
  throw new Error('Benzersiz kod üretilemedi, tekrar deneyin.')
}

async function countExact(table, filters) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
  const { count } = await q
  return count || 0
}

// Kullanıcının üye olduğu ÖZEL lig sayısı (kurduğu + katıldığı)
async function membershipCount(userId) {
  return countExact('league_members', { user_id: userId })
}

/* ---------- Lig kurma ---------- */
// openWeek: geçmiş dahil DEĞİLSE milat = kuruluş anındaki ilk açık hafta.
export async function createLeague({ userId, name, personCount, includePastPoints, openWeek }) {
  if (!ok() || !userId) return { ok: false, error: 'Supabase yok' }
  const nm = (name || '').trim()
  if (!nm) return { ok: false, error: 'Lig adı zorunludur.' }

  const owned = await countExact('leagues', { owner_id: userId })
  if (owned >= MAX_OWNED) return { ok: false, error: `En fazla ${MAX_OWNED} lig kurabilirsiniz.` }
  const memberships = await membershipCount(userId)
  if (memberships >= MAX_MEMBERSHIPS) return { ok: false, error: `En fazla ${MAX_MEMBERSHIPS} özel ligde olabilirsiniz.` }

  const milestone = includePastPoints ? 1 : (openWeek || 1)
  const pc = personCount != null && personCount !== '' ? Number(personCount) : null
  try {
    const code = await uniqueCode()
    const { data: league, error } = await supabase
      .from('leagues')
      .insert({
        name: nm,
        code,
        owner_id: userId,
        person_count: pc && pc > 0 ? pc : null,
        include_past_points: !!includePastPoints,
        milestone_week: milestone,
      })
      .select('*')
      .single()
    if (error) throw error
    // Kurucu otomatik üye
    await supabase.from('league_members').insert({ league_id: league.id, user_id: userId })
    return { ok: true, league }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

/* ---------- Lige katılma ---------- */
export async function joinLeague({ userId, code }) {
  if (!ok() || !userId) return { ok: false, error: 'Supabase yok' }
  const c = (code || '').trim().toUpperCase()
  if (c.length !== 5) return { ok: false, error: '5 haneli kod girin.' }

  const { data: league } = await supabase.from('leagues').select('*').eq('code', c).maybeSingle()
  if (!league) return { ok: false, error: 'Bu koda ait lig bulunamadı.' }

  // Kara liste
  const { data: banned } = await supabase
    .from('league_blacklist').select('id').eq('league_id', league.id).eq('user_id', userId).maybeSingle()
  if (banned) return { ok: false, error: 'Bu ligden çıkarıldınız, tekrar katılamazsınız.' }

  // Zaten üye mi
  const { data: already } = await supabase
    .from('league_members').select('user_id').eq('league_id', league.id).eq('user_id', userId).maybeSingle()
  if (already) return { ok: false, error: 'Zaten bu ligin üyesisiniz.', league }

  // Kişi sayısı dolu mu
  if (league.person_count) {
    const members = await countExact('league_members', { league_id: league.id })
    if (members >= league.person_count) return { ok: false, error: 'Bu lig maksimum kişi sayısına ulaştı.' }
  }
  // 15 özel lig limiti
  const memberships = await membershipCount(userId)
  if (memberships >= MAX_MEMBERSHIPS) return { ok: false, error: `En fazla ${MAX_MEMBERSHIPS} özel ligde olabilirsiniz.` }

  const { error } = await supabase.from('league_members').insert({ league_id: league.id, user_id: userId })
  if (error) return { ok: false, error: error.message }
  return { ok: true, league }
}

/* ---------- Ligden çıkma / silme / çıkarma ---------- */
export async function leaveLeague({ userId, leagueId, ownerId }) {
  if (!ok()) return { ok: false, error: 'Supabase yok' }
  if (ownerId === userId) return { ok: false, error: 'Lig admini ligden çıkamaz; ligi silebilir.' }
  const { error } = await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteLeague({ userId, leagueId, ownerId }) {
  if (!ok()) return { ok: false, error: 'Supabase yok' }
  if (ownerId !== userId) return { ok: false, error: 'Yalnızca lig admini silebilir.' }
  const { error } = await supabase.from('leagues').delete().eq('id', leagueId) // members/blacklist cascade
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Üyeyi çıkar + kara listeye ekle (bir daha giremez)
export async function kickMember({ adminId, leagueId, ownerId, memberId }) {
  if (!ok()) return { ok: false, error: 'Supabase yok' }
  if (ownerId !== adminId) return { ok: false, error: 'Yalnızca lig admini çıkarabilir.' }
  if (memberId === ownerId) return { ok: false, error: 'Admin kendini çıkaramaz.' }
  await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', memberId)
  await supabase.from('league_blacklist').upsert(
    { league_id: leagueId, user_id: memberId },
    { onConflict: 'league_id,user_id' }
  )
  return { ok: true }
}

// Kişi sayısını YALNIZCA artır
export async function increasePersonCount({ adminId, leagueId, ownerId, newCount, memberCount }) {
  if (!ok()) return { ok: false, error: 'Supabase yok' }
  if (ownerId !== adminId) return { ok: false, error: 'Yalnızca lig admini değiştirebilir.' }
  const n = Number(newCount)
  if (!n || n < (memberCount || 1)) return { ok: false, error: 'Kişi sayısı yalnızca artırılabilir.' }
  const { error } = await supabase.from('leagues').update({ person_count: n }).eq('id', leagueId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* ---------- Okuma ---------- */
// Kullanıcının üye olduğu özel ligler (+ üye sayısı + admin mi)
export async function listMyLeagues(userId) {
  if (!ok() || !userId) return []
  const { data: mem } = await supabase.from('league_members').select('league_id').eq('user_id', userId)
  const ids = (mem || []).map((m) => m.league_id)
  if (!ids.length) return []
  const { data: leagues } = await supabase.from('leagues').select('*').in('id', ids)
  const { data: allMem } = await supabase.from('league_members').select('league_id').in('league_id', ids)
  const counts = {}
  for (const m of allMem || []) counts[m.league_id] = (counts[m.league_id] || 0) + 1
  return (leagues || [])
    .map((l) => ({ ...l, member_count: counts[l.id] || 0, is_owner: l.owner_id === userId }))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

// Bir ligin üyeleri (user id + username + favorite_team)
export async function getLeagueMembers(leagueId) {
  if (!ok()) return []
  const { data: mem } = await supabase.from('league_members').select('user_id').eq('league_id', leagueId)
  const ids = (mem || []).map((m) => m.user_id)
  if (!ids.length) return []
  const { data: users } = await supabase.from('users').select('id, username, favorite_team').in('id', ids)
  return users || []
}

// Sıralama için ham veri: tüm kullanıcılar + fantasy_points + squad_transfers.
// Prototip ölçeğinde tek seferde çekilir; JS'te liglere göre süzülür/toplanır.
export async function loadStandingsData() {
  if (!ok()) return { users: [], ptsRows: [], trRows: [] }
  const [{ data: users }, { data: ptsRows }, { data: trRows }] = await Promise.all([
    supabase.from('users').select('id, username, favorite_team'),
    supabase.from('fantasy_points').select('user_id, week, points'),
    supabase.from('squad_transfers').select('user_id, week, transfer_count'),
  ])
  return { users: users || [], ptsRows: ptsRows || [], trRows: trRows || [] }
}

// Verilen kullanıcı alt kümesi için sıralama hesapla.
// week=null → milestone'dan itibaren kümülatif; week=N → yalnız o hafta.
export function computeStandings(userSubset, { ptsRows, trRows }, { milestoneWeek = 1, week = null } = {}) {
  const pts = {}
  const jok = {}
  for (const r of ptsRows || []) {
    if (week != null ? r.week !== week : r.week < milestoneWeek) continue
    pts[r.user_id] = (pts[r.user_id] || 0) + (r.points || 0)
  }
  for (const r of trRows || []) {
    if (week != null && r.week !== week) continue // "tüm haftalar"da toplam joker
    jok[r.user_id] = (jok[r.user_id] || 0) + (r.transfer_count || 0)
  }
  return (userSubset || [])
    .map((u) => ({ id: u.id, username: u.username, points: pts[u.id] || 0, jokers: jok[u.id] || 0 }))
    .sort((a, b) => b.points - a.points || (a.username || '').localeCompare(b.username || '', 'tr'))
}
