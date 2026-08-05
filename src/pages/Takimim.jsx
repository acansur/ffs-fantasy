import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useSquad } from '../lib/squadStore.jsx'
import { loadSuperLigPlayers } from '../lib/apiFootball.js'
import { getVisibleWeeks, isLocked, formatDeadline, getTeamFixture } from '../lib/weeks.js'
import { computeWeekScores, applyAutoSubs, computeTotalPoints } from '../lib/weekScores.js'
import WeekBar from '../components/WeekBar.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import PlayerDetailModal from '../components/PlayerDetailModal.jsx'
import ScoringGuide from '../components/ScoringGuide.jsx'
import {
  POSITIONS,
  CLUBS,
  TOTAL_BUDGET,
  VIEWS,
  surname,
} from '../lib/squadData.js'
import './Takimim.css'
import './Transfer.css' // .tr-btn-guide / .tr-overlay / .tr-guide / .tr-mclose (Transfer ile aynı tasarım)

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

// Pozisyon → halka / rozet renk sınıfı (yeşil KL, kırmızı DF, mavi OS, turuncu FW)
const RING = { KL: 'ring-gk', DF: 'ring-def', OS: 'ring-mid', FW: 'ring-fwd' }
const TAG = { KL: 'tag-gk', DF: 'tag-def', OS: 'tag-mid', FW: 'tag-fwd' }

// "14 Ağu" biçiminde maç günü (Türkiye saati)
const matchDay = (iso) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', timeZone: 'Europe/Istanbul' })

/* ---- İkonlar (ince stroke SVG) ---- */
const IconWallet = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18v3" />
    <rect x="3" y="8.5" width="18" height="11" rx="2.5" />
    <circle cx="16.5" cy="14" r="1.3" fill="currentColor" stroke="none" />
  </svg>
)
const IconStar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
  </svg>
)
const IconSwap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8.5h13l-3.2-3.3M20 15.5H7l3.2 3.3" />
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)
const IconSave = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8.5 4v5h6" />
    <rect x="8.5" y="13" width="7" height="5" />
  </svg>
)
const IconBolt = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
  </svg>
)
const IconGuide = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" /></svg>
)

function SquadSlot({ pos, player, info, isCaptain, isSelected, isTarget, onClick, posTag, skeleton, subIn, subOut }) {
  const meta = POSITIONS[pos]
  const ring = RING[pos] || 'ring-mid'
  const tag = posTag ? <span className={`pos-tag ${TAG[pos] || 'tag-mid'}`}>{posTag}</span> : null

  // Kadro Supabase'den yüklenirken soluk animasyonlu placeholder
  if (skeleton) {
    return (
      <div className="tm-player skeleton" aria-hidden="true">
        <span className="ava skel" />
        <span className="name-plate skel-plate">
          <span className="skel-line" />
        </span>
      </div>
    )
  }

  if (!player) {
    // Boş yuva → tıklanamaz "hayalet": +'ı yok, soluk silüet, kesikli pozisyon
    // renkli halka. Ekleme yalnızca Transfer'den yapılır.
    return (
      <div className="tm-player ghost" aria-label={`${meta.label} (boş)`}>
        {tag}
        <span className={`ava ghost ${ring}`}>
          <svg className="silh" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="8.2" r="4" />
            <path d="M4 20.5c0-4.4 3.6-7.2 8-7.2s8 2.8 8 7.2z" />
          </svg>
        </span>
        <span className="name-plate np-muted"><span className="nm">{posTag ? 'Yedek' : meta.label}</span></span>
      </div>
    )
  }

  // Kulüp rengi oyuncu nesnesinden gelir (API); mock için CLUBS'a düşer
  const bg = player.clubBg || CLUBS[player.club]?.bg || '#334155'
  const fg = player.clubFg || CLUBS[player.club]?.fg || '#ffffff'
  return (
    <button
      type="button"
      className={`tm-player${isSelected ? ' sel' : ''}${isTarget ? ' target' : ''}`}
      onClick={onClick}
    >
      {isCaptain && <span className="capC">C</span>}
      {/* Otomatik yedek: girdi (yeşil ↑) / çıktı (gri ↓) */}
      {subIn && <span className="sub-badge in" title="Yedekten girdi">↑</span>}
      {subOut && <span className="sub-badge out" title="Sahadan çıktı">↓</span>}
      {tag}
      {/* Gerçek fotoğraf korunur; halka .ava etrafında (inset:-3px) */}
      <span className={`ava ${ring}`}>
        <PlayerPhoto id={player.id} name={player.name} bg={bg} fg={fg} />
      </span>
      <span className="name-plate">
        <span className="nm">{player.name}</span>
        <span className="pr tnum">{info}</span>
      </span>
    </button>
  )
}

