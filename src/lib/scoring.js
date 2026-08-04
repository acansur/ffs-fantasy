// FFS Fantasy — Puanlama motoru.
//
// Bir maçtaki her oyuncu için puan hesaplar. İki API-Football endpoint'i kullanılır:
//   /fixtures/players → oyuncu istatistikleri
//   /fixtures/events  → maç olayları (goller + oyuncu değişiklikleri)
//
// Null güvenliği: tüm istatistik alanlarında `?? 0` kullanılır.
//
// Not — /fixtures/events konvansiyonu:
//   subst olayında `player` = SAHADAN ÇIKAN, `assist` = SAHAYA GİREN oyuncu.
//   Goal olayında `team` = golü KAZANAN (fayda gören) takım (own goal dahil);
//   dolayısıyla "T takımının yediği gol" = event.team.id !== T.id olan Goal olayı.

// API-Football mevki kodu (games.position) → iç rol
const ROLE = { G: 'gk', D: 'def', M: 'mid', F: 'fwd' }

// n içindeki tam "size'lık" grup sayısı (örn. her 3 kurtarış → floor(saves/3))
const bucket = (n, size) => Math.floor((n ?? 0) / size)

// Oyuncunun sahada olduğu [giriş, çıkış] dakika aralığı ve o aralıkta takımının
// yediği gol sayısı. events → /fixtures/events dizisi.
function onPitch(playerId, teamId, games, events) {
  let subInMin = null // sahaya giriş (yedekten)
  let subOutMin = null // sahadan çıkış (değiştirildi)
  for (const e of events) {
    if (e?.type !== 'subst') continue
    const t = e?.time?.elapsed ?? 0
    if (e?.player?.id === playerId) subOutMin = t // player = çıkan
    if (e?.assist?.id === playerId) subInMin = t // assist = giren
  }
  const minutes = games?.minutes ?? 0
  // Hiç oynamadı (yedekte kaldı)
  if (minutes <= 0 && subInMin == null) return { played: false, conceded: 0, entry: 0, exit: 0 }

  const entry = subInMin != null ? subInMin : 0
  const exit = subOutMin != null ? subOutMin : entry + minutes

  let conceded = 0
  for (const e of events) {
    if (e?.type !== 'Goal') continue
    const t = e?.time?.elapsed ?? 0
    // Takımına karşı atılan gol (fayda gören = rakip) ve oyuncu sahadayken
    if (e?.team?.id !== teamId && t >= entry && t <= exit) conceded += 1
  }
  return { played: true, conceded, entry, exit }
}

// Oyuncunun kendi kalesine attığı gol sayısı (events → /fixtures/events).
// Own goal /fixtures/players istatistiklerinde yer almaz; sadece olaylarda:
//   type = "Goal", detail = "Own Goal", player = golü kendi kalesine atan.
function countOwnGoals(playerId, events) {
  let n = 0
  for (const e of events) {
    if (e?.type === 'Goal' && e?.detail === 'Own Goal' && e?.player?.id === playerId) n += 1
  }
  return n
}

