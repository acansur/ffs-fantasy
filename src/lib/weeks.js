// Fikstür verisinden hafta meta verisi: deadline, aktif hafta, durum,
// görünürlük ve kilit hesapları.

// Tamamlanmış maç durumları
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])
// Deadline = haftanın ilk maçından 30 dakika önce
const DEADLINE_OFFSET_MS = 30 * 60 * 1000

const roundNo = (r) => Number(String(r).match(/\d+/)?.[0] ?? 0)

// fixtures → [{ round, firstMatch, lastMatch, deadline, allFinished }] (haftaya göre sıralı)
export function buildWeeks(fixtures) {
  const byRound = {}
  for (const f of fixtures) {
    if (!f?.fixture?.date) continue
    const r = roundNo(f.league?.round)
    if (!r) continue
    ;(byRound[r] ??= []).push(f)
  }
  const weeks = []
  for (const r of Object.keys(byRound).map(Number).sort((a, b) => a - b)) {
    const ms = byRound[r]
    const times = ms.map((m) => new Date(m.fixture.date).getTime())
    const first = Math.min(...times)
    const last = Math.max(...times)
    const allFinished = ms.every((m) => FINISHED.has(m.fixture.status?.short))
    weeks.push({
      round: r,
      firstMatch: first,
      lastMatch: last,
      deadline: first - DEADLINE_OFFSET_MS,
      allFinished,
    })
  }
  return weeks
}

// Aktif hafta: son maçı tamamlanmamış en yakın (ilk) hafta.
// Tüm haftalar bittiyse son hafta döner.
export function getActiveRound(weeks) {
  const active = weeks.find((w) => !w.allFinished)
  return active ? active.round : weeks[weeks.length - 1]?.round ?? 1
}

// Hafta durumu: 'finished' (bitti, puan) | 'locked' (deadline geçti, maçlar sürüyor)
// | 'open' (transfer aktif)
export function weekStatus(week, now) {
  if (!week) return 'open'
  if (week.allFinished) return 'finished'
  if (now >= week.deadline) return 'locked'
  return 'open'
}

// Görünür haftalar: aktif hafta ve öncekiler + (aktifin deadline'ı geçtiyse) bir sonraki hafta
export function getVisibleWeeks(weeks, now) {
  if (!weeks.length) return []
  const active = getActiveRound(weeks)
  const activeWeek = weeks.find((w) => w.round === active)
  const nextOpen = activeWeek && now >= activeWeek.deadline
  const maxRound = active + (nextOpen ? 1 : 0)
  return weeks.filter((w) => w.round <= maxRound)
}

// Deadline geçmiş mi (kilit)
export function isLocked(week, now) {
  return Boolean(week) && now >= week.deadline
}

// Bir takımın belirli haftadaki maçını bul (ev sahibi veya deplasman)
export function getTeamFixture(fixtures, teamName, round) {
  if (!fixtures || !teamName) return null
  return (
    fixtures.find(
      (f) =>
        roundNo(f.league?.round) === round &&
        (f.teams?.home?.name === teamName || f.teams?.away?.name === teamName)
    ) || null
  )
}

// Deadline'ı Türkiye saatiyle biçimlendir (örn. "14 Ağu 21:00")
export function formatDeadline(ms) {
  if (ms == null) return '—'
  const d = new Date(ms)
  const date = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', timeZone: 'Europe/Istanbul' })
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
  return `${date} ${time}`
}
