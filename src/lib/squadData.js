// Kadro kurma ekranı için mevki tanımları, diziliş şemaları, kulüpler ve
// mock oyuncu verisi. (Backend eklenene kadar sabit veri.)

// Mevkiler ve renkleri
export const POSITIONS = {
  KL: { key: 'KL', label: 'Kaleci', color: '#f0a500' },    // altın
  DF: { key: 'DF', label: 'Defans', color: '#3b82f6' },    // mavi
  OS: { key: 'OS', label: 'Orta Saha', color: '#86efac' }, // yeşil açık
  FW: { key: 'FW', label: 'Forvet', color: '#ef4444' },    // kırmızı
}

// Toplam bütçe (milyon) ve içinde bulunulan hafta (mock)
export const TOTAL_BUDGET = 100.0
export const CURRENT_WEEK = 5

// Kadro son teslim tarihi (mock — ilerleyen aşamada gerçek veriyle bağlanacak)
export const DEADLINE = '14 Ağu 20:30'

// Sahadaki oyuncu bilgisi için görünüm seçenekleri
// Kadro ekranı görünüm seçenekleri (değer burada gösterilmez — o yalnızca
// transfer ekranındadır)
export const VIEWS = [
  { key: 'next', label: 'Sonraki maç' },
  { key: 'value', label: 'Oyuncu değeri' },
]

// Diziliş şemaları: sahadaki DF / OS / FW oyuncu sayıları (kaleci her zaman 1).
// Varsayılan: 4-3-3
export const FORMATIONS = {
  '4-3-3': { DF: 4, OS: 3, FW: 3 },
  '4-4-2': { DF: 4, OS: 4, FW: 2 },
  '3-5-2': { DF: 3, OS: 5, FW: 2 },
  '3-4-3': { DF: 3, OS: 4, FW: 3 },
  '4-5-1': { DF: 4, OS: 5, FW: 1 },
  '5-4-1': { DF: 5, OS: 4, FW: 1 },
}

export const DEFAULT_FORMATION = '4-4-2'

// Kadro kompozisyonu (toplam 15): mevki başına oyuncu sayısı.
// Saha (ilk 11) dizilişe göre belirlenir; yedekler = toplam − saha.
export const SQUAD_TOTALS = { KL: 2, DF: 5, OS: 5, FW: 3 }

// UI mevki kodu → veritabanı position_type eşlemesi
export const POS_DB = { KL: 'GK', DF: 'DF', OS: 'MF', FW: 'FW' }

// İlk 11 mevki limitleri: [min, max]
export const START_LIMITS = { KL: [1, 1], DF: [3, 5], OS: [3, 5], FW: [1, 3] }

// Aynı kulüpten en fazla bu kadar oyuncu alınabilir
export const MAX_PER_CLUB = 3

// Hafta seçici için toplam hafta sayısı (mock)
export const WEEK_COUNT = 8

// Varsayılan kadro (mock) — 15 oyuncu, bütçe içinde (99.0M), kulüp başına ≤3
export const DEFAULT_ROSTER = {
  KL: ['k3', 'k2'],
  DF: ['d1', 'd2', 'd3', 'd4', 'd6'],
  OS: ['m1', 'm2', 'm3', 'm5', 'm6'],
  FW: ['f4', 'f5', 'f6'],
}

// Varsayılan ilk 11 (4-4-2): 1KL + 4DF + 4OS + 2FW
export const DEFAULT_STARTERS = [
  'k3', 'd1', 'd2', 'd3', 'd4', 'm1', 'm2', 'm3', 'm5', 'f4', 'f5',
]

// İlk 11 mevki sayımından diziliş etiketi (örn. "4-4-2")
export function formationLabel(counts) {
  return `${counts.DF}-${counts.OS}-${counts.FW}`
}

// Değere göre sırala (dir: 'desc' | 'asc')
export function sortByValue(list, dir = 'desc') {
  const arr = [...list]
  return arr.sort((a, b) => (dir === 'asc' ? a.price - b.price : b.price - a.price))
}

// Bir diziliş için saha ve yedek yuva sayıları (mevki başına).
export function slotCounts(formation) {
  const f = FORMATIONS[formation]
  const field = { KL: 1, DF: f.DF, OS: f.OS, FW: f.FW }
  const bench = {
    KL: SQUAD_TOTALS.KL - field.KL,
    DF: SQUAD_TOTALS.DF - field.DF,
    OS: SQUAD_TOTALS.OS - field.OS,
    FW: SQUAD_TOTALS.FW - field.FW,
  }
  return { field, bench }
}