// Tek bir oyuncunun puanını hesapla.
// playerObj → /fixtures/players'taki { player, statistics } nesnesi
// teamId    → oyuncunun takım id'si
// events    → /fixtures/events dizisi
// isCaptain → oyuncu kaptan mı (toplam ×2)
export function scorePlayer(playerObj, teamId, events = [], isCaptain = false) {
  const st = playerObj?.statistics?.[0] ?? {}
  const games = st.games ?? {}
  const goalsS = st.goals ?? {}
  const cards = st.cards ?? {}
  const passes = st.passes ?? {}
  const tackles = st.tackles ?? {}
  const duels = st.duels ?? {}
  const dribbles = st.dribbles ?? {}
  const fouls = st.fouls ?? {}
  const penalty = st.penalty ?? {}

  const role = ROLE[games.position] || null
  const isGK = role === 'gk'
  const isDEF = role === 'def'
  const isMID = role === 'mid'
  const isFWD = role === 'fwd'

  const parts = []
  // n = puanı doğuran ham istatistik değeri (test/inceleme için)
  const add = (key, label, pts, n) => {
    if (pts !== 0) parts.push({ key, label, pts, n })
  }

  // --- Oynama süresi ---
  const minutes = games.minutes ?? 0
  if (minutes >= 60) add('minutes', 'Oynama süresi (60+ dk)', 2, minutes)
  else if (minutes >= 1) add('minutes', 'Oynama süresi (1-59 dk)', 1, minutes)

  // --- Kartlar (ikinci sarıdan kırmızıda ikisi de uygulanır → -4) ---
  if ((cards.yellow ?? 0) > 0) add('yellow', 'Sarı kart', -1, cards.yellow ?? 0)
  if ((cards.red ?? 0) > 0) add('red', 'Kırmızı kart', -3, cards.red ?? 0)

  // --- Gol ---
  const goals = goalsS.total ?? 0
  if (goals) {
    const per = isGK ? 10 : isDEF ? 6 : isMID ? 5 : isFWD ? 4 : 0
    add('goals', 'Gol', goals * per, goals)
  }

  // --- Asist ---
  const assists = goalsS.assists ?? 0
  if (assists) {
    const per = isGK ? 6 : isDEF ? 4 : isMID ? 3 : isFWD ? 3 : 0
    add('assists', 'Asist', assists * per, assists)
  }

  // --- Clean sheet + yenilen gol (events'ten sahada olunan süre) ---
  const { conceded } = onPitch(playerObj?.player?.id, teamId, games, events)
  if (minutes >= 60 && conceded === 0) {
    const per = isGK ? 4 : isDEF ? 4 : isMID ? 1 : 0
    if (per) add('cleansheet', 'Clean sheet', per, 0)
  }
  if (conceded > 0 && (isGK || isDEF)) {
    add('conceded', 'Yenilen gol', -bucket(conceded, 2), conceded) // her 2 gol → -1
  }

  // --- Kaleciye özel ---
  if (isGK) {
    const saves = goalsS.saves ?? 0
    if (saves) add('saves', 'Kurtarış', bucket(saves, 3) * 2, saves) // her 3 → +2
    const penSaved = penalty.saved ?? 0
    if (penSaved) add('penSaved', 'Penaltı kurtardı', penSaved * 5, penSaved)
  }

  // --- Penaltı (tüm mevkiler) ---
  const penCommitted = penalty.commited ?? 0 // API alanı "commited" yazımı
  if (penCommitted) add('penCommitted', 'Penaltıya sebebiyet', penCommitted * -2, penCommitted)
  const penMissed = penalty.missed ?? 0
  if (penMissed) add('penMissed', 'Penaltı kaçırdı', penMissed * -2, penMissed)
  const penWon = penalty.won ?? 0
  if (penWon) add('penWon', 'Penaltı kazandı', penWon * 1, penWon)

  // --- Kendi kalesine gol (tüm mevkiler) — events'ten ---
  const ownGoals = countOwnGoals(playerObj?.player?.id, events)
  if (ownGoals) add('ownGoal', 'Kendi kalesine gol', ownGoals * -2, ownGoals)

  // --- Kilit pas (kaleci hariç) ---
  if (!isGK) {
    const raw = passes.key ?? 0
    const kp = bucket(raw, 3)
    if (kp) add('keyPass', 'Kilit pas', kp * 1, raw)
  }

  // --- Top kapma (kaleci ve forvet hariç) ---
  if (isDEF || isMID) {
    const raw = tackles.total ?? 0
    const tk = bucket(raw, 3)
    if (tk) add('tackles', 'Top kapma', tk * 2, raw)
  }

  // --- Kazanılan ikili mücadele (kaleci hariç) ---
  if (!isGK) {
    const raw = duels.won ?? 0
    const dw = bucket(raw, 4)
    if (dw) add('duels', 'İkili mücadele', dw * 1, raw)
  }

  // --- Başarılı dribling (orta saha + forvet) ---
  if (isMID || isFWD) {
    const raw = dribbles.success ?? 0
    const dr = bucket(raw, 2)
    if (dr) add('dribbles', 'Başarılı dribling', dr * 1, raw)
  }

  // --- İsabetli şut (orta saha + forvet) ---
  if (isMID || isFWD) {
    const raw = shotsOn(st)
    const sh = bucket(raw, 2)
    if (sh) add('shots', 'İsabetli şut', sh * 1, raw)
  }

  // --- Yapılan faul (kaleci hariç) ---
  if (!isGK) {
    const raw = fouls.committed ?? 0
    const fc = bucket(raw, 3)
    if (fc) add('fouls', 'Yapılan faul', fc * -1, raw)
  }

  // --- Ofsayt (sadece forvet) ---
  if (isFWD) {
    const raw = st.offsides ?? 0
    const off = bucket(raw, 3)
    if (off) add('offsides', 'Ofsayt', off * -1, raw)
  }

  const base = parts.reduce((s, p) => s + p.pts, 0)
  const total = isCaptain ? base * 2 : base

  return {
    id: playerObj?.player?.id,
    name: playerObj?.player?.name,
    teamId,
    position: games.position ?? null,
    role,
    minutes,
    conceded,
    captain: isCaptain,
    base,
    total,
    parts,
  }
}

// shots.on güvenli erişim (bazı yanıtlarda shots eksik olabilir)
function shotsOn(st) {
  return st?.shots?.on ?? 0
}

// Bir maçın tüm oyuncularını puanla.
// fixturePlayers → /fixtures/players yanıtı (dizi: [{ team, players }])
// events → /fixtures/events yanıtı (dizi)
// captainId → kaptan oyuncu id'si (opsiyonel)
export function scoreFixture(fixturePlayers = [], events = [], captainId = null) {
  const out = []
  for (const t of fixturePlayers) {
    const teamId = t?.team?.id
    for (const p of t?.players ?? []) {
      out.push(scorePlayer(p, teamId, events, p?.player?.id === captainId))
    }
  }
  return out
}
