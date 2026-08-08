import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { loadCachedFixtures } from '../lib/dataCache.js'
import { buildWeeks } from '../lib/weeks.js'
import { useNow } from '../lib/useNow.js'
import { clubColors } from '../lib/apiFootball.js'
import {
  createLeague, joinLeague, leaveLeague, deleteLeague, kickMember, increasePersonCount,
  listMyLeagues, getLeagueMembers, loadStandingsData, computeStandings,
  MAX_OWNED, MAX_MEMBERSHIPS,
} from '../lib/leaguesDb.js'
import MemberSquadModal from '../components/MemberSquadModal.jsx'
import './Liglerim.css'

const PAGE_SIZE = 30
const MEDALS = ['🥇', '🥈', '🥉']
const initialOf = (n) => (n || '?').trim().charAt(0).toLocaleUpperCase('tr')
const teamColor = (name) => {
  try { return clubColors(name)?.bg || '#3a7fe6' } catch { return '#3a7fe6' }
}

export default function Liglerim() {
  const { user } = useAuth()
  const now = useNow(30000)

  const [weeks, setWeeks] = useState([])
  const [data, setData] = useState({ users: [], ptsRows: [], trRows: [] })
  const [myLeagues, setMyLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // açık lig descriptor'ı
  const [modal, setModal] = useState(null) // 'create' | 'join' | null

  // Deadline'ı geçmiş haftalar + ilk açık hafta (milat için)
  const passedWeeks = useMemo(
    () => weeks.filter((w) => now >= w.deadline).map((w) => w.round).sort((a, b) => a - b),
    [weeks, now]
  )
  const lastPassedWeek = passedWeeks.length ? passedWeeks[passedWeeks.length - 1] : null
  const openWeek = useMemo(() => {
    const w = weeks.find((x) => now < x.deadline)
    return w ? w.round : (weeks.length ? Math.max(...weeks.map((x) => x.round)) + 1 : 1)
  }, [weeks, now])

  const usersById = useMemo(() => {
    const m = {}
    for (const u of data.users) m[u.id] = u
    return m
  }, [data.users])

  // Kullanıcının toplam fantasy puanı (hero paneli — mevcut ptsRows'tan)
  const myTotal = useMemo(
    () => data.ptsRows.filter((r) => r.user_id === user?.id).reduce((s, r) => s + (r.points || 0), 0),
    [data.ptsRows, user?.id]
  )

  useEffect(() => {
    loadCachedFixtures().then((res) => setWeeks(res ? buildWeeks(res.fixtures) : [])).catch(() => {})
  }, [])

  const reload = () => {
    if (!user) return
    setLoading(true)
    Promise.all([loadStandingsData(), listMyLeagues(user.id)])
      .then(([d, ml]) => { setData(d); setMyLeagues(ml) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <div className="lg">
        <div className="lg-hero">
          <div className="lg-hero-main">
            <div className="lg-hero-word">LİGLERİM</div>
            <p className="lg-hero-sub">Liglerini görmek için giriş yap.</p>
          </div>
        </div>
        <div className="lg-authbtns">
          <Link to="/giris" className="lg-btn gold">Giriş Yap</Link>
          <Link to="/kayit" className="lg-btn ghost">Kayıt Ol</Link>
        </div>
      </div>
    )
  }

  // Lig descriptor'ları
  const generalDesc = { type: 'general', key: 'general', name: 'Genel Lig', milestoneWeek: 1 }
  const favDesc = user.favorite_team
    ? { type: 'favorite', key: 'favorite', name: `${user.favorite_team} Ligi`, milestoneWeek: 1, team: user.favorite_team }
    : null

  const subsetFor = (desc) => {
    if (desc.type === 'general') return data.users
    if (desc.type === 'favorite') return data.users.filter((u) => u.favorite_team === desc.team)
    return null
  }
  const previewOf = (desc) => {
    const subset = subsetFor(desc)
    if (!subset) return null
    const s = computeStandings(subset, data, { milestoneWeek: desc.milestoneWeek })
    const i = s.findIndex((r) => r.id === user.id)
    return { rank: i < 0 ? null : i + 1, total: s.length, top3: s.slice(0, 3) }
  }

  if (selected) {
    return (
      <LeagueDetail
        descriptor={selected}
        user={user}
        data={data}
        usersById={usersById}
        passedWeeks={passedWeeks}
        lastPassedWeek={lastPassedWeek}
        onBack={() => setSelected(null)}
        onChanged={() => { reload(); setSelected(null) }}
      />
    )
  }

  return (
    <div className="lg">
      {/* HERO */}
      <div className="lg-hero">
        <div className="lg-hero-main">
          <div className="lg-hero-word">LİGLERİM</div>
          <p className="lg-hero-sub">Genel, favori takım ve özel liglerdeki sıralaman.</p>
        </div>
        <div className="lg-hero-stat">
          <div className="l">Toplam Puanın</div>
          <div className="v">{myTotal}</div>
        </div>
      </div>

      {/* OTOMATİK LİGLER */}
      <div className="lg-sec-title">Otomatik Ligler</div>
      <div className="lg-grid2">
        <AutoLeagueCard desc={generalDesc} accent="#f0a500" icon="🌍" sub="Tüm oyuncular" preview={previewOf(generalDesc)} onOpen={() => setSelected(generalDesc)} />
        {favDesc && (
          <AutoLeagueCard desc={favDesc} accent={teamColor(favDesc.team)} icon="⭐" sub="Favori takımını seçenler" preview={previewOf(favDesc)} onOpen={() => setSelected(favDesc)} />
        )}
      </div>

      {/* ÖZEL LİGLER */}
      <div className="lg-sec-title lg-row-between">
        <span>Özel Liglerim <span className="lg-chip">{myLeagues.length}/{MAX_MEMBERSHIPS}</span></span>
        <div className="lg-actions">
          <button className="lg-btn gold sm" onClick={() => setModal('create')}>+ Lig Yarat</button>
          <button className="lg-btn ghost sm" onClick={() => setModal('join')}>Lige Katıl</button>
        </div>
      </div>
      {loading ? (
        <div className="lg-note">Yükleniyor…</div>
      ) : (
        <div className="lg-grid2">
          {myLeagues.map((l) => (
            <PrivateLeagueCard
              key={l.id}
              league={l}
              onOpen={() => setSelected({ type: 'private', key: l.id, name: l.name, milestoneWeek: l.milestone_week, league: l })}
            />
          ))}
          <button className="lg-addcard" onClick={() => setModal('create')}>
            <span className="lg-addplus">+</span>
            <span className="lg-addtxt">Yeni özel lig kur ya da <b>Lige Katıl</b></span>
          </button>
        </div>
      )}

      {modal === 'create' && (
        <CreateLeagueModal user={user} openWeek={openWeek} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />
      )}
      {modal === 'join' && (
        <JoinLeagueModal user={user} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />
      )}
    </div>
  )
}

/* ---------- Otomatik lig vitrin kartı ---------- */
function AutoLeagueCard({ desc, accent, icon, sub, preview, onOpen }) {
  return (
    <button className="lg-lcard" style={{ '--accent': accent }} onClick={onOpen}>
      <span className="lg-lcard-strip" />
      <div className="lg-lcard-top">
        <span className="lg-lcard-badge">{icon}</span>
        <div className="lg-lcard-id">
          <div className="lg-lcard-name">{desc.name}</div>
          <div className="lg-lcard-sub">{sub}</div>
        </div>
        {preview?.rank && (
          <div className="lg-lcard-rank">#{preview.rank}<span>/{preview.total}</span></div>
        )}
      </div>
      <div className="lg-mini">
        {preview && preview.top3.length > 0 ? (
          preview.top3.map((r, i) => (
            <div key={r.id} className="lg-mini-row">
              <span className={`lg-mini-medal m${i + 1}`}>{i + 1}</span>
              <span className="lg-mini-name">{r.username}</span>
              <span className="lg-mini-pts">{r.points}</span>
            </div>
          ))
        ) : (
          <div className="lg-mini-empty">Henüz sıralama yok</div>
        )}
      </div>
      <span className="lg-lcard-go">Sıralamayı gör →</span>
    </button>
  )
}

/* ---------- Özel lig kartı ---------- */
function PrivateLeagueCard({ league, onOpen }) {
  return (
    <button className="lg-pcard" onClick={onOpen}>
      <div className="lg-pcard-name">{league.name}</div>
      <div className="lg-pcard-sub">
        {league.member_count}{league.person_count ? '/' + league.person_count : ''} üye{league.is_owner ? ' · admin' : ''}
      </div>
      <span className="lg-lcard-go">Sıralamayı gör →</span>
    </button>
  )
}

/* ==================== LİG DETAY (sıralama) ==================== */
function LeagueDetail({ descriptor, user, data, usersById, passedWeeks, lastPassedWeek, onBack, onChanged }) {
  const [members, setMembers] = useState(descriptor.type === 'private' ? null : [])
  const [weekFilter, setWeekFilter] = useState(null) // null = tüm haftalar
  const [page, setPage] = useState(0)
  const [gearOpen, setGearOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [memberModal, setMemberModal] = useState(null) // {userId, username}
  const [msg, setMsg] = useState('')

  const isPrivate = descriptor.type === 'private'
  const league = descriptor.league
  const isOwner = isPrivate && league.owner_id === user.id

  useEffect(() => {
    if (!isPrivate) return
    getLeagueMembers(league.id).then(setMembers).catch(() => setMembers([]))
  }, [isPrivate, league?.id])

  const subset =
    descriptor.type === 'private' ? (members || [])
      : descriptor.type === 'favorite' ? data.users.filter((u) => u.favorite_team === descriptor.team)
        : data.users

  const standings = useMemo(
    () => computeStandings(subset, data, { milestoneWeek: descriptor.milestoneWeek, week: weekFilter }),
    [subset, data, descriptor.milestoneWeek, weekFilter]
  )
  const selfIdx = standings.findIndex((r) => r.id === user.id)

  // Kullanıcı ilk 30'da değilse kendi sayfası açılır
  useEffect(() => {
    setPage(selfIdx >= PAGE_SIZE ? Math.floor(selfIdx / PAGE_SIZE) : 0)
  }, [descriptor.key, members, weekFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(standings.length / PAGE_SIZE))
  const pageRows = standings.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const leaders = standings.slice(0, 3)

  const ownerName = isPrivate ? (usersById[league.owner_id]?.username || '—') : null
  // İsme tıklama modalı hep açar; oynanmış hafta yoksa modal içinde bilgi gösterilir.
  const openMember = (r) => { if (r) setMemberModal({ userId: r.id, username: r.username }) }

  // Podyum sırası: 2 - 1 - 3 (ortadaki en yüksek)
  const podium = [
    { r: leaders[1], place: 2 },
    { r: leaders[0], place: 1 },
    { r: leaders[2], place: 3 },
  ]

  return (
    <div className="lg">
      <button className="lg-back" onClick={onBack}>← Liglerim</button>

      <div className="lg-detail-head">
        <div className="lg-detail-id">
          <h2 className="lg-detail-name">{descriptor.name}</h2>
          <div className="lg-detail-sub">{standings.length} katılımcı{isPrivate && league.person_count ? ` · limit ${league.person_count}` : ''}</div>
        </div>
        <div className="lg-detail-right">
          <select className="lg-wsel" value={weekFilter ?? 'all'} onChange={(e) => setWeekFilter(e.target.value === 'all' ? null : Number(e.target.value))}>
            <option value="all">Tüm haftalar</option>
            {passedWeeks.map((w) => <option key={w} value={w}>Hafta {w}</option>)}
          </select>
          {isPrivate && (
            <>
              <button className="lg-icobtn" onClick={() => { setMenuOpen((v) => !v); setGearOpen(false) }} aria-label="Menü">⋯</button>
              <button className="lg-icobtn" onClick={() => { setGearOpen((v) => !v); setMenuOpen(false) }} aria-label="Ayarlar">⚙</button>
            </>
          )}
        </div>
      </div>

      {msg && <div className="lg-msg">{msg}</div>}

      {/* Üç nokta menü — Ligden Çık */}
      {isPrivate && menuOpen && (
        <div className="lg-pop">
          <button
            className="lg-pop-item danger"
            disabled={isOwner}
            onClick={async () => {
              const r = await leaveLeague({ userId: user.id, leagueId: league.id, ownerId: league.owner_id })
              if (r.ok) onChanged(); else setMsg('⚠ ' + r.error)
              setMenuOpen(false)
            }}
          >
            Ligden Çık{isOwner ? ' (admin çıkamaz)' : ''}
          </button>
        </div>
      )}

      {/* Çark paneli */}
      {isPrivate && gearOpen && (
        <GearPanel
          league={league} isOwner={isOwner} ownerName={ownerName} members={members || []} user={user}
          memberCount={(members || []).length}
          onMsg={setMsg} onChanged={onChanged} onClose={() => setGearOpen(false)}
        />
      )}

      {/* PODYUM */}
      {standings.length > 0 && (
        <div className="lg-podium">
          {podium.map(({ r, place }) =>
            r ? (
              <button key={r.id} className={`lg-pod p${place}`} onClick={() => openMember(r)}>
                <span className="lg-pod-medal">{MEDALS[place - 1]}</span>
                <span className="lg-pod-ava">{initialOf(r.username)}</span>
                <span className="lg-pod-name">{r.username}</span>
                <span className="lg-pod-pts">{r.points}<small> P</small></span>
                <span className="lg-pod-block">{place}</span>
              </button>
            ) : (
              <div key={'e' + place} className={`lg-pod p${place} empty`}>
                <span className="lg-pod-medal">·</span>
                <span className="lg-pod-ava">–</span>
                <span className="lg-pod-name">—</span>
                <span className="lg-pod-pts">–</span>
                <span className="lg-pod-block">{place}</span>
              </div>
            )
          )}
        </div>
      )}

      {/* SIRALAMA LİSTESİ */}
      <div className="lg-list">
        <div className="lg-list-head">
          <span>Sıra</span><span>Kullanıcı</span><span>Toplam Puan</span><span>Joker</span>
        </div>
        {page > 0 && (
          <div className="lg-list-divider">Sayfa {page + 1}</div>
        )}
        {pageRows.length === 0 ? (
          <div className="lg-empty">Bu sıralamada henüz kimse yok.</div>
        ) : (
          pageRows.map((r, i) => {
            const rank = page * PAGE_SIZE + i + 1
            return (
              <div key={r.id} className={`lg-lrow${r.id === user.id ? ' lg-me' : ''}${rank <= 3 ? ' lg-medal m' + rank : ''}`}>
                <span className="lg-lrank">{rank <= 3 ? MEDALS[rank - 1] : rank}</span>
                <button className="lg-luser" onClick={() => openMember(r)}>
                  <span className="lg-lava">{initialOf(r.username)}</span>
                  <span className="lg-lname">{r.username}</span>
                </button>
                <span className="lg-lpts tnum">{r.points}</span>
                <span className="lg-ljok tnum">{r.jokers}</span>
              </div>
            )
          })
        )}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="lg-pager">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</button>
          <span>Sayfa {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>›</button>
        </div>
      )}
      {page > 0 && <button className="lg-firstpage" onClick={() => setPage(0)}>↑ 1. sayfaya dön</button>}

      {memberModal && (
        <MemberSquadModal
          userId={memberModal.userId}
          username={memberModal.username}
          week={weekFilter != null ? weekFilter : lastPassedWeek}
          onClose={() => setMemberModal(null)}
        />
      )}
    </div>
  )
}

/* ---------- Çark paneli ---------- */
function GearPanel({ league, isOwner, ownerName, members, user, memberCount, onMsg, onChanged, onClose }) {
  const [newCount, setNewCount] = useState(league.person_count || memberCount || 1)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmKick, setConfirmKick] = useState(null) // {id, username}

  const share = async () => {
    const text = `FFS Fantasy'de benim ligime katıl! Kod: ${league.code}`
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard?.writeText(text); onMsg('Metin kopyalandı ✓') }
    } catch { /* iptal */ }
  }

  return (
    <div className="lg-gear">
      <div className="lg-gear-row">
        <span className="l">Lig Kodu</span>
        <span className="lg-code">{league.code}</span>
        <button className="lg-btn sm" onClick={share}>Paylaş</button>
      </div>
      <div className="lg-gear-row"><span className="l">Geçmiş puanlar dahil mi?</span><b>{league.include_past_points ? 'Evet' : `Hayır (${league.milestone_week}. haftadan itibaren)`}</b></div>
      <div className="lg-gear-row"><span className="l">Lig Admini</span><b>{ownerName}</b></div>

      {isOwner && (
        <div className="lg-admin">
          <div className="lg-admin-title">Admin</div>
          <div className="lg-gear-row">
            <span className="l">Kişi Sayısı (yalnız artır)</span>
            <input className="lg-inp sm" type="number" min={memberCount} value={newCount} onChange={(e) => setNewCount(e.target.value)} />
            <button
              className="lg-btn sm gold"
              onClick={async () => {
                const r = await increasePersonCount({ adminId: user.id, leagueId: league.id, ownerId: league.owner_id, newCount, memberCount })
                onMsg(r.ok ? 'Kişi sayısı güncellendi ✓' : '⚠ ' + r.error)
                if (r.ok) onChanged()
              }}
            >Kaydet</button>
          </div>

          <div className="lg-admin-title">Üyeler</div>
          <div className="lg-memberlist">
            {members.map((m) => (
              <div key={m.id} className="lg-member">
                <span className="lg-member-name"><span className="lg-lava sm">{initialOf(m.username)}</span>{m.username}{m.id === league.owner_id ? ' · admin' : ''}</span>
                {m.id !== league.owner_id && (
                  <button className="lg-btn danger sm" onClick={() => setConfirmKick({ id: m.id, username: m.username })}>Ligden Çıkar</button>
                )}
              </div>
            ))}
          </div>

          {!confirmDelete ? (
            <button className="lg-btn danger" onClick={() => setConfirmDelete(true)}>Ligi Sil</button>
          ) : (
            <div className="lg-confirm">
              <span>Bu işlem geri alınamaz. Emin misiniz?</span>
              <div className="lg-confirm-btns">
                <button className="lg-btn danger sm" onClick={async () => {
                  const r = await deleteLeague({ userId: user.id, leagueId: league.id, ownerId: league.owner_id })
                  if (r.ok) onChanged(); else onMsg('⚠ ' + r.error)
                }}>Evet, sil</button>
                <button className="lg-btn sm" onClick={() => setConfirmDelete(false)}>Vazgeç</button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirmKick && (
        <div className="lg-confirm floating">
          <span>Bu kişiyi ligden çıkarmak istediğinize emin misiniz? Çıkarılan kişi bu lige bir daha giremez.</span>
          <div className="lg-confirm-btns">
            <button className="lg-btn danger sm" onClick={async () => {
              const r = await kickMember({ adminId: user.id, leagueId: league.id, ownerId: league.owner_id, memberId: confirmKick.id })
              setConfirmKick(null)
              if (r.ok) onChanged(); else onMsg('⚠ ' + r.error)
            }}>Evet, çıkar</button>
            <button className="lg-btn sm" onClick={() => setConfirmKick(null)}>Vazgeç</button>
          </div>
        </div>
      )}

      <button className="lg-gear-close" onClick={onClose}>Kapat</button>
    </div>
  )
}

/* ---------- Lig Yarat modalı ---------- */
function CreateLeagueModal({ user, openWeek, onClose, onDone }) {
  const [name, setName] = useState('')
  const [personCount, setPersonCount] = useState('')
  const [includePast, setIncludePast] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [created, setCreated] = useState(null)

  const submit = async () => {
    setBusy(true); setMsg('')
    const r = await createLeague({ userId: user.id, name, personCount, includePastPoints: includePast, openWeek })
    setBusy(false)
    if (r.ok) setCreated(r.league); else setMsg('⚠ ' + r.error)
  }

  return (
    <div className="lg-overlay" onClick={onClose}>
      <div className="lg-modal" onClick={(e) => e.stopPropagation()}>
        <button className="lg-mclose" onClick={onClose}>×</button>
        <h2 className="lg-modal-title">Lig Yarat</h2>
        {created ? (
          <div className="lg-created">
            <p>Lig oluşturuldu! Kod:</p>
            <div className="lg-code big">{created.code}</div>
            <button className="lg-btn gold big" onClick={onDone}>Tamam</button>
          </div>
        ) : (
          <>
            <label className="lg-field"><span>Lig Adı *</span>
              <input className="lg-inp" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Örn. Ofis Ligi" />
            </label>
            <label className="lg-field"><span>Kişi Sayısı (opsiyonel)</span>
              <input className="lg-inp" type="number" min={1} value={personCount} onChange={(e) => setPersonCount(e.target.value)} placeholder="Sınırsız" />
            </label>
            <label className="lg-chk">
              <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
              <span className="lg-chk-t">
                Önceki hafta puanları geçerli sayılsın
                <span className="lg-info" role="button" tabIndex={0}
                  onClick={(e) => { e.preventDefault(); setInfoOpen((v) => !v) }}>i</span>
              </span>
            </label>
            {infoOpen && (
              <p className="lg-infobox">
                Bu seçenek işaretlenirse, lige katılan herkes oyunun başından bu yana topladığı tüm puanlarla sıralamaya girer.
                İşaretlenmezse, lig kuruluş anındaki deadline'ı henüz gelmemiş ilk hafta milat kabul edilir. Örneğin 4. hafta
                deadline'ı gelmiş ve lig kurulmuşsa, 5. hafta milat olur — önceki haftaların puanları dahil edilmez. Sonradan
                katılanlar da 5. haftadan itibaren puanlarını taşır.
              </p>
            )}
            {msg && <div className="lg-msg">{msg}</div>}
            <button className="lg-btn gold big" disabled={busy || !name.trim()} onClick={submit}>
              {busy ? 'Oluşturuluyor…' : 'Ligi Yarat'}
            </button>
            <p className="lg-hint">En fazla {MAX_OWNED} lig kurabilir, toplam {MAX_MEMBERSHIPS} özel ligde olabilirsin.</p>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- Lige Katıl modalı ---------- */
function JoinLeagueModal({ user, onClose, onDone }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async () => {
    setBusy(true); setMsg('')
    const r = await joinLeague({ userId: user.id, code })
    setBusy(false)
    if (r.ok) onDone(); else setMsg('⚠ ' + r.error)
  }

  return (
    <div className="lg-overlay" onClick={onClose}>
      <div className="lg-modal" onClick={(e) => e.stopPropagation()}>
        <button className="lg-mclose" onClick={onClose}>×</button>
        <h2 className="lg-modal-title">Lige Katıl</h2>
        <label className="lg-field"><span>5 Haneli Kod</span>
          <input className="lg-inp code" value={code} maxLength={5}
            onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC12" />
        </label>
        {msg && <div className="lg-msg">{msg}</div>}
        <button className="lg-btn gold big" disabled={busy || code.trim().length !== 5} onClick={submit}>
          {busy ? 'Katılınıyor…' : 'Katıl'}
        </button>
      </div>
    </div>
  )
}
