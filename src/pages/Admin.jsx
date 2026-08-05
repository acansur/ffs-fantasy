import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import {
  listUsers, deleteUser,
  listPlayers, savePlayerValue, refreshPlayersFromApi,
  listLeagues,
  getTableCounts, getApiStatus,
  getActiveAnnouncement, setAnnouncement,
  getWeekOverrides, setWeekOverride,
} from '../lib/adminDb.js'
import './Admin.css'

const TABS = [
  ['users', 'Kullanıcılar'],
  ['players', 'Oyuncular'],
  ['leagues', 'Ligler'],
  ['system', 'Sistem'],
  ['announce', 'Duyuru'],
  ['weeks', 'Hafta Override'],
]

const fmtDate = (s) => (s ? new Date(s).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—')

export default function Admin() {
  const { user } = useAuth()
  const [tab, setTab] = useState('users')

  // is_admin değilse ana sayfaya yönlendir
  if (!user || !user.is_admin) return <Navigate to="/" replace />

  return (
    <div className="adm">
      <div className="adm-head">
        <h1>Admin Paneli</h1>
        <p className="adm-sub">Merhaba <b>{user.username}</b> · yalnızca admin erişimi</p>
      </div>
      <div className="adm-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`adm-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div className="adm-body">
        {tab === 'users' && <UsersTab />}
        {tab === 'players' && <PlayersTab />}
        {tab === 'leagues' && <LeaguesTab />}
        {tab === 'system' && <SystemTab />}
        {tab === 'announce' && <AnnounceTab />}
        {tab === 'weeks' && <WeeksTab />}
      </div>
    </div>
  )
}

/* ---------- 1) Kullanıcılar ---------- */
function UsersTab() {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState('')
  const load = () => { setRows(null); listUsers().then(setRows).catch((e) => setMsg('⚠ ' + e.message)) }
  useEffect(load, [])

  const onDelete = async (u) => {
    if (!window.confirm(`"${u.username}" kullanıcısını ve tüm kadrolarını silmek istediğine emin misin? Bu geri alınamaz.`)) return
    try { await deleteUser(u.id); setMsg(`✓ ${u.username} silindi.`); load() }
    catch (e) { setMsg('⚠ ' + e.message) }
  }

  if (rows === null) return <div className="adm-note">Yükleniyor…</div>
  return (
    <div>
      {msg && <div className={`adm-msg ${msg.startsWith('⚠') ? 'err' : 'ok'}`}>{msg}</div>}
      <div className="adm-count">{rows.length} kullanıcı</div>
      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Kullanıcı</th><th>E-posta</th><th>Kayıt</th><th>Son Görülme</th><th>Admin</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="strong">{u.username}</td>
                <td>{u.email}</td>
                <td>{fmtDate(u.created_at)}</td>
                <td>{fmtDate(u.last_seen)}</td>
                <td>{u.is_admin ? <span className="adm-badge gold">admin</span> : '—'}</td>
                <td><button className="adm-btn danger sm" onClick={() => onDelete(u)}>Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------- 2) Oyuncular ---------- */
function PlayersTab() {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState({}) // id → value string
  const load = () => { setRows(null); listPlayers().then(setRows).catch((e) => setMsg('⚠ ' + e.message)) }
  useEffect(load, [])

  const onRefresh = async () => {
    setBusy(true); setMsg('')
    try { const n = await refreshPlayersFromApi((m) => setMsg('⏳ ' + m)); setMsg(`✓ ${n} oyuncu güncellendi.`); load() }
    catch (e) { setMsg('⚠ ' + e.message) }
    finally { setBusy(false) }
  }
  const onSaveValue = async (p) => {
    const v = Number(edit[p.id])
    if (edit[p.id] == null || Number.isNaN(v) || v === Number(p.value)) return
    try { await savePlayerValue(p.id, v); setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, value: v } : r))); setMsg(`✓ ${p.name} = ₺${v}M`) }
    catch (e) { setMsg('⚠ ' + e.message) }
    setEdit((e) => { const n = { ...e }; delete n[p.id]; return n })
  }

  const filtered = useMemo(() => {
    if (!rows) return []
    const s = q.trim().toLocaleLowerCase('tr')
    return s ? rows.filter((r) => (r.name || '').toLocaleLowerCase('tr').includes(s) || (r.team_name || '').toLocaleLowerCase('tr').includes(s)) : rows
  }, [rows, q])

  return (
    <div>
      <div className="adm-row">
        <button className="adm-btn gold" onClick={onRefresh} disabled={busy}>{busy ? 'Güncelleniyor…' : 'Oyuncu Listesini Güncelle'}</button>
        <input className="adm-input" placeholder="Oyuncu/takım ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {msg && <div className={`adm-msg ${msg.startsWith('⚠') ? 'err' : 'ok'}`}>{msg}</div>}
      {rows === null ? <div className="adm-note">Yükleniyor…</div> : rows.length === 0 ? (
        <div className="adm-note">Oyuncu yok. "Oyuncu Listesini Güncelle" ile API'den çekin.</div>
      ) : (
        <>
          <div className="adm-count">{filtered.length} oyuncu</div>
          <div className="adm-tablewrap tall">
            <table className="adm-table">
              <thead><tr><th>İsim</th><th>Takım</th><th>Mevki</th><th>Değer (₺M)</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">{p.name}</td>
                    <td>{p.team_name}</td>
                    <td><span className={`adm-pos pos-${p.position}`}>{p.position}</span></td>
                    <td>
                      <input
                        className="adm-val" type="number" step="0.1"
                        value={edit[p.id] ?? p.value ?? ''}
                        onChange={(e) => setEdit((s) => ({ ...s, [p.id]: e.target.value }))}
                        onBlur={() => onSaveValue(p)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- 3) Ligler ---------- */
function LeaguesTab() {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { listLeagues().then(setRows).catch((e) => setMsg('⚠ ' + e.message)) }, [])
  if (msg) return <div className="adm-msg err">{msg}</div>
  if (rows === null) return <div className="adm-note">Yükleniyor…</div>
  if (rows.length === 0) return <div className="adm-note">Henüz kurulmuş lig yok.</div>
  return (
    <div className="adm-tablewrap">
      <table className="adm-table">
        <thead><tr><th>Lig Adı</th><th>Kod</th><th>Kurucu</th><th>Üye</th><th>Oluşturma</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}><td className="strong">{l.name}</td><td><code>{l.code}</code></td><td>{l.owner_name}</td><td>{l.member_count}</td><td>{fmtDate(l.created_at)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- 4) Sistem ---------- */
function SystemTab() {
  const [api, setApi] = useState(null)
  const [counts, setCounts] = useState(null)
  useEffect(() => {
    getApiStatus().then(setApi)
    getTableCounts().then(setCounts)
  }, [])
  return (
    <div className="adm-grid2">
      <div className="adm-card">
        <h3>API Kota Durumu (API-Football)</h3>
        {!api ? <div className="adm-note">Yükleniyor…</div> : !api.ok ? <div className="adm-msg err">⚠ {api.error}</div> : (
          <ul className="adm-kv">
            <li><span>Plan</span><b>{api.plan || '—'} {api.active ? '(aktif)' : ''}</b></li>
            <li><span>Günlük limit</span><b>{api.limit_day ?? '—'}</b></li>
            <li><span>Kullanılan</span><b>{api.current ?? '—'}</b></li>
            <li><span>Kalan</span><b className="gold">{api.remaining ?? '—'}</b></li>
          </ul>
        )}
      </div>
      <div className="adm-card">
        <h3>Supabase Tabloları (satır sayısı)</h3>
        {!counts ? <div className="adm-note">Yükleniyor…</div> : (
          <ul className="adm-kv">
            {counts.map((c) => <li key={c.table}><span>{c.table}</span><b>{c.count == null ? '—' : c.count}</b></li>)}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ---------- 5) Duyuru ---------- */
function AnnounceTab() {
  const [current, setCurrent] = useState(null)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => getActiveAnnouncement().then((a) => { setCurrent(a); setText(a?.message || '') })
  useEffect(() => { load() }, [])
  const publish = async () => {
    try { await setAnnouncement(text); setMsg(text.trim() ? '✓ Duyuru yayınlandı.' : '✓ Duyuru temizlendi.'); load() }
    catch (e) { setMsg('⚠ ' + e.message) }
  }
  const clear = async () => { setText(''); try { await setAnnouncement(''); setMsg('✓ Duyuru temizlendi.'); load() } catch (e) { setMsg('⚠ ' + e.message) } }
  return (
    <div className="adm-card">
      <h3>Site Geneli Duyuru</h3>
      <p className="adm-note" style={{ padding: 0, marginBottom: 10 }}>
        Aktif duyuru tüm kullanıcılara site üstünde bir bant olarak gösterilir.
        {current ? ` Şu an aktif: "${current.message}"` : ' Şu an aktif duyuru yok.'}
      </p>
      <textarea className="adm-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Duyuru metni…" />
      {msg && <div className={`adm-msg ${msg.startsWith('⚠') ? 'err' : 'ok'}`}>{msg}</div>}
      <div className="adm-row">
        <button className="adm-btn gold" onClick={publish}>Yayınla</button>
        <button className="adm-btn" onClick={clear}>Temizle</button>
      </div>
    </div>
  )
}

/* ---------- 6) Hafta Override ---------- */
function WeeksTab() {
  const [rows, setRows] = useState(null)
  const [round, setRound] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => getWeekOverrides().then(setRows).catch((e) => setMsg('⚠ ' + e.message))
  useEffect(() => { load() }, [])
  const apply = async (locked) => {
    const r = Number(round)
    if (!r) { setMsg('⚠ Geçerli bir hafta numarası gir.'); return }
    try { await setWeekOverride(r, locked); setMsg(`✓ Hafta ${r} → ${locked ? 'KİLİTLİ' : 'AÇIK'} (manuel).`); load() }
    catch (e) { setMsg('⚠ ' + e.message) }
  }
  const remove = async (r) => { try { await setWeekOverride(r, null); setMsg(`✓ Hafta ${r} → otomatik.`); load() } catch (e) { setMsg('⚠ ' + e.message) } }
  return (
    <div className="adm-card">
      <h3>Manuel Hafta Kilidi</h3>
      <p className="adm-note" style={{ padding: 0, marginBottom: 10 }}>
        Otomatik deadline bozulursa müdahale için. Override konulan hafta, deadline'dan bağımsız kilitli/açık olur.
      </p>
      <div className="adm-row">
        <input className="adm-input" type="number" placeholder="Hafta no" value={round} onChange={(e) => setRound(e.target.value)} style={{ width: 110 }} />
        <button className="adm-btn danger" onClick={() => apply(true)}>Kilitle</button>
        <button className="adm-btn gold" onClick={() => apply(false)}>Aç</button>
      </div>
      {msg && <div className={`adm-msg ${msg.startsWith('⚠') ? 'err' : 'ok'}`}>{msg}</div>}
      {rows === null ? <div className="adm-note">Yükleniyor…</div> : rows.length === 0 ? (
        <div className="adm-note" style={{ padding: '16px 0' }}>Manuel override yok — tüm haftalar otomatik.</div>
      ) : (
        <table className="adm-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Hafta</th><th>Durum</th><th>Güncelleme</th><th></th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.round}>
                <td className="strong">Hafta {o.round}</td>
                <td>{o.locked ? <span className="adm-badge danger">KİLİTLİ</span> : <span className="adm-badge gold">AÇIK</span>}</td>
                <td>{fmtDate(o.updated_at)}</td>
                <td><button className="adm-btn sm" onClick={() => remove(o.round)}>Otomatiğe döndür</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
