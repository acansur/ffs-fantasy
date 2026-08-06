// Metin normalleştirme — arama/eşleştirme için.
//
// Amaç: kullanıcı özel karakter yazmadan da sonuç bulabilsin. Hem aranan metin
// hem oyuncu adı ASCII'ye indirgenip küçük harfe çevrilerek karşılaştırılır.
// Örn. "Ozcan" → "Özcan", "caglar" → "Çağlar", "sigurdsson" → "Sigurðsson".
//
// Yöntem:
//   1) Unicode NFD ile aksanları taban harften ayır (é→e+aksan, ç→c+cedilla, ...)
//      ve ayrışan birleşen işaretleri (\p{M} = Mark kategorisi) kaldır.
//   2) NFD ile ayrışMAYAN özel harfleri (ı, ð, þ, ø, æ, œ, ß, ł, đ) elle çevir.
//   3) Küçük harfe indir.

// NFD'nin çözemediği (taban+aksan olmayan) özel Latin harfleri
const SPECIAL = {
  ı: 'i', // Türkçe noktasız i (İ ise NFD ile I'ya iner)
  ð: 'd',
  þ: 't',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
}

export function normalizeText(str = '') {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // birleşen aksan işaretlerini kaldır
    .replace(/[ıÐðÞþØøÆæŒœßŁłĐđ]/g, (ch) => SPECIAL[ch.toLowerCase()] ?? ch)
    .toLowerCase()
}
