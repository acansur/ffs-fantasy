import { useEffect, useMemo, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { normalizeText } from '../lib/normalize.js'
import {
  listUsers, deleteUser,
  listPlayers, savePlayerValue,
  listLeagues, listFixtures,
  getTableCounts, getApiStatus,
  getActiveAnnouncement, setAnnouncement,
  getWeekOverrides, setWeekOverride,
} from '../lib/adminDb.js'
import {
  refreshPlayers, refreshFixtures,
  getPlayersUpdatedAt, getFixturesUpdatedAt, getDataSource,
} from '../lib/dataCache.js'
import './Admin.css'

const TABS = [
  ['users', 'Kullanıcılar'],
  ['players', 'Oyuncular'],
  ['fixtures', 'Fikstür'],
  ['leagues', 'Ligler'],
  ['system', 'Sistem'],
  ['announce', 'Duyuru'],
  ['weeks', 'Hafta Override'],
  ['devtools', 'Geliştirici Araçları'],
]

// Yalnızca admin erişimine açık geliştirici/test sayfaları
const DEV_PAGES = [
  { path: '/players', desc: 'Süper Lig 2026-27 oyuncu listesi (mevki gruplu, filtreli)' },
  { path: '/players2', desc: 'Geçen sezon (2025-26) oyuncu performans analizi, değerleme için' },
  { path: '/stats-test', desc: "API'den çekilen maç istatistiklerinin ham görünümü" },
  { path: '/stats-test2', desc: 'Antalyaspor-Fenerbahçe maçı detaylı istatistik ve CSV indirme' },
  { path: '/scoring-test', desc: '5 maç üzerinden puanlama motoru testi' },
  { path: '/fikstur', desc: 'Süper Lig 2026-27 tam fikstür listesi' },
]

const fmtDate = (s) => (s ? new Date(s).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—')

// "6 Ağu 2026, 21:45" biçimi (son güncelleme damgası)
const fmtStamp = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  const date = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' })
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
  return `${date}, ${time}`
}

// Fikstür önizlemesi için kompakt gün/saat
const fmtDay = (s) => (s ? new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', timeZone: 'Europe/Istanbul' }) : '—')
const fmtHm = (s) => (s ? new Date(s).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : '—')
// "Süper Lig - 3" → "3. Hafta"
const roundLabel = (r) => {
  const n = Number(String(r || '').match(/\d+/)?.[0])
  return n ? `${n}. Hafta` : r || '—'
}
const roundNum = (r) => Number(String(r || '').match(/\d+/)?.[0] ?? 1e9)

// Kaynak kodu → okunur etiket ("API'den otomatik" / "Manuel güncelleme")
const SOURCE_LABEL = { auto: "API'den otomatik", manual: 'Manuel güncelleme' }

// API→Supabase güncelleme kartı: buton → % ilerleme çubuğu → son güncelleme.
// onRun(onProgress) bir Promise döndürür; onProgress(pct, label) ile ilerler.
// source: 'auto' | 'manual' | null → "Kaynak" göstergesi (yalnızca verildiğinde).
function UpdateCard({ title, buttonLabel, color, onRun, lastUpdated, source, onDone }) {
  const [st, setSt] = useState({ busy: false, pct: 0, label: '', done: false, err: '' })
  const run = async () => {
    setSt({ busy: true, pct: 0, label: 'Başlatılıyor…', done: false, err: '' })
    try {
      const res = await onRun((pct, label) => setSt((s) => ({ ...s, pct, label })))
      setSt({ busy: false, pct: 100, label: '', done: true, err: '' })
      onDone?.(res)
    } catch (e) {
      setSt({ busy: false, pct: 0, label: '', done: false, err: e.message || String(e) })
    }
  }
  return (
    <div className={`adm-upd-card ${color}`}>
      <div className="adm-upd-title">{title}</div>
      {st.busy ? (
        <div className="adm-upd-progress">
          <div className="adm-upd-bar"><span style={{ width: `${st.pct}%` }} /></div>
          <div className="adm-upd-pct">Güncelleniyor… %{st.pct}{st.label ? ` · ${st.label}` : ''}</div>
        </div>
      ) : (
        <button className={`adm-btn ${color} big`} onClick={run}>{buttonLabel}</button>
      )}
      {st.err && <div className="adm-msg err" style={{ marginTop: 8 }}>⚠ {st.err}</div>}
      <div className="adm-upd-meta">
        {st.done && <span className="adm-upd-ok">✅ Tamamlandı — </span>}
        Son güncelleme: <b>{fmtStamp(lastUpdated)}</b>
      </div>
      {source !== undefined && (
        <div className="adm-upd-src">
          Kaynak:{' '}
          {source ? (
            <span className={`adm-src-badge ${source}`}>
              {source === 'auto' ? '🔄' : '✋'} {SOURCE_LABEL[source] || source}
            </span>
          ) : (
            <b>—</b>
          )}
        </div>
      )}
    </div>
  )
}

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
        {tab === 'fixtures' && <FixturesTab />}
        {tab === 'leagues' && <LeaguesTab />}
        {tab === 'system' && <SystemTab />}
        {tab === 'announce' && <AnnounceTab />}
        {tab === 'weeks' && <WeeksTab />}
        {tab === 'devtools' && <DevToolsTab />}
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
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState({}) // id → value string
  const [playersAt, setPlayersAt] = useState(null) // players tablosu son güncelleme
  const [fixturesAt, setFixturesAt] = useState(null) // fixtures tablosu son güncelleme
  const load = () => { setRows(null); listPlayers().then(setRows).catch((e) => setMsg('⚠ ' + e.message)) }
  useEffect(() => {
    load()
    // Sayfa yüklenince son güncelleme tarihleri Supabase'den gelir
    getPlayersUpdatedAt().then(setPlayersAt).catch(() => {})
    getFixturesUpdatedAt().then(setFixturesAt).catch(() => {})
  }, [])

  const onSaveValue = async (p) => {
    const v = Number(edit[p.id])
    if (edit[p.id] == null || Number.isNaN(v) || v === Number(p.value)) return
    try { await savePlayerValue(p.id, v); setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, value: v } : r))); setMsg(`✓ ${p.name} = ₺${v}M`) }
    catch (e) { setMsg('⚠ ' + e.message) }
    setEdit((e) => { const n = { ...e }; delete n[p.id]; return n })
  }

  const filtered = useMemo(() => {
    if (!rows) return []
    // Özel karakter olmadan da bulunsun (ASCII normalize: ç→c, ş→s, ı→i ...)
    const s = normalizeText(q.trim())
    return s ? rows.filter((r) => normalizeText(r.name || '').includes(s) || normalizeText(r.team_name || '').includes(s)) : rows
  }, [rows, q])

  // Satır düzenlendi mi (kaydet butonu aktifliği)
  const isDirty = (p) =>
    edit[p.id] != null && edit[p.id] !== '' && !Number.isNaN(Number(edit[p.id])) && Number(edit[p.id]) !== Number(p.value)

  return (
    <div>
      {/* Güncelleme kartları — yan yana, belirgin */}
      <div className="adm-upd-grid">
        <UpdateCard
          title="Oyuncular"
          buttonLabel="Oyuncu Listesini Güncelle"
          color="gold"
          onRun={(onProgress) => refreshPlayers(onProgress)}
          lastUpdated={playersAt}
          onDone={(res) => { setPlayersAt(res.updatedAt); load() }}
        />
        <UpdateCard
          title="Fikstür"
          buttonLabel="Fikstürü Güncelle"
          color="green"
          onRun={(onProgress) => refreshFixtures(onProgress)}
          lastUpdated={fixturesAt}
          onDone={(res) => setFixturesAt(res.updatedAt)}
        />
      </div>

      <div className="adm-row" style={{ marginTop: 18 }}>
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
              <thead><tr><th>İsim</th><th>Takım</th><th>Mevki</th><th>Değer (₺M)</th><th></th></tr></thead>
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
                        onKeyDown={(e) => { if (e.key === 'Enter') onSaveValue(p) }}
                      />
                    </td>
                    <td>
                      <button className="adm-btn gold sm" onClick={() => onSaveValue(p)} disabled={!isDirty(p)}>Kaydet</button>
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

/* ---------- 2b) Fikstür ---------- */
function FixturesTab() {
  const [playersAt, setPlayersAt] = useState(null)
  const [fixturesAt, setFixturesAt] = useState(null)
  const [playersSrc, setPlayersSrc] = useState(null) // 'auto' | 'manual' | null
  const [fixturesSrc, setFixturesSrc] = useState(null)
  const [rows, setRows] = useState(null) // fikstür önizleme satırları
  const [err, setErr] = useState('')

  const loadPreview = () => {
    setRows(null)
    listFixtures().then(setRows).catch((e) => { setErr(e.message); setRows([]) })
  }
  useEffect(() => {
    getPlayersUpdatedAt().then(setPlayersAt).catch(() => {})
    getFixturesUpdatedAt().then(setFixturesAt).catch(() => {})
    getDataSource('players').then((d) => setPlayersSrc(d?.source || null)).catch(() => {})
    getDataSource('fixtures').then((d) => setFixturesSrc(d?.source || null)).catch(() => {})
    loadPreview()
  }, [])

  // Hafta hafta gruplama (maç tarihine göre gelmiş satırlar → round bazında)
  const groups = useMemo(() => {
    if (!rows) return []
    const map = new Map()
    for (const f of rows) {
      const k = f.round || '—'
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(f)
    }
    return [...map.entries()]
      .map(([round, matches]) => ({ round, matches }))
      .sort((a, b) => roundNum(a.round) - roundNum(b.round))
  }, [rows])

  return (
    <div>
      {/* Hatırlatma notu */}
      <div className="adm-remind">
        🔔 <b>Her gün güncelle.</b> Oyuncu değerleri ve fikstür (maç tarihi/saati)
        güncel kalması için günde bir kez API'den çekin.
      </div>

      {/* Güncelleme kartları — yan yana, ayırt edici renkler */}
      <div className="adm-upd-grid">
        <UpdateCard
          title="Oyuncular"
          buttonLabel="Oyuncu Listesini Güncelle"
          color="cyan"
          onRun={(onProgress) => refreshPlayers(onProgress)}
          lastUpdated={playersAt}
          source={playersSrc}
          onDone={(res) => { setPlayersAt(res.updatedAt); setPlayersSrc('manual') }}
        />
        <UpdateCard
          title="Fikstür"
          buttonLabel="Fikstürü Güncelle"
          color="violet"
          onRun={(onProgress) => refreshFixtures(onProgress)}
          lastUpdated={fixturesAt}
          source={fixturesSrc}
          onDone={(res) => { setFixturesAt(res.updatedAt); setFixturesSrc('manual'); loadPreview() }}
        />
      </div>

      {/* Fikstür önizlemesi */}
      <div className="adm-fx-head">
        <h3>Güncel Fikstür (Supabase)</h3>
        {rows && rows.length > 0 && (
          <span className="adm-fx-sum">{groups.length} hafta · {rows.length} maç</span>
        )}
      </div>
      {err && <div className="adm-msg err">⚠ {err}</div>}
      {rows === null ? (
        <div className="adm-note">Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div className="adm-note">Fikstür yok. "Fikstürü Güncelle" ile API'den çekin.</div>
      ) : (
        <div className="adm-fx-weeks">
          {groups.map((g) => (
            <div key={g.round} className="adm-fx-week">
              <div className="adm-fx-week-head">
                <span className="adm-fx-round">{roundLabel(g.round)}</span>
                <span className="adm-fx-count">{g.matches.length} maç</span>
              </div>
              <ul className="adm-fx-list">
                {g.matches.map((m) => (
                  <li key={m.fixture_id} className="adm-fx-match">
                    <span className="adm-fx-home">{m.home}</span>
                    <span className="adm-fx-vs">vs</span>
                    <span className="adm-fx-away">{m.away}</span>
                    <span className="adm-fx-when">{fmtDay(m.match_date)} · {fmtHm(m.match_date)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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

/* ---------- 7) Geliştirici Araçları ---------- */
function DevToolsTab() {
  return (
    <div>
      <p className="adm-note" style={{ padding: 0, marginBottom: 14 }}>
        Test/geliştirme sayfaları — yalnızca admin erişimine açıktır. Admin olmayan biri
        bu adreslere giderse ana sayfaya yönlendirilir.
      </p>
      <div className="adm-dev-list">
        {DEV_PAGES.map((p) => (
          <Link key={p.path} to={p.path} className="adm-dev-card">
            <div className="adm-dev-top">
              <code className="adm-dev-path">{p.path}</code>
              <span className="adm-dev-go">Aç →</span>
            </div>
            <div className="adm-dev-desc">{p.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
