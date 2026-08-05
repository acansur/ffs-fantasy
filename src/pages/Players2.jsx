import { useEffect, useMemo, useState } from 'react'
import { loadPlayerStats, savePlayerStats } from '../lib/playerStatsDb.js'
import { computeAllPlayerStats, CAT } from '../lib/playerStats2025.js'
import './Players2.css'

const POS_LABEL = { KL: 'Kaleci', DF: 'Defans', OS: 'Orta Saha', FW: 'Forvet' }
const POS_OPTS = [null, 'KL', 'DF', 'OS', 'FW']
const CAT_ORDER = Object.values(CAT) // detay panelinde tutarlı sıra

function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCSV(filename, rows2d) {
  const csv = rows2d.map((r) => r.map(csvEscape).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Players2() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState(null)
  const [msg, setMsg] = useState('')
  const [detail, setDetail] = useState(null)

  // Filtreler
  const [posF, setPosF] = useState(null)
  const [teamF, setTeamF] = useState('')
  const [minPts, setMinPts] = useState('')
  const [minMatches, setMinMatches] = useState('')
  const [minPpm, setMinPpm] = useState('')

  const reload = async () => {
    setLoading(true)
    const res = await loadPlayerStats()
    setRows(res.rows)
    if (!res.ok && res.reason === 'no-supabase') setMsg('⚠ Supabase yapılandırılmadı — veri okunamıyor.')
    setLoading(false)
  }
  useEffect(() => {
    reload()
  }, [])

  const teams = useMemo(
    () => [...new Set(rows.map((r) => r.team_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [rows]
  )

  const filtered = useMemo(() => {
    const nPts = minPts === '' ? null : Number(minPts)
    const nMatch = minMatches === '' ? null : Number(minMatches)
    const nPpm = minPpm === '' ? null : Number(minPpm)
    return rows
      .filter((r) => {
        if (posF && r.position !== posF) return false
        if (teamF && r.team_name !== teamF) return false
        if (nPts != null && !(Number(r.total_points ?? -Infinity) >= nPts)) return false
        if (nMatch != null && !(Number(r.matches_played ?? 0) >= nMatch)) return false
        if (nPpm != null && !(Number(r.points_per_match ?? -Infinity) >= nPpm)) return false
        return true
      })
      .sort((a, b) => (b.total_points ?? -Infinity) - (a.total_points ?? -Infinity))
  }, [rows, posF, teamF, minPts, minMatches, minPpm])

  const onUpdate = async () => {
    if (updating) return
    setUpdating(true)
    setMsg('')
    setProgress({ phase: 'start' })
    try {
      const computed = await computeAllPlayerStats(setProgress)
      setProgress({ phase: 'saving' })
      const saved = await savePlayerStats(computed)
      if (!saved.ok) setMsg('⚠ Kaydetme başarısız: ' + saved.reason)
      else setMsg(`✓ Güncellendi — ${saved.count} oyuncu kaydedildi.`)
      await reload()
    } catch (e) {
      setMsg('⚠ Hata: ' + (e.message || String(e)))
    } finally {
      setUpdating(false)
      setProgress(null)
    }
  }

  const exportAll = () => {
    const head = ['#', 'player_id', 'İsim', 'Takım', 'Mevki', 'Maç', 'Toplam Puan', 'Maç Başına Puan']
    const body = filtered.map((r, i) => [
      i + 1,
      r.player_id,
      r.player_name,
      r.team_name,
      r.position,
      r.matches_played ?? 0,
      r.total_points ?? '',
      r.points_per_match ?? '',
    ])
    downloadCSV('players2_2025.csv', [head, ...body])
  }

  const exportPlayer = (r) => {
    const head = [['İsim', r.player_name], ['Takım', r.team_name], ['Mevki', r.position], ['Maç', r.matches_played ?? 0], ['Toplam Puan', r.total_points ?? ''], ['Maç Başına Puan', r.points_per_match ?? '']]
    const catHead = ['Kategori', 'Toplam Puan', 'Maç Sayısı', 'Maç Başına Puan']
    const bd = r.stats_breakdown || {}
    const catRows = CAT_ORDER.filter((c) => bd[c]).map((c) => [c, bd[c].points, bd[c].matches, bd[c].per_match])
    downloadCSV(`player_${r.player_id}_${(r.player_name || '').replace(/\s+/g, '_')}.csv`, [...head, [], catHead, ...catRows])
  }

  const progressText = () => {
    if (!progress) return ''
    if (progress.phase === 'squads') return 'Bu sezon kadroları çekiliyor…'
    if (progress.phase === 'fixtures') return 'Geçen sezon fikstürü çekiliyor…'
    if (progress.phase === 'matches') return `Maçlar işleniyor: ${progress.done}/${progress.total}`
    if (progress.phase === 'aggregate') return 'Puanlar toplanıyor…'
    if (progress.phase === 'saving') return 'Supabase\'e kaydediliyor…'
    return 'Başlatılıyor…'
  }

  return (
    <div className="p2">
      <div className="p2-head">
        <div>
          <h1 className="p2-title">Oyuncu Performans — Geçen Sezon (2025-26)</h1>
          <p className="p2-sub">
            Bu sezon Süper Lig kadrosundaki her oyuncunun geçen sezon <code>scoring.js</code> ile hesaplanmış puanı
            (kaptan bonusu yok). Gizli admin sayfası.
          </p>
        </div>
        <div className="p2-actions">
          <button className="p2-btn p2-btn-gold" onClick={onUpdate} disabled={updating}>
            {updating ? 'Güncelleniyor…' : 'Veriyi Güncelle'}
          </button>
          <button className="p2-btn" onClick={exportAll} disabled={!filtered.length}>CSV İndir</button>
        </div>
      </div>

      {updating && <div className="p2-progress">⏳ {progressText()}</div>}
      {msg && <div className={`p2-msg${msg.startsWith('⚠') ? ' err' : ' ok'}`}>{msg}</div>}

      {/* Filtreler */}
      <div className="p2-filters">
        <label>
          <span>Mevki</span>
          <select value={posF ?? ''} onChange={(e) => setPosF(e.target.value || null)}>
            {POS_OPTS.map((p) => (
              <option key={p ?? 'all'} value={p ?? ''}>{p ? `${p} · ${POS_LABEL[p]}` : 'Tümü'}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Takım</span>
          <select value={teamF} onChange={(e) => setTeamF(e.target.value)}>
            <option value="">Tümü</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          <span>Toplam puan ≥</span>
          <input type="number" value={minPts} onChange={(e) => setMinPts(e.target.value)} placeholder="—" />
        </label>
        <label>
          <span>Maç sayısı ≥</span>
          <input type="number" value={minMatches} onChange={(e) => setMinMatches(e.target.value)} placeholder="—" />
        </label>
        <label>
          <span>Maç başına puan ≥</span>
          <input type="number" step="0.1" value={minPpm} onChange={(e) => setMinPpm(e.target.value)} placeholder="—" />
        </label>
        <div className="p2-count">{filtered.length} oyuncu</div>
      </div>

      {/* Tablo */}
      {loading ? (
        <div className="p2-note">Yükleniyor…</div>
      ) : filtered.length === 0 ? (
        <div className="p2-note">Kayıt yok. "Veriyi Güncelle" ile API'den çekip kaydedin.</div>
      ) : (
        <div className="p2-tablewrap">
          <table className="p2-table">
            <thead>
              <tr>
                <th className="c-rank">#</th>
                <th>İsim</th>
                <th>Takım</th>
                <th>Mevki</th>
                <th className="c-num">Maç</th>
                <th className="c-num">Toplam Puan</th>
                <th className="c-num">Maç Başına</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const played = (r.matches_played ?? 0) > 0
                return (
                  <tr key={r.player_id} className="p2-row" onClick={() => setDetail(r)}>
                    <td className="c-rank">{i + 1}</td>
                    <td className="c-name">{r.player_name}</td>
                    <td>{r.team_name}</td>
                    <td><span className={`p2-pos pos-${r.position}`}>{r.position}</span></td>
                    <td className="c-num">{r.matches_played ?? 0}</td>
                    <td className="c-num strong">{played ? r.total_points : '—'}</td>
                    <td className="c-num">{played ? r.points_per_match : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detay paneli */}
      {detail && (
        <div className="p2-overlay" onClick={() => setDetail(null)}>
          <div className="p2-detail" onClick={(e) => e.stopPropagation()}>
            <button className="p2-close" onClick={() => setDetail(null)}>×</button>
            <div className="p2-d-head">
              <h2>{detail.player_name}</h2>
              <p>{detail.team_name} · <span className={`p2-pos pos-${detail.position}`}>{detail.position}</span></p>
              <div className="p2-d-totals">
                <span><b>{detail.matches_played ?? 0}</b> maç</span>
                <span><b>{detail.total_points ?? '—'}</b> puan</span>
                <span><b>{detail.points_per_match ?? '—'}</b> maç başına</span>
              </div>
            </div>
            {(detail.matches_played ?? 0) === 0 ? (
              <div className="p2-note">Geçen sezon Süper Lig'de hiç oynamadı.</div>
            ) : (
              <table className="p2-cat">
                <thead>
                  <tr><th>Kategori</th><th className="c-num">Toplam</th><th className="c-num">Maç</th><th className="c-num">Maç Başına</th></tr>
                </thead>
                <tbody>
                  {CAT_ORDER.filter((c) => detail.stats_breakdown?.[c]).map((c) => {
                    const v = detail.stats_breakdown[c]
                    return (
                      <tr key={c}>
                        <td>{c}</td>
                        <td className={`c-num ${v.points >= 0 ? 'pos' : 'neg'}`}>{v.points >= 0 ? `+${v.points}` : v.points}</td>
                        <td className="c-num">{v.matches}</td>
                        <td className="c-num">{v.per_match}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <button className="p2-btn p2-btn-gold" style={{ marginTop: 14 }} onClick={() => exportPlayer(detail)}>Bu oyuncuyu indir</button>
          </div>
        </div>
      )}
    </div>
  )
}
