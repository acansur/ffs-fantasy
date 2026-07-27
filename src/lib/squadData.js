// Kadro kurma ekranı için mevki tanımları, diziliş şemaları, kulüpler ve
// mock oyuncu verisi. (Backend eklenene kadar sabit veri.)

// Mevkiler ve renkleri
export const POSITIONS = {
  KL: { key: 'KL', label: 'Kaleci', color: '#eab308' },   // altın/sarı
  DF: { key: 'DF', label: 'Defans', color: '#3b82f6' },   // mavi
  OS: { key: 'OS', label: 'Orta Saha', color: '#22c55e' }, // yeşil
  FW: { key: 'FW', label: 'Forvet', color: '#ef4444' },   // kırmızı
}

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

export const DEFAULT_FORMATION = '4-3-3'
export const BENCH_SIZE = 4

// Kulüpler ve renkleri (dolu oyuncu yuvasında forma rengi olarak kullanılır)
export const CLUBS = {
  GS: { name: 'Galatasaray', bg: '#a32638', fg: '#fdb913' },
  FB: { name: 'Fenerbahçe', bg: '#16326e', fg: '#ffed00' },
  BJK: { name: 'Beşiktaş', bg: '#1a1a1a', fg: '#ffffff' },
  TS: { name: 'Trabzonspor', bg: '#6a1b2a', fg: '#8fd3f4' },
  IBS: { name: 'Başakşehir', bg: '#0a2240', fg: '#f26522' },
  SAM: { name: 'Samsunspor', bg: '#c8102e', fg: '#ffffff' },
}

// Mock oyuncular — her mevkiden 6 oyuncu, 6 kulübe dağıtılmış.
// price: milyon cinsinden, points: sezon fantasy puanı.
export const PLAYERS = [
  // Kaleciler
  { id: 'k1', name: 'Uğurcan Demir', pos: 'KL', club: 'TS', points: 118, price: 5.5 },
  { id: 'k2', name: 'Volkan Aydın', pos: 'KL', club: 'FB', points: 112, price: 5.0 },
  { id: 'k3', name: 'Mert Yılmaz', pos: 'KL', club: 'GS', points: 105, price: 5.0 },
  { id: 'k4', name: 'Ersin Kaya', pos: 'KL', club: 'BJK', points: 98, price: 4.5 },
  { id: 'k5', name: 'Deniz Ak', pos: 'KL', club: 'IBS', points: 88, price: 4.0 },
  { id: 'k6', name: 'Berk Şahin', pos: 'KL', club: 'SAM', points: 80, price: 4.0 },

  // Defans
  { id: 'd1', name: 'Kaan Ayhan', pos: 'DF', club: 'FB', points: 140, price: 6.5 },
  { id: 'd2', name: 'Abdülkerim Bal', pos: 'DF', club: 'GS', points: 135, price: 6.0 },
  { id: 'd3', name: 'Stefan Kurt', pos: 'DF', club: 'BJK', points: 128, price: 6.0 },
  { id: 'd4', name: 'Hüseyin Türkmen', pos: 'DF', club: 'TS', points: 120, price: 5.5 },
  { id: 'd5', name: 'Emre Taş', pos: 'DF', club: 'IBS', points: 110, price: 5.0 },
  { id: 'd6', name: 'Okan Deniz', pos: 'DF', club: 'SAM', points: 100, price: 4.5 },

  // Orta Saha
  { id: 'm1', name: 'Hakan Çelik', pos: 'OS', club: 'GS', points: 165, price: 8.5 },
  { id: 'm2', name: 'İsmail Yüksel', pos: 'OS', club: 'FB', points: 158, price: 8.0 },
  { id: 'm3', name: 'Salih Demir', pos: 'OS', club: 'BJK', points: 150, price: 7.5 },
  { id: 'm4', name: 'Enes Aydın', pos: 'OS', club: 'TS', points: 142, price: 7.0 },
  { id: 'm5', name: 'Berkay Öz', pos: 'OS', club: 'IBS', points: 130, price: 6.0 },
  { id: 'm6', name: 'Yusuf Kılıç', pos: 'OS', club: 'SAM', points: 120, price: 5.5 },

  // Forvet
  { id: 'f1', name: 'Cenk Aslan', pos: 'FW', club: 'GS', points: 190, price: 11.0 },
  { id: 'f2', name: 'Emre Batur', pos: 'FW', club: 'FB', points: 182, price: 10.5 },
  { id: 'f3', name: 'Onur Kaplan', pos: 'FW', club: 'BJK', points: 175, price: 10.0 },
  { id: 'f4', name: 'Diego Silva', pos: 'FW', club: 'TS', points: 168, price: 9.5 },
  { id: 'f5', name: 'Mert Arslan', pos: 'FW', club: 'IBS', points: 150, price: 8.0 },
  { id: 'f6', name: 'Ahmet Yıldız', pos: 'FW', club: 'SAM', points: 140, price: 7.5 },
]

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

// İsim baş harfleri (forma dairesinde gösterilir)
export function initials(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr')
  return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('tr')
}
