import { isSupabaseConfigured } from '../lib/supabase.js'

// Örnek sıralama verisi — Supabase bağlandığında gerçek verilerle değişecek.
const ornekSiralama = [
  { sira: 1, menajer: 'Ahmet Y.', takim: 'Kartal FC', puan: 1842 },
  { sira: 2, menajer: 'Elif K.', takim: 'Yıldızlar SK', puan: 1815 },
  { sira: 3, menajer: 'Mert D.', takim: 'Boğaziçi United', puan: 1798 },
  { sira: 4, menajer: 'Zeynep A.', takim: 'Anadolu Gücü', puan: 1776 },
  { sira: 5, menajer: 'Can B.', takim: 'Deniz Yıldızı', puan: 1751 },
]

export default function Lig() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Lig Sıralaması</h1>
        <p className="page-sub">Genel klasman — Haftalık güncellenir.</p>
      </header>

      {!isSupabaseConfigured && (
        <div className="notice">
          ⚠️ Supabase henüz bağlanmadı. Aşağıdaki tablo örnek verilerle gösteriliyor.
          Gerçek sıralama için <code>.env</code> dosyasını doldur.
        </div>
      )}

      <div className="table-wrap">
        <table className="ranking">
          <thead>
            <tr>
              <th>#</th>
              <th>Menajer</th>
              <th>Takım</th>
              <th>Puan</th>
            </tr>
          </thead>
          <tbody>
            {ornekSiralama.map((r) => (
              <tr key={r.sira}>
                <td className="rank">{r.sira}</td>
                <td>{r.menajer}</td>
                <td>{r.takim}</td>
                <td className="points">{r.puan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
