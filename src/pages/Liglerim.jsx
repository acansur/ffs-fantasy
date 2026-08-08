import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { loadCachedFixtures } from '../lib/dataCache.js'
import { buildWeeks } from '../lib/weeks.js'
import { useNow } from '../lib/useNow.js'
import {
  createLeague, joinLeague, leaveLeague, deleteLeague, kickMember, increasePersonCount,
  listMyLeagues, getLeagueMembers, loadStandingsData, computeStandings,
  MAX_OWNED, MAX_MEMBERSHIPS,
} from '../lib/leaguesDb.js'
import MemberSquadModal from '../components/MemberSquadModal.jsx'
import './Liglerim.css'

const PAGE_SIZE = 30
const MEDALS = ['🥇', '🥈', '🥉']

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
        <div className="lg-hero"><h1>Liglerim</h1><p>Liglerini görmek için giriş yap.</p></div>
        <div className="lg-authbtns">
          <Link to="/giris" className="lg-btn gold">Giriş Yap</Link>
          <Link to="/kayit" className="lg-btn">Kayıt Ol</Link>
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
  const myRankIn = (desc) => {
    const subset = subsetFor(desc)
    if (!subset) return null
    const s = computeStandings(subset, data, { milestoneWeek: desc.milestoneWeek })
    const i = s.findIndex((r) => r.id === user.id)
    return i < 0 ? null : { rank: i + 1, total: s.length }
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
      <div className="lg-hero"><h1>Liglerim</h1><p>Genel, favori takım ve özel liglerdeki sıralaman.</p></div>

      {/* Genel + Favori */}
      <div className="lg-sec-title">Otomatik Ligler</div>
      <div className="lg-cards">
        <LeagueCard desc={generalDesc} sub="Tüm oyuncular" rank={myRankIn(generalDesc)} onOpen={() => setSelected(generalDesc)} />
        {favDesc && (
          <LeagueCard desc={favDesc} sub="Favori takımını seçenler" rank={myRankIn(favDesc)} onOpen={() => setSelected(favDesc)} />
        )}
      </div>

      {/* Özel ligler */}
      <div className="lg-sec-title lg-row-between">
        <span>Özel Liglerim <b className="lg-count">{myLeagues.length}/{MAX_MEMBERSHIPS}</b></span>
        <div className="lg-actions">
          <button className="lg-btn gold sm" onClick={() => setModal('create')}>+ Lig Yarat</button>
          <button className="lg-btn sm" onClick={() => setModal('join')}>Lige Katıl</button>
        </div>
      </div>
      {loading ? (
        <div className="lg-note">Yükleniyor…</div>
      ) : myLeagues.length === 0 ? (
        <div className="lg-note">Henüz bir özel ligde değilsin. Bir lig yarat ya da koda katıl.</div>
      ) : (
        <div className="lg-cards">
          {myLeagues.map((l) => (
            <LeagueCard
              key={l.id}
              desc={{ type: 'private', key: l.id, name: l.name }}
              sub={`${l.member_count}${l.person_count ? '/' + l.person_count : ''} üye${l.is_owner ? ' · admin' : ''}`}
              onOpen={() => setSelected({ type: 'private', key: l.id, name: l.name, milestoneWeek: l.milestone_week, league: l })}
            />
          ))}
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

function LeagueCard({ desc, sub, rank, onOpen }) {
  return (
    <button className="lg-card" onClick={onOpen}>
      <div className="lg-card-name">{desc.name}</div>
      <div className="lg-card-sub">{sub}</div>
      {rank && <div className="lg-card-rank">Sıran <b>#{rank.rank}</b> <span>/ {rank.total}</span></div>}
      <span className="lg-card-go">Sıralamayı gör →</span>
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

  const openMember = (r) => { if (lastPassedWeek != null) setMemberModal({ userId: r.id, username: r.username }) }

  const Row = ({ r, rank }) => (
    <tr className={`lg-tr${r.id === user.id ? ' me' : ''}${rank <= 3 ? ' medal m' + rank : ''}`}>
      <td className="lg-rank">{rank <= 3 ? MEDALS[rank - 1] : rank}</td>
      <td className="lg-uname"><button className="lg-namebtn" onClick={() => openMember(r)}>{r.username}</button></td>
      <td className="lg-pts tnum">{r.points}</td>
      <td className="lg-jok tnum">{r.jokers}</td>
    </tr>
  )

  return (
    <div className="lg">
      <button className="lg-back" onClick={onBack}>← Liglerim</button>

      <div className="lg-detail-head">
        <div>
          <h1 className="lg-detail-name">{descriptor.name}</h1>
          <div className="lg-detail-sub">{standings.length} katılımcı{isPrivate && league.person_count ? ` · limit ${league.person_count}` : ''}</div>
        </div>
        {isPrivate && (
          <div className="lg-detail-tools">
            <button className="lg-icobtn" onClick={() => { setMenuOpen((v) => !v); setGearOpen(false) }} aria-label="Menü">⋯</button>
            <button className="lg-icobtn" onClick={() => { setGearOpen((v) => !v); setMenuOpen(false) }} aria-label="Ayarlar">⚙</button>
          </div>
        )}
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

      {/* Çark — kod / paylaş / geçmiş dahil / admin + admin ekstraları */}
      {isPrivate && gearOpen && (
        <GearPanel
          league={league} isOwner={isOwner} ownerName={ownerName} members={members || []} user={user}
          memberCount={(members || []).length}
          onMsg={setMsg} onChanged={onChanged} onClose={() => setGearOpen(false)}
        />
      )}

      {/* Haftalık filtre */}
      <div className="lg-filter">
        <span className="lg-filter-lbl">Hafta:</span>
        <select value={weekFilter ?? 'all'} onChange={(e) => setWeekFilter(e.target.value === 'all' ? null : Number(e.target.value))}>
          <option value="all">Tüm haftalar</option>
          {passedWeeks.map((w) => <option key={w} value={w}>Hafta {w}</option>)}
        </select>
      </div>

      {/* Sıralama tablosu */}
      <div className="lg-tablewrap">
        <table className="lg-table">
          <thead>
            <tr><th>Sıra</th><th>Kullanıcı</th><th>Toplam Puan</th><th>Joker</th></tr>
          </thead>
          <tbody>
            {/* 1. sayfa hariç: ilk 3 lider üstte sabit */}
            {page > 0 && (
              <>
                {leaders.map((r, i) => <Row key={'ld' + r.id} r={r} rank={i + 1} />)}
                <tr className="lg-divider"><td colSpan={4}>Sayfa {page + 1}</td></tr>
              </>
            )}
            {pageRows.length === 0 ? (
              <tr><td colSpan={4} className="lg-empty">Bu sıralamada henüz kimse yok.</td></tr>
            ) : (
              pageRows.map((r, i) => <Row key={r.id} r={r} rank={page * PAGE_SIZE + i + 1} />)
            )}
          </tbody>
        </table>
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
          week={lastPassedWeek}
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
                <span>{m.username}{m.id === league.owner_id ? ' (admin)' : ''}</span>
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
        <h2>Lig Yarat</h2>
        {created ? (
          <div className="lg-created">
            <p>Lig oluşturuldu! Kod:</p>
            <div className="lg-code big">{created.code}</div>
            <button className="lg-btn gold" onClick={onDone}>Tamam</button>
          </div>
        ) : (
          <>
            <label className="lg-field"><span>Lig Adı *</span>
              <input className="lg-inp" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Örn. Ofis Ligi" />
            </label>
            <label className="lg-field"><span>Kişi Sayısı (opsiyonel)</span>
              <input className="lg-inp" type="number" min={1} value={personCount} onChange={(e) => setPersonCount(e.target.value)} placeholder="Sınırsız" />
            </label>
            <div className="lg-check">
              <label>
                <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
                Önceki hafta puanları geçerli sayılsın
              </label>
              <button className="lg-info" onClick={() => setInfoOpen((v) => !v)} aria-label="Bilgi">ⓘ</button>
            </div>
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
        <h2>Lige Katıl</h2>
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
