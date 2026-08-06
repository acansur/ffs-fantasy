import { useMemo, useState, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import {
  buildEmptyRoster,
  cloneRoster,
  rosterPlayers,
} from '../lib/squadStore.jsx'
import { swapSlots as pureSwap, starterCounts } from '../lib/rosterOps.js'
import { applyAutoSubs, computeTotalPoints } from '../lib/weekScores.js'
import {
  loadUelPlayers,
  loadUelFixtures,
  computeUelScores,
  uelFixtureForTeam,
  UEL_DEADLINE_MS,
  UEL_TEAMS,
} from '../lib/uelTest.js'
import { saveUelSquad, loadUelSquad, rebuildUelRoster } from '../lib/uelTestDb.js'
import { formatDeadline } from '../lib/weeks.js'
import { useNow } from '../lib/useNow.js'
import { POSITIONS, SQUAD_TOTALS, TOTAL_BUDGET, MAX_PER_CLUB, initials, formationLabel, surname } from '../lib/squadData.js'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import PlayerDetailModal from '../components/PlayerDetailModal.jsx'
import './Takimim.css'
import './Transfer.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
// Picker/autofill yalnızca GÜNCEL 7 maçın 14 takımından oyuncu gösterir.
// (Havuz yükleme için 20 takım tutar; ama yeni seçimler yalnızca güncel takımlardan.)
const CURRENT_TEAM_IDS = new Set(UEL_TEAMS.map((t) => t.id))
const POS_TABS = [{ key: null, label: 'Tümü' }, ...POS_ORDER.map((p) => ({ key: p, label: p }))]
const RING = { KL: 'ring-gk', DF: 'ring-def', OS: 'ring-mid', FW: 'ring-fwd' }
const TAG = { KL: 'tag-gk', DF: 'tag-def', OS: 'tag-mid', FW: 'tag-fwd' }
const TOTAL_SLOTS = SQUAD_TOTALS.KL + SQUAD_TOTALS.DF + SQUAD_TOTALS.OS + SQUAD_TOTALS.FW // 15

function signature(roster, captainId) {
  const parts = []
  for (const pos of POS_ORDER) for (const s of roster[pos]) parts.push(`${s.player?.id ?? '_'}:${s.starter ? 1 : 0}:${s.benchOrder ?? ''}`)
  parts.push(`C${captainId ?? ''}`)
  return parts.join('|')
}

/* ---- Yuva ---- */
function UelSlot({ pos, player, info, teamShort, isCaptain, isTarget, onClick, posTag, subIn, subOut }) {
  const meta = POSITIONS[pos]
  const ring = RING[pos] || 'ring-mid'
  const tag = posTag ? <span className={`pos-tag ${TAG[pos] || 'tag-mid'}`}>{posTag}</span> : null
  if (!player) {
    return (
      <button type="button" className={`tm-player empty${isTarget ? ' target' : ''}`} onClick={onClick} aria-label={`${meta.label} (boş)`}>
        {tag}
        <span className={`ava av-empty ${ring}`}><span className="ava-plus">+</span></span>
        {!posTag && <span className="name-plate np-muted"><span className="nm">{meta.label}</span></span>}
      </button>
    )
  }
  return (
    <button type="button" className={`tm-player${isTarget ? ' target' : ''}`} onClick={onClick}>
      {isCaptain && <span className="capC">C</span>}
      {subIn && <span className="sub-badge in" title="Yedekten girdi">↑</span>}
      {subOut && <span className="sub-badge out" title="Sahadan çıktı">↓</span>}
      {tag}
      <span className={`ava ${ring}`}><PlayerPhoto id={player.id} name={player.name} bg={player.clubBg} fg={player.clubFg} /></span>
      <span className={`name-plate${teamShort ? ' np-locked' : ''}`}>
        {teamShort ? (
          <>
            {/* Deadline sonrası: soyadı (tam, kesilmez) üstte;
                altında takım kısaltması (altın) + puan */}
            <span className="nm nm-surname">{surname(player.name)}</span>
            <span className="pr pr-locked">
              <span className="nm-team">{teamShort}</span>
              <span className="pr-pts tnum">{info}</span>
            </span>
          </>
        ) : (
          <>
            <span className="nm">{player.name}</span>
            <span className="pr tnum">{info}</span>
          </>
        )}
      </span>
    </button>
  )
}

export default function UelTest({ slot }) {
  const { user } = useAuth()

  const [roster, setRoster] = useState(buildEmptyRoster)
  const [captainId, setCaptainId] = useState(null)
  const [savedSig, setSavedSig] = useState(() => signature(buildEmptyRoster(), null))
  const [picker, setPicker] = useState(null) // { pos, index }
  const [action, setAction] = useState(null) // { pos, index }
  const [swapMode, setSwapMode] = useState(null) // { source:{pos,index}, targetType }
  const [posFilter, setPosFilter] = useState(null)
  const [clubFilter, setClubFilter] = useState('')
  const [search, setSearch] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [api, setApi] = useState({ loading: true, error: null, players: [] })
  const [fixtures, setFixtures] = useState([])
  const [squadLoading, setSquadLoading] = useState(Boolean(user))
  const [scores, setScores] = useState({ loading: false, ptsById: new Map(), finishedById: new Map(), partsById: new Map(), forKey: null })
  const [detailPlayer, setDetailPlayer] = useState(null) // deadline sonrası oyuncu detay modalı

  const now = useNow(30000) // gerçek zamanlı deadline kontrolü (30 sn)
  const locked = now >= UEL_DEADLINE_MS
  const deadlineText = formatDeadline(UEL_DEADLINE_MS)

  // Oyuncu havuzu + maçlar
  useEffect(() => {
    let alive = true
    loadUelPlayers()
      .then((players) => alive && setApi({ loading: false, error: null, players }))
      .catch((err) => alive && setApi({ loading: false, error: err.message || String(err), players: [] }))
    loadUelFixtures()
      .then((fx) => alive && setFixtures(fx))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Kayıtlı kadroyu yükle. deps = [user?.id, slot] → AuthProvider'ın is_admin
  // tazelemesi user NESNESİNİ değiştirse de (aynı id) effect yeniden çalışmaz;
  // böylece yavaş havuz yüklemesi sürerken effect iptal edilip veri kaybolmaz.
  const userId = user?.id
  useEffect(() => {
    if (!userId) {
      setSquadLoading(false)
      return
    }
    let alive = true
    setSquadLoading(true)
    ;(async () => {
      try {
        // ÖNCE oyuncu havuzu (yavaş; 20 takım), SONRA kadro — sıralı.
        const players = await loadUelPlayers().catch(() => [])
        if (!alive) return
        const loaded = await loadUelSquad({ userId, slot })
        if (!alive) return
        if (!loaded) return // bu kullanıcı/slot için kayıt yok → boş kadro
        const byId = Object.fromEntries((players || []).map((p) => [String(p.id), p]))
        // Tanı: kayıtlı player_id'ler havuzda var mı?
        const savedIds = loaded.rows.map((r) => r.player_id)
        const poolIds = new Set((players || []).map((p) => p.id))
        const matched = savedIds.filter((id) => poolIds.has(id) || poolIds.has(Number(id))).length
        console.log('[UEL] ID eşleşme: %d/%d', matched, savedIds.length)
        console.log('[UEL] örnek kayıtlı id:', savedIds.slice(0, 6).map((id) => `${id}(${typeof id})`))
        console.log('[UEL] örnek havuz id:', (players || []).slice(0, 6).map((p) => `${p.id}(${typeof p.id})`))
        console.log('[UEL] havuz takım sayısı=%d, oyuncu sayısı=%d', new Set((players || []).map((p) => p.club)).size, (players || []).length)
        console.log('[UEL] havuz takımları:', [...new Set((players || []).map((p) => p.club))])
        const r = rebuildUelRoster(loaded.rows, byId)
        const resolved = ['KL', 'DF', 'OS', 'FW'].reduce((n, p) => n + r[p].filter((s) => s.player).length, 0)
        console.log('[UEL] rebuild → çözülen oyuncu=%d / havuz=%d / kayıt satırı=%d', resolved, (players || []).length, loaded.rows.length)
        setRoster(r)
        if (resolved < loaded.rows.length) {
          setSaveMsg(`⚠ ${loaded.rows.length - resolved}/${loaded.rows.length} kayıtlı oyuncu güncel havuzda yok (çıkarılan maçların takımlarından olabilir) — kadroyu yeniden kurup kaydedin.`)
        }
        setCaptainId(loaded.captainId ?? null)
        setSavedSig(signature(r, loaded.captainId ?? null))
      } catch (e) {
        if (alive) setSaveMsg('⚠ Kadro yüklenemedi: ' + (e.message || String(e)))
      } finally {
        if (alive) setSquadLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [userId, slot])

  useEffect(() => {
    if (!saveMsg) return
    const t = setTimeout(() => setSaveMsg(''), 2500)
    return () => clearTimeout(t)
  }, [saveMsg])

  const rosterList = useMemo(() => rosterPlayers(roster), [roster])
  const rosterIds = useMemo(() => new Set(rosterList.map((p) => p.id)), [rosterList])
  const clubCounts = useMemo(() => {
    const c = {}
    for (const p of rosterList) c[p.club] = (c[p.club] || 0) + 1
    return c
  }, [rosterList])
  const filledCount = rosterList.length
  const spent = rosterList.reduce((s, p) => s + p.price, 0)
  const remaining = TOTAL_BUDGET - spent
  const overBudget = remaining < 0
  const spentPct = Math.max(0, Math.min(100, (spent / TOTAL_BUDGET) * 100))
  const dirty = signature(roster, captainId) !== savedSig
  const captainPlayer = rosterList.find((p) => p.id === captainId) || null

  // Puanlar (deadline sonrası)
  const scoreKey = locked ? rosterList.map((p) => p.id).join(',') : null
  useEffect(() => {
    if (!locked || api.loading || !fixtures.length || rosterList.length === 0) return
    if (scores.forKey === scoreKey) return
    let alive = true
    setScores((s) => ({ ...s, loading: true }))
    computeUelScores(rosterList, fixtures)
      .then((res) => alive && setScores({ loading: false, ptsById: res.ptsById, finishedById: res.finishedById, partsById: res.partsById, forKey: scoreKey }))
      .catch(() => alive && setScores((s) => ({ ...s, loading: false, forKey: scoreKey })))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, scoreKey, fixtures, api.loading])

  const fieldByPos = useMemo(() => {
    const map = {}
    for (const pos of POS_ORDER) map[pos] = roster[pos].map((slot2, index) => ({ slot: slot2, pos, index })).filter((e) => e.slot.starter)
    return map
  }, [roster])
  const benchEntries = useMemo(() => {
    const list = []
    for (const pos of POS_ORDER) roster[pos].forEach((slot2, index) => { if (!slot2.starter) list.push({ slot: slot2, pos, index }) })
    return list.sort((a, b) => (a.slot.benchOrder ?? 99) - (b.slot.benchOrder ?? 99))
  }, [roster])

  const weekAllFinished = locked && rosterList.length > 0 && rosterList.every((p) => scores.finishedById.get(p.id))
  const applySubs = weekAllFinished && !scores.loading
  const display = useMemo(
    () => applyAutoSubs({ fieldByPos, benchEntries, ptsById: scores.ptsById, finishedById: scores.finishedById, apply: applySubs }),
    [fieldByPos, benchEntries, scores.ptsById, scores.finishedById, applySubs]
  )
  const totalPoints = !locked ? null : scores.loading ? '…' : computeTotalPoints({ field: display.field, finishedById: scores.finishedById, captainId })

  // Yuva altı bilgi: deadline öncesi rakip/değer değil, sadeleştirilmiş → değer;
  // deadline sonrası puan.
  const infoFor = (view) => {
    if (!view.player) return null
    if (locked) return scores.loading ? '…' : view.finished ? `${view.pts ?? 0} P` : '-'
    return `₺${view.player.price}M`
  }

  const setSlotPlayer = (pos, index, player) => {
    setRoster((d) => {
      const next = cloneRoster(d)
      next[pos][index].player = player
      return next
    })
  }

  const openPicker = (pos, index) => {
    setPicker({ pos, index })
    setPosFilter(pos)
    setClubFilter('')
    setSearch('')
    setAction(null)
  }

  const addPlayer = (player) => {
    if (!picker) return
    setSlotPlayer(picker.pos, picker.index, player)
    setPicker(null)
  }

  const clearSlot = (pos, index) => {
    const pl = roster[pos][index].player
    setSlotPlayer(pos, index, null)
    if (pl && pl.id === captainId) setCaptainId(null)
    setAction(null)
  }

  const doSwap = (a, b) => {
    const res = pureSwap(roster, captainId, a, b)
    if (res.error) {
      setSaveMsg('⚠ ' + res.error)
      return
    }
    setRoster(res.roster)
    setCaptainId(res.captainId)
    setSaveMsg('Yer değiştirildi ✓')
  }

  const onSlotClick = (pos, index, view) => {
    if (locked) {
      // Deadline sonrası: oyuncu detay modalı (aksiyonsuz, puan kırılımıyla)
      if (view.player) setDetailPlayer(view.player)
      return
    }
    if (swapMode) {
      const targetSlot = roster[pos][index]
      const validType = swapMode.targetType === 'bench' ? !targetSlot.starter : targetSlot.starter
      const isSource = swapMode.source.pos === pos && swapMode.source.index === index
      setSwapMode(null)
      if (isSource || !validType) return
      doSwap(swapMode.source, { pos, index })
      return
    }
    if (!view.player) {
      openPicker(pos, index)
      return
    }
    setAction({ pos, index })
  }

  const startSwap = (targetType) => {
    if (!action) return
    setSwapMode({ source: { pos: action.pos, index: action.index }, targetType })
    setAction(null)
  }

  const autoFill = () => {
    const next = cloneRoster(roster)
    const used = new Set(rosterList.map((p) => p.id))
    const cc = { ...clubCounts }
    for (const pos of POS_ORDER) {
      for (const s of next[pos]) {
        if (s.player) continue
        const pick = api.players.find(
          (p) => CURRENT_TEAM_IDS.has(p.teamId) && p.pos === pos && !used.has(p.id) && (cc[p.club] || 0) < MAX_PER_CLUB
        )
        if (!pick) continue
        s.player = pick
        used.add(pick.id)
        cc[pick.club] = (cc[pick.club] || 0) + 1
      }
    }
    setRoster(next)
    setSaveMsg('Boş yuvalar dolduruldu ✓')
  }

  const onSave = async () => {
    if (overBudget || filledCount !== TOTAL_SLOTS || !dirty) return
    if (!user) {
      setSaveMsg('⚠ Giriş yapılmadı — kayıt için giriş gerekli.')
      return
    }
    const counts = starterCounts(roster)
    const res = await saveUelSquad({ userId: user.id, slot, formation: formationLabel(counts), captainId, roster })
    if (res?.ok) {
      setSavedSig(signature(roster, captainId))
      setSaveMsg('Kadro kaydedildi ✓')
    } else if (res?.skipped) {
      setSaveMsg('⚠ Supabase yapılandırılmadı — kaydedilemedi.')
    } else {
      const m = res?.error?.message || res?.error?.details || String(res?.error || 'bilinmeyen hata')
      setSaveMsg('⚠ Kaydedilemedi: ' + m)
    }
  }

  const canSave = filledCount === TOTAL_SLOTS && !overBudget && dirty

  // Picker liste
  // Picker takım filtresi seçenekleri (güncel 14 takım)
  const clubOptions = useMemo(
    () =>
      [...new Set(api.players.filter((p) => CURRENT_TEAM_IDS.has(p.teamId)).map((p) => p.club))].sort((a, b) =>
        a.localeCompare(b, 'tr')
      ),
    [api.players]
  )

  const list = useMemo(() => {
    let l = api.players.filter((p) => CURRENT_TEAM_IDS.has(p.teamId))
    if (posFilter) l = l.filter((p) => p.pos === posFilter)
    if (clubFilter) l = l.filter((p) => p.club === clubFilter)
    const q = search.trim().toLocaleLowerCase('tr')
    if (q) l = l.filter((p) => p.name.toLocaleLowerCase('tr').includes(q))
    return [...l].sort((a, b) => a.name.localeCompare(b.name, 'tr')).slice(0, 300)
  }, [api.players, posFilter, clubFilter, search])

  const pickerSlotPlayer = picker ? roster[picker.pos][picker.index].player : null
  const slotVal = pickerSlotPlayer ? pickerSlotPlayer.price : 0

  const renderView = (view, opts = {}) => {
    const { pos, index, player, subIn, subOut } = view
    const isSwapSource = Boolean(swapMode) && swapMode.source.pos === pos && swapMode.source.index === index
    const isTarget = Boolean(swapMode) && !isSwapSource && (swapMode.targetType === 'bench' ? !view.starter : view.starter)
    return (
      <UelSlot
        key={`${pos}-${index}-${player?.id ?? 'e'}`}
        pos={pos}
        player={player}
        info={infoFor(view)}
        teamShort={locked && player ? player.clubShort || null : null}
        isCaptain={player ? player.id === captainId : false}
        isTarget={isTarget}
        onClick={(e) => { e.stopPropagation(); onSlotClick(pos, index, view) }}
        posTag={opts.posTag}
        subIn={subIn}
        subOut={subOut}
      />
    )
  }

  const actionSlot = action ? roster[action.pos][action.index] : null
  const actionPlayer = actionSlot?.player || null

  return (
    <div className="tm-page" onClick={() => swapMode && setSwapMode(null)}>
      {/* Hero */}
      <div className="tm-hero">
        <div className="hero-crest">FFS</div>
        <div className="hero-id">
          <h1 className="semi">UEL Test</h1>
          <p>Avrupa Ligi · 6 Ağustos · <b>{slot}</b>{user ? ` · ${user.username}` : ' · misafir'}</p>
        </div>
        <div className="hero-word">UEL</div>
        <div className="hero-right">
          <div className="chip chip-deadline">
            <span className="k">Deadline</span>
            <b className="tnum">{deadlineText}</b>
          </div>
        </div>
      </div>

      {/* Statlar */}
      <div className="stats">
        <div className="tm-stat">
          <div className="stat-head"><span className="eyebrow">Bütçe</span></div>
          <div className="budget-vals">
            <div className="bv"><div className="l">Toplam</div><div className="v cond tnum">{TOTAL_BUDGET.toFixed(1)}M</div></div>
            <div className="bv"><div className="l">Kalan</div><div className={`v rem cond tnum${overBudget ? ' neg' : ''}`}>{remaining.toFixed(1)}M</div></div>
          </div>
          <div className="budget-bar"><div className="budget-fill" style={{ width: `${spentPct}%` }} /></div>
          <div className="budget-meta tnum"><span>{spent.toFixed(1)}M harcandı</span><span>Kulüp limiti: max {MAX_PER_CLUB}</span></div>
        </div>

        <div className="tm-stat">
          <div className="stat-head"><span className="eyebrow">Kaptan</span></div>
          {captainId ? (
            <div className="cap-row"><span className="cap-badge cond">C</span><span className="stat-val sm cond">{captainPlayer?.name}</span></div>
          ) : (
            <div className="stat-val sm cond warn">⚠ Seçilmedi</div>
          )}
        </div>

        <div className="tm-stat">
          <div className="stat-head"><span className="eyebrow">Toplam Puan</span></div>
          <div className="stat-val cond tnum">{locked ? totalPoints : '—'}{locked && <small> P</small>}</div>
        </div>
      </div>

      {/* Durum ipucu */}
      {api.loading ? (
        <p className="hint">Oyuncular yükleniyor…</p>
      ) : api.error ? (
        <div className="lock-note">⚠ Oyuncu verisi alınamadı: {api.error}</div>
      ) : locked ? (
        <div className="lock-note">🔒 Deadline geçti, kadro kilitlendi. Maçlar bittikçe puanlar işlenir.</div>
      ) : swapMode ? (
        <div className="swap-note">
          {swapMode.targetType === 'bench' ? 'Yedeğe göndereceğin yuvayı seç.' : "İlk 11'e alacağın yuvayı seç."}
          <button type="button" className="swap-cancel" onClick={(e) => { e.stopPropagation(); setSwapMode(null) }}>İptal</button>
        </div>
      ) : (
        <p className="hint">Boş yuvaya tıkla → oyuncu seç. Dolu oyuncuya tıkla → kaptan / yedek / değiştir.</p>
      )}

      {/* Saha */}
      <div className="pitch-wrap">
        <div className="tm-pitch">
          <div className="field">
            <div className="pitch-lines" aria-hidden="true">
              <div className="halfway" /><div className="circle" /><div className="cspot" />
              <div className="box-t" /><div className="goal-t" /><div className="spot-t" /><div className="arc-t" />
              <div className="box-b" /><div className="goal-b" /><div className="spot-b" /><div className="arc-b" />
            </div>
            <div className="rows">
              <div className="row">{display.field.FW.map((d) => renderView({ ...d, starter: true }))}</div>
              <div className="row">{display.field.OS.map((d) => renderView({ ...d, starter: true }))}</div>
              <div className="row">{display.field.DF.map((d) => renderView({ ...d, starter: true }))}</div>
              <div className="row">{display.field.KL.map((d) => renderView({ ...d, starter: true }))}</div>
            </div>
          </div>
          <div className="bench-div"><span className="bench-label">Yedekler</span></div>
          <div className="bench">{display.bench.map((d) => renderView({ ...d, starter: false }, { posTag: d.pos }))}</div>
        </div>
      </div>

      {/* Aksiyon çubuğu */}
      <div className="actionbar">
        <div className="squad-count">
          <span className="count-num cond tnum"><b>{filledCount}</b>/{TOTAL_SLOTS}</span>
          <span className="lbl">oyuncu · kadro {filledCount === TOTAL_SLOTS ? 'tam' : 'eksik'}</span>
        </div>
        {!locked && (
          <div className="save-wrap" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {overBudget && <span className="budget-warn">Bütçe aşıldı</span>}
            {!overBudget && saveMsg && <span className={`save-note show ${saveMsg.startsWith('⚠') ? 'warn' : 'ok'}`}>{saveMsg}</span>}
            <button type="button" className="tr-btn-autofill" onClick={autoFill} disabled={api.loading || filledCount === TOTAL_SLOTS}>
              Otomatik Doldur
            </button>
            <button type="button" className={`btn-save${canSave ? ' active' : ''}`} onClick={onSave}>Kadroyu Kaydet</button>
          </div>
        )}
      </div>

      {/* Deadline sonrası oyuncu detay modalı (aksiyonsuz, gerçek puan kırılımı) */}
      {detailPlayer && (
        <PlayerDetailModal
          player={detailPlayer}
          isStarter
          isCaptain={detailPlayer.id === captainId}
          locked={locked}
          week={null}
          fixture={uelFixtureForTeam(fixtures, detailPlayer.teamId)}
          hideActions
          breakdown={(scores.partsById.get(detailPlayer.id) || []).map((p) => ({
            stat: p.label,
            value: p.n != null && p.n !== 0 ? String(p.n) : '',
            pts: p.pts,
          }))}
          onClose={() => setDetailPlayer(null)}
        />
      )}

      {/* Aksiyon modalı (dolu yuva) */}
      {action && actionPlayer && !locked && (
        <div className="tr-overlay show" onClick={() => setAction(null)}>
          <div className="tr-selmodal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="tr-sm-head">
              <div className="tr-sm-titlerow">
                <h2 className="tr-sm-title">{actionPlayer.name}</h2>
                <button className="tr-mclose" onClick={() => setAction(null)}>×</button>
              </div>
              <div className="tr-sm-ctx">
                <span className="cav" style={{ background: actionPlayer.clubBg, color: actionPlayer.clubFg }}>{initials(actionPlayer.name)}</span>
                <span className="ct">{actionPlayer.club} · {POSITIONS[action.pos].label}</span>
                <span className={`cpos ${TAG[action.pos]}`}>{action.pos}</span>
              </div>
            </div>
            <div style={{ padding: '14px 22px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button type="button" className="tr-btn-save" style={{ width: '100%' }} onClick={() => openPicker(action.pos, action.index)}>Değiştir</button>
              {captainId === actionPlayer.id ? (
                <button type="button" className="tr-btn-empty" onClick={() => { setCaptainId(null); setAction(null) }}>Kaptanlığı Kaldır</button>
              ) : (
                actionSlot.starter && (
                  <button type="button" className="tr-btn-guide" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setCaptainId(actionPlayer.id); setAction(null) }}>Kaptan Yap</button>
                )
              )}
              <button type="button" className="tr-btn-guide" style={{ width: '100%', justifyContent: 'center' }} onClick={() => startSwap(actionSlot.starter ? 'bench' : 'starter')}>
                {actionSlot.starter ? 'Yedeğe Al' : "İlk 11'e Al"}
              </button>
              <button type="button" className="tr-btn-empty" onClick={() => clearSlot(action.pos, action.index)}>Yuvayı Boşalt</button>
            </div>
          </div>
        </div>
      )}

      {/* Oyuncu seç modalı */}
      {picker && !locked && (
        <div className="tr-overlay show" onClick={() => setPicker(null)}>
          <div className="tr-selmodal" onClick={(e) => e.stopPropagation()}>
            <div className="tr-sm-head">
              <div className="tr-sm-titlerow">
                <h2 className="tr-sm-title">{POSITIONS[picker.pos].label} Seç</h2>
                <button className="tr-mclose" onClick={() => setPicker(null)}>×</button>
              </div>
              <div className="tr-sm-tabs">
                {POS_TABS.map((t) => (
                  <button key={t.label} type="button" className={`tr-sm-tab${posFilter === t.key ? ' on' : ''}`} onClick={() => setPosFilter(t.key)}>{t.label}</button>
                ))}
              </div>
              <div className="tr-sm-filters" style={{ marginTop: 12 }}>
                <select
                  value={clubFilter}
                  onChange={(e) => setClubFilter(e.target.value)}
                  style={{
                    width: '100%', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                    color: clubFilter ? 'var(--gold-soft)' : 'var(--ink)', background: '#0f1a14',
                    border: '1px solid var(--border-strong)', padding: '10px 13px', borderRadius: 11, cursor: 'pointer',
                  }}
                >
                  <option value="">Tüm takımlar</option>
                  {clubOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="tr-sm-search">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Oyuncu ara…" />
              </div>
              <div className="tr-sm-budget">
                <span className="l">Kullanılabilir bütçe</span>
                <span className="v cond tnum">{(remaining + slotVal).toFixed(1)}M</span>
              </div>
              {pickerSlotPlayer && (
                <button type="button" className="tr-btn-empty" onClick={() => { clearSlot(picker.pos, picker.index); setPicker(null) }}>Bu yuvayı boşalt</button>
              )}
            </div>
            <div className="tr-sm-list">
              {api.loading && <div className="tr-empty-list">Yükleniyor…</div>}
              {!api.loading && list.length === 0 && <div className="tr-empty-list">Oyuncu bulunamadı.</div>}
              {!api.loading && list.map((p) => {
                const inRoster = rosterIds.has(p.id)
                const clubMaxed = (clubCounts[p.club] || 0) >= MAX_PER_CLUB && !inRoster
                const freed = picker && p.pos === picker.pos ? slotVal : 0
                const unaffordable = !inRoster && !clubMaxed && remaining + freed < p.price
                const blocked = inRoster || clubMaxed || unaffordable || p.pos !== picker.pos
                return (
                  <div key={p.id} className={`tr-prow${blocked ? ' dim' : ''}`}>
                    <span className="pav" style={{ background: p.clubBg, color: p.clubFg }}>{initials(p.name)}</span>
                    <span className="pmeta">
                      <span className="pn">{p.name}</span>
                      <span className="pteam">{p.club}</span>
                      <span className="psub">
                        {POSITIONS[p.pos].label}
                        {p.pos !== picker.pos ? (
                          <span className="pstatus st-full">Farklı mevki</span>
                        ) : (
                          <>
                            {inRoster && <span className="pstatus st-inrost">Kadroda</span>}
                            {clubMaxed && <span className="pstatus st-full">Kulüp dolu (max {MAX_PER_CLUB})</span>}
                            {unaffordable && <span className="pstatus st-budget">Bütçe yetersiz</span>}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="pval cond tnum">{p.price.toFixed(1)}M</span>
                    <button type="button" className="padd" disabled={blocked} onClick={() => addPlayer(p)} aria-label={`${p.name} ekle`}>+</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