// Kulüpler, renkleri ve kısa kodları (dolu yuvada forma rengi olarak kullanılır)
export const CLUBS = {
  GS: { name: 'Galatasaray', short: 'GS', bg: '#a32638', fg: '#fdb913' },
  FB: { name: 'Fenerbahçe', short: 'FEN', bg: '#16326e', fg: '#ffed00' },
  BJK: { name: 'Beşiktaş', short: 'BJK', bg: '#1a1a1a', fg: '#ffffff' },
  TS: { name: 'Trabzonspor', short: 'TS', bg: '#6a1b2a', fg: '#8fd3f4' },
  IBS: { name: 'Başakşehir', short: 'İBFK', bg: '#0a2240', fg: '#f26522' },
  SAM: { name: 'Samsunspor', short: 'SAM', bg: '#c8102e', fg: '#ffffff' },
}

// Gelecek hafta fikstürü (mock) — kulüp bazlı: rakip, iç saha mı, tarih
export const FIXTURES = {
  GS: { opp: 'FB', home: true, date: '02.08' },
  FB: { opp: 'GS', home: false, date: '02.08' },
  BJK: { opp: 'TS', home: true, date: '03.08' },
  TS: { opp: 'BJK', home: false, date: '03.08' },
  IBS: { opp: 'SAM', home: true, date: '02.08' },
  SAM: { opp: 'IBS', home: false, date: '02.08' },
}

// Mock oyuncular — her mevkiden 6 oyuncu, 6 kulübe dağıtılmış.
// price: milyon cinsinden değer, points: sezon puanı, weekly: son hafta puanı.
export const PLAYERS = [
  // Kaleciler
  { id: 'k1', name: 'Uğurcan Demir', pos: 'KL', club: 'TS', points: 118, price: 5.5, weekly: 6 },
  { id: 'k2', name: 'Volkan Aydın', pos: 'KL', club: 'FB', points: 112, price: 5.0, weekly: 7 },
  { id: 'k3', name: 'Mert Yılmaz', pos: 'KL', club: 'GS', points: 105, price: 5.0, weekly: 5 },
  { id: 'k4', name: 'Ersin Kaya', pos: 'KL', club: 'BJK', points: 98, price: 4.5, weekly: 4 },
  { id: 'k5', name: 'Deniz Ak', pos: 'KL', club: 'IBS', points: 88, price: 4.0, weekly: 3 },
  { id: 'k6', name: 'Berk Şahin', pos: 'KL', club: 'SAM', points: 80, price: 4.0, weekly: 2 },

  // Defans
  { id: 'd1', name: 'Kaan Ayhan', pos: 'DF', club: 'FB', points: 140, price: 6.5, weekly: 8 },
  { id: 'd2', name: 'Abdülkerim Bal', pos: 'DF', club: 'GS', points: 135, price: 6.0, weekly: 7 },
  { id: 'd3', name: 'Stefan Kurt', pos: 'DF', club: 'BJK', points: 128, price: 6.0, weekly: 6 },
  { id: 'd4', name: 'Hüseyin Türkmen', pos: 'DF', club: 'TS', points: 120, price: 5.5, weekly: 5 },
  { id: 'd5', name: 'Emre Taş', pos: 'DF', club: 'IBS', points: 110, price: 5.0, weekly: 4 },
  { id: 'd6', name: 'Okan Deniz', pos: 'DF', club: 'SAM', points: 100, price: 4.5, weekly: 3 },

  // Orta Saha
  { id: 'm1', name: 'Hakan Çelik', pos: 'OS', club: 'GS', points: 165, price: 8.5, weekly: 10 },
  { id: 'm2', name: 'İsmail Yüksel', pos: 'OS', club: 'FB', points: 158, price: 8.0, weekly: 9 },
  { id: 'm3', name: 'Salih Demir', pos: 'OS', club: 'BJK', points: 150, price: 7.5, weekly: 8 },
  { id: 'm4', name: 'Enes Aydın', pos: 'OS', club: 'TS', points: 142, price: 7.0, weekly: 7 },
  { id: 'm5', name: 'Berkay Öz', pos: 'OS', club: 'IBS', points: 130, price: 6.0, weekly: 6 },
  { id: 'm6', name: 'Yusuf Kılıç', pos: 'OS', club: 'SAM', points: 120, price: 5.5, weekly: 5 },

  // Forvet
  { id: 'f1', name: 'Cenk Aslan', pos: 'FW', club: 'GS', points: 190, price: 11.0, weekly: 12 },
  { id: 'f2', name: 'Emre Batur', pos: 'FW', club: 'FB', points: 182, price: 10.5, weekly: 11 },
  { id: 'f3', name: 'Onur Kaplan', pos: 'FW', club: 'BJK', points: 175, price: 10.0, weekly: 9 },
  { id: 'f4', name: 'Diego Silva', pos: 'FW', club: 'TS', points: 168, price: 9.5, weekly: 8 },
  { id: 'f5', name: 'Mert Arslan', pos: 'FW', club: 'IBS', points: 150, price: 8.0, weekly: 7 },
  { id: 'f6', name: 'Ahmet Yıldız', pos: 'FW', club: 'SAM', points: 140, price: 7.5, weekly: 6 },
]