export default function Takimim() {
  const { user } = useAuth()
  const {
    roster,
    captainId,
    makeCaptain,
    clearCaptain,
    week,
    setWeek,
    weeks,
    fixtures,
    weekOverrides,
    weeksLoading,
    squadLoading,
    rosterList,
    remaining,
    dirty,
    saveArrangement,
    swapSlots,
  } = useSquad()

  const [view, setView] = useState('next')
  const [detail, setDetail] = useState(null) // { pos, index, player, starter } — açık oyuncu detay modalı
  const [swapMode, setSwapMode] = useState(null) // { source:{pos,index}, targetType:'bench'|'starter' }
  const [saveMsg, setSaveMsg] = useState('')
  const [scoringOpen, setScoringOpen] = useState(false)
  // Deadline sonrası haftalık puanlar: { loading, ptsById, finishedById, forKey }
  const [scores, setScores] = useState({ loading: false, ptsById: new Map(), finishedById: new Map(), forKey: null })

  const now = Date.now()
  const visibleWeeks = getVisibleWeeks(weeks, now)
  const selectedWeek = weeks.find((w) => w.round === week) || null
  // Admin manuel override varsa deadline'dan bağımsız uygulanır
  const override = weekOverrides?.[week]
  const locked = override != null ? override : isLocked(selectedWeek, now)
  const deadlineText = selectedWeek ? formatDeadline(selectedWeek.deadline) : '—'

  const onSelectWeek = (r) => {
    setWeek(r)
    setDetail(null)
    setSwapMode(null)
  }

  // Transfer ekranı hızlı açılsın diye oyuncu listesini arka planda önyükle
  useEffect(() => {
    loadSuperLigPlayers().catch(() => {})
  }, [])

  useEffect(() => {
    if (!saveMsg) return
    const t = setTimeout(() => setSaveMsg(''), 2500)
    return () => clearTimeout(t)
  }, [saveMsg])

  // Deadline geçtiğinde: kadrodaki her oyuncunun o haftaki puanını
  // (tamamlanmış maçlardan) scoring.js ile hesapla.
  const scoreKey = locked ? `${week}:${rosterList.map((p) => p.id).join(',')}` : null
  useEffect(() => {
    if (!locked || weeksLoading || squadLoading) return
    if (!fixtures.length || rosterList.length === 0) return
    if (scores.forKey === scoreKey) return
    let alive = true
    setScores((s) => ({ ...s, loading: true }))
    computeWeekScores(rosterList, week, fixtures)
      .then((res) => {
        if (alive) setScores({ loading: false, ptsById: res.ptsById, finishedById: res.finishedById, forKey: scoreKey })
      })
      .catch(() => {
        if (alive) setScores((s) => ({ ...s, loading: false, forKey: scoreKey }))
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, scoreKey, fixtures, weeksLoading, squadLoading])

  const overBudget = remaining < 0
  const captainPlayer = rosterList.find((p) => p.id === captainId) || null
  const filledCount = rosterList.length
  const spent = TOTAL_BUDGET - remaining
  const spentPct = Math.max(0, Math.min(100, (spent / TOTAL_BUDGET) * 100))

  // Yuva altı bilgi satırı:
  // - Deadline gelmediyse görünüme göre (sonraki maç: tarih + rakip / oyuncu değeri)
  // - Deadline geldiyse maç durumuna göre puan (bitmediyse "-", bittiyse puan)
  // Deadline öncesi yuva altı bilgisi (deadline sonrası puan renderView'da).
  const slotInfoFor = (player) => {
    if (view === 'value') return `₺${player.price}M`
    const fx = getTeamFixture(fixtures, player.club, week)
    if (!fx) return '—'
    const isHome = fx.teams?.home?.name === player.club
    const opp = isHome ? fx.teams?.away?.name : fx.teams?.home?.name
    const day = fx.fixture?.date ? matchDay(fx.fixture.date) : '—'
    return `${day} · ${isHome ? 'vs' : '@'} ${opp || '—'}`
  }

  const fieldByPos = useMemo(() => {
    const map = {}
    for (const pos of POS_ORDER) {
      map[pos] = roster[pos]
        .map((slot, index) => ({ slot, pos, index }))
        .filter((e) => e.slot.starter)
    }
    return map
  }, [roster])

  const benchEntries = useMemo(() => {
    const list = []
    for (const pos of POS_ORDER) {
      roster[pos].forEach((slot, index) => {
        if (!slot.starter) list.push({ slot, pos, index })
      })
    }
    return list.sort((a, b) => (a.slot.benchOrder ?? 99) - (b.slot.benchOrder ?? 99))
  }, [roster])

  // Haftanın son maçı bitti mi (kadrodaki tüm oyuncuların maçları tamamlandı)
  const weekAllFinished =
    locked && rosterList.length > 0 && rosterList.every((p) => scores.finishedById.get(p.id))

  // Görsel saha düzeni: son maç bitince otomatik yedek uygulanır (yalnızca görsel).
  const applySubs = weekAllFinished && !scores.loading
  const display = useMemo(
    () =>
      applyAutoSubs({
        fieldByPos,
        benchEntries,
        ptsById: scores.ptsById,
        finishedById: scores.finishedById,
        apply: applySubs,
      }),
    [fieldByPos, benchEntries, scores.ptsById, scores.finishedById, applySubs]
  )

  // Toplam puan: deadline sonrası kümülatif (biten maçlar), son maç bitince
  // otomatik yedek uygulanmış final. Deadline öncesi gösterilmez.
  const totalPoints = !locked
    ? null
    : scores.loading
      ? '…'
      : computeTotalPoints({ field: display.field, finishedById: scores.finishedById, captainId })

  // Yuva tıklaması: yer değiştirme modundaysa hedef seç; değilse detay modalı aç
  const onSlotClick = (pos, index, viewPlayer, viewStarter) => {
    if (swapMode) {
      if (locked) {
        setSwapMode(null)
        return
      }
      const targetSlot = roster[pos][index]
      const validType = swapMode.targetType === 'bench' ? !targetSlot.starter : targetSlot.starter
      if (!validType) {
        // Yanlış tür yuvaya (ya da kaynağın kendisine) tıklama iptal eder
        setSwapMode(null)
        return
      }
      const err = swapSlots(swapMode.source, { pos, index })
      setSwapMode(null)
      setSaveMsg(err || 'Yer değiştirildi ✓')
      return
    }
    // Detay modalı gösterilen oyuncu için açılır (deadline sonrası otomatik
    // yedekte sahaya çıkan/çıkarılan oyuncu gösterilir).
    const dp = viewPlayer ?? roster[pos][index].player
    if (!dp) return
    setDetail({ pos, index, player: dp, starter: viewStarter ?? roster[pos][index].starter })
  }

  // Modaldan yer değiştirmeyi başlat: modal kapanır, hedef yuvalar vurgulanır
  const startSwap = (targetType) => {
    if (!detail || locked) return
    setSwapMode({ source: detail, targetType })
    setDetail(null)
  }

  const saveSquad = async () => {
    if (overBudget) return
    await saveArrangement()
    setSaveMsg('Takım kaydedildi ✓')
  }

  // view = { pos, index, player, starter, subIn, subOut, pts, finished } (gösterim nesnesi)
  const renderView = (view, opts = {}) => {
    const { pos, index, player, starter, subIn, subOut } = view
    const isSwapSource =
      Boolean(swapMode) && swapMode.source.pos === pos && swapMode.source.index === index
    const isTarget =
      Boolean(swapMode) && !isSwapSource && (swapMode.targetType === 'bench' ? !starter : starter)
    // Deadline sonrası puan bilgisi doğrudan gösterim nesnesinden gelir
    // (maç bitmemişse "-", bittiyse "N P"); öncesinde görünüm dropdown'ına göre.
    const info = !player
      ? null
      : locked
        ? scores.loading
          ? '…'
          : view.finished
            ? `${view.pts ?? 0} P`
            : '-'
        : slotInfoFor(player)
    return (
      <SquadSlot
        key={`${pos}-${index}-${player?.id ?? 'e'}`}
        pos={pos}
        player={player}
        info={info}
        isCaptain={player ? player.id === captainId : false}
        isSelected={Boolean(detail) && detail.pos === pos && detail.index === index}
        isTarget={isTarget}
        onClick={(e) => {
          e.stopPropagation()
          onSlotClick(pos, index, player, starter)
        }}
        posTag={opts.posTag}
        skeleton={squadLoading}
        subIn={subIn}
        subOut={subOut}
      />
    )
  }

  // Açık modal için oyuncu bilgileri (gösterilen oyuncu)
  const detailPlayer = detail?.player || null
  const detailFixture = detailPlayer ? getTeamFixture(fixtures, detailPlayer.club, week) : null

  const saveActive = dirty && !overBudget
  const msgOk = saveMsg.includes('✓')

  return (
    <div className="tm-page" onClick={() => swapMode && setSwapMode(null)}>
      {/* Hero takım bandı */}
      <div className="tm-hero">
        <div className="hero-crest">FFS</div>
        <div className="hero-id">
          <h1 className="semi">{user ? user.username : 'Takımım'}</h1>
          <p>Fantasy Süper Lig · 2026–27 Sezonu</p>
        </div>
        <div className="hero-word">Takımım</div>
        <div className="hero-right">
          <button type="button" className="tr-btn-guide" onClick={() => setScoringOpen(true)}>
            <IconGuide />Puanlama Rehberi
          </button>
          <div className="chip chip-deadline">
            <span className="k">Deadline</span>
            <b className="tnum">{deadlineText}</b>
          </div>
        </div>
      </div>

      {/* Stat kutucukları */}
      <div className="stats">
        {/* Bütçe (birleşik) */}
        <div className="tm-stat">
          <div className="stat-head">
            <span className="eyebrow">Bütçe</span>
            <span className="stat-ico ico-green"><IconWallet /></span>
          </div>
          <div className="budget-vals">
            <div className="bv">
              <div className="l">Toplam</div>
              <div className="v cond tnum">{TOTAL_BUDGET.toFixed(1)}M</div>
            </div>
            <div className="bv">
              <div className="l">Kalan</div>
              <div className={`v rem cond tnum${overBudget ? ' neg' : ''}`}>{remaining.toFixed(1)}M</div>
            </div>
          </div>
          <div className="budget-bar"><div className="budget-fill" style={{ width: `${spentPct}%` }} /></div>
          <div className="budget-meta tnum">
            <span>{spent.toFixed(1)}M harcandı</span>
            <span>{remaining.toFixed(1)}M kaldı</span>
          </div>
        </div>

        {/* Kaptan */}
        <div className="tm-stat">
          <div className="stat-head">
            <span className="eyebrow">Kaptan</span>
            <span className="stat-ico ico-gold"><IconStar /></span>
          </div>
          {captainId ? (
            <div className="cap-row">
              <span className="cap-badge cond">C</span>
              <span className="stat-val sm cond">{surname(captainPlayer.name)}</span>
            </div>
          ) : (
            <div className="stat-val sm cond warn">⚠ Seçilmedi</div>
          )}
        </div>

        {/* Jokerlerim (deadline geçince Toplam Puan) */}
        {locked ? (
          <div className="tm-stat">
            <div className="stat-head">
              <span className="eyebrow">Toplam Puan</span>
              <span className="stat-ico ico-gold"><IconStar /></span>
            </div>
            <div className="stat-val cond tnum">{totalPoints}<small> P</small></div>
          </div>
        ) : (
          <div className="tm-stat">
            <div className="stat-head">
              <span className="eyebrow">Jokerlerim</span>
              <span className="stat-ico ico-gold"><IconBolt /></span>
            </div>
            <div className="joker-empty">
              <span className="ji"><IconBolt /></span>
              <span className="jt">Bu hafta aktif joker yok</span>
            </div>
          </div>
        )}
      </div>

      {/* Hafta seçici + kontrol satırı */}
      <div className="control">
        <WeekBar
          weeks={weeks}
          visible={visibleWeeks}
          selected={week}
          onSelect={onSelectWeek}
          now={now}
          loading={weeksLoading}
          selectedPoints={locked ? totalPoints : null}
        />

        {!locked && (
          <div className="control-row">
            <Link to="/transfer" className="tm-btn-primary"><IconSwap />Transfer Yap</Link>
            <div className="view-sel">
              <div className="select">
                <svg className="vico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <select value={view} onChange={(e) => setView(e.target.value)}>
                  {VIEWS.map((v) => (
                    <option key={v.key} value={v.key}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Durum ipucu */}
      {squadLoading ? (
        <p className="hint">Kadron yükleniyor…</p>
      ) : locked ? (
        <div className="lock-note">🔒 Hafta {week} kilitli — deadline geçti, kadro değişikliği yapılamaz.</div>
      ) : swapMode ? (
        <div className="swap-note">
          {swapMode.targetType === 'bench'
            ? 'Oyuncuyu göndereceğin yedek yuvasını seç.'
            : "Oyuncuyu alacağın ilk 11 yuvasını seç."}
          <button
            type="button"
            className="swap-cancel"
            onClick={(e) => {
              e.stopPropagation()
              setSwapMode(null)
            }}
          >
            İptal
          </button>
        </div>
      ) : filledCount < 15 ? (
        /* Kadro eksikken: ipucu yerine Transfer'e yönlendiren şerit */
        <div className="pitch-guide">
          <span className="pg-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l4 2 4-1 1 5-3 2v8H6v-8L3 9l1-5 4 1z" /></svg>
          </span>
          <div className="pg-txt">
            <b>{filledCount === 0 ? 'Kadron henüz boş' : 'Kadron henüz eksik'}</b>
            <span>Süper Lig oyuncularını seçip kadronu kurmak için transfer yap. Kaydettikten sonra kaptanını buradan seçebilirsin.</span>
          </div>
          <Link to="/transfer" className="pg-btn">
            Transfer Yap
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      ) : (
        <p className="hint">Detayları görmek ve kaptan seçmek için bir oyuncuya tıkla.</p>
      )}

      {/* Belirgin uyarılar (deadline öncesi): kaptan eksik / kaydedilmemiş değişiklik */}
      {!locked && !squadLoading && (
        ((filledCount === 15 && !captainId) || (dirty && !overBudget)) && (
          <div className="tm-alerts">
            {filledCount === 15 && !captainId && (
              <div className="tm-alert">⚠️ Kaptan seçilmedi</div>
            )}
            {dirty && !overBudget && (
              <div className="tm-alert">⚠️ Kaydedilmemiş değişiklikler var</div>
            )}
          </div>
        )
      )}

      {/* Saha */}
      <div className="pitch-wrap">
        <div className="tm-pitch">
          <div className="field">
            <div className="pitch-lines" aria-hidden="true">
              <div className="halfway" />
              <div className="circle" />
              <div className="cspot" />
              <div className="box-t" />
              <div className="goal-t" />
              <div className="spot-t" />
              <div className="arc-t" />
              <div className="box-b" />
              <div className="goal-b" />
              <div className="spot-b" />
              <div className="arc-b" />
            </div>
            <div className="rows">
              <div className="row">{display.field.FW.map((d) => renderView({ ...d, starter: true }))}</div>
              <div className="row">{display.field.OS.map((d) => renderView({ ...d, starter: true }))}</div>
              <div className="row">{display.field.DF.map((d) => renderView({ ...d, starter: true }))}</div>
              <div className="row">{display.field.KL.map((d) => renderView({ ...d, starter: true }))}</div>
            </div>
          </div>

          <div className="bench-div"><span className="bench-label">Yedekler</span></div>
          <div className="bench">
            {display.bench.map((d) => renderView({ ...d, starter: false }, { posTag: d.pos }))}
          </div>
        </div>
      </div>

      {/* Aksiyon çubuğu */}
      <div className="actionbar">
        <div className="squad-count">
          <span className="check"><IconCheck /></span>
          <span className="count-num cond tnum"><b>{filledCount}</b>/15</span>
          <span className="lbl">oyuncu · kadro {filledCount === 15 ? 'tam' : 'eksik'}</span>
        </div>
        {/* Deadline sonrası kaydetme gizlenir (kadro kilitli) */}
        {!locked && (
          <div className="save-wrap">
            {overBudget && <span className="budget-warn">Bütçen aşıldı — kaydedemezsin.</span>}
            {!overBudget && saveMsg && (
              <span className={`save-note show ${msgOk ? 'ok' : 'warn'}`}>
                {msgOk ? <IconCheck /> : <span className="pulse" />}
                {saveMsg}
              </span>
            )}
            {!overBudget && !saveMsg && dirty && (
              <span className="save-note show"><span className="pulse" />Kaydedilmemiş değişiklik var</span>
            )}
            <button
              type="button"
              className={`btn-save${saveActive ? ' active' : ''}`}
              onClick={saveSquad}
            >
              <IconSave />Takımı Kaydet
            </button>
          </div>
        )}
      </div>

      {/* Puanlama Rehberi modalı (Transfer ile aynı) */}
      {scoringOpen && (
        <div className="tr-overlay show" onClick={() => setScoringOpen(false)}>
          <div className="tr-guide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="tr-mclose" onClick={() => setScoringOpen(false)} aria-label="Kapat">×</button>
            <ScoringGuide />
          </div>
        </div>
      )}

      {/* Oyuncu detay modalı — yalnızca kadro görünümünde (Takımım) */}
      {detailPlayer && (
        <PlayerDetailModal
          player={detailPlayer}
          isStarter={detail.starter}
          isCaptain={detailPlayer.id === captainId}
          locked={locked}
          week={week}
          fixture={detailFixture}
          onMakeCaptain={() => {
            makeCaptain(detailPlayer.id)
            setDetail(null)
          }}
          onClearCaptain={() => clearCaptain()}
          onMoveToBench={() => startSwap('bench')}
          onMoveToStarter={() => startSwap('starter')}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