// Puanlama rehberi (mock) — sekmelere göre
export const SCORING_TABS = ['Genel', 'Kaleci', 'Defans', 'Orta Saha', 'Forvet']
export const SCORING = {
  Genel: [
    { label: 'Gol (Forvet)', pts: '+4' },
    { label: 'Gol (Orta Saha)', pts: '+5' },
    { label: 'Gol (Defans / Kaleci)', pts: '+6' },
    { label: 'Asist', pts: '+3' },
    { label: 'Sarı kart', pts: '-1' },
    { label: 'Kırmızı kart', pts: '-3' },
    { label: 'Kaptan', pts: '×2' },
  ],
  Kaleci: [
    { label: 'Temiz kale', pts: '+5' },
    { label: 'Kurtarış (başına)', pts: '+1' },
    { label: 'Gol yeme (başına)', pts: '-1' },
  ],
  Defans: [
    { label: 'Temiz kale', pts: '+3' },
    { label: 'Gol', pts: '+6' },
    { label: 'Asist', pts: '+4' },
  ],
  'Orta Saha': [
    { label: 'Gol', pts: '+5' },
    { label: 'Asist', pts: '+4' },
    { label: 'Kilit pas', pts: '+1' },
  ],
  Forvet: [
    { label: 'Gol', pts: '+4' },
    { label: 'Asist', pts: '+3' },
  ],
}

// Sıralama seçenekleri (popup)
export const SORT_OPTIONS = [
  { key: 'points-desc', label: 'Puan (azalan)' },
  { key: 'points-asc', label: 'Puan (artan)' },
  { key: 'price-desc', label: 'Fiyat (azalan)' },
  { key: 'price-asc', label: 'Fiyat (artan)' },
]

export function sortPlayers(list, sortKey) {
  const arr = [...list]
  switch (sortKey) {
    case 'points-asc':
      return arr.sort((a, b) => a.points - b.points)
    case 'price-desc':
      return arr.sort((a, b) => b.price - a.price)
    case 'price-asc':
      return arr.sort((a, b) => a.price - b.price)
    case 'points-desc':
    default:
      return arr.sort((a, b) => b.points - a.points)
  }
}

// İsim baş harfleri (popup listesinde gösterilir)
export function initials(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr')
  return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('tr')
}

// Soyadın ilk 6 harfi (saha yuvasının içinde gösterilir)
export function surname6(name) {
  const surname = name.trim().split(/\s+/).slice(-1)[0]
  return surname.slice(0, 6).toLocaleUpperCase('tr')
}

// Sadece soyad (yuvanın altındaki isim etiketi)
export function surname(name) {
  return name.trim().split(/\s+/).slice(-1)[0]
}

// Görünüm dropdown'ına göre yuvanın altındaki bilgi satırı
export function slotInfo(player, view) {
  const fx = FIXTURES[player.club]
  switch (view) {
    case 'value':
      return `${player.price.toFixed(1)}M`
    case 'weekly':
      return player.weekly != null ? `${player.weekly} P` : '—'
    case 'date':
      return fx ? fx.date : '—'
    case 'next':
    default:
      if (!fx) return '—'
      return `${fx.home ? 'vs' : '@'} ${CLUBS[fx.opp].short}`
  }
}
