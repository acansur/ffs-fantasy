import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useSquad } from '../lib/squadStore.jsx'
import { loadSuperLigPlayers } from '../lib/apiFootball.js'
import { getVisibleWeeks, isLocked, formatDeadline, getTeamFixture } from '../lib/weeks.js'
import WeekBar from '../components/WeekBar.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import PlayerDetailModal from '../components/PlayerDetailModal.jsx'
import {
  POSITIONS,
  CLUBS,
  TOTAL_BUDGET,
  VIEWS,
  formationLabel,
  surname,
} from '../lib/squadData.js'
import './Takimim.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

// Maçı tamamlanmış sayılan durumlar (puan gösterimi bunlarda başlar)
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])

// Pozisyon → halka / rozet renk sınıfı (yeşil KL, kırmızı DF, mavi OS, turuncu FW)
const RING = { KL: 'ring-gk', DF: 'ring-def', OS: 'ring-mid', FW: 'ring-fwd' }
const TAG = { KL: 'tag-gk', DF: 'tag-def', OS: 'tag-mid', FW: 'tag-fwd' }

// "14 Ağu" biçiminde maç günü (Türkiye saati)
const matchDay = (iso) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', timeZone: 'Europe/Istanbul' })

/* ---- İkonlar (ince stroke SVG) ---- */
const IconMoney = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
)
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
const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
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

function SquadSlot({ entry, info, isCaptain, isSelected, isTarget, onClick, posTag, skeleton }) {
  const { slot, pos } = entry
  const meta = POSITIONS[pos]
  const player = slot.player
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
    return (
      <button
        type="button"
        className={`tm-player empty${isTarget ? ' target' : ''}`}
        onClick={onClick}
        aria-label={`${meta.label} (boş)`}
      >
        {tag}
        <span className={`ava av-empty ${ring}`}>
          <span className="ava-plus">+</span>
        </span>
        {!posTag && <span className="name-plate np-muted"><span className="nm">{meta.label}</span></span>}
      </button>
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
    weeksLoading,
    squadLoading,
    rosterList,
    remaining,
    counts,
    dirty,
    saveArrangement,
    swapSlots,
  } = useSquad()

  const [view, setView] = useState('next')
  const [detail, setDetail] = useState(null) // { pos, index } — açık oyuncu detay modalı
  const [swapMode, setSwapMode] = useState(null) // { source:{pos,index}, targetType:'bench'|'starter' }
  const [saveMsg, setSaveMsg] = useState('')

  const now = Date.now()
  const visibleWeeks = getVisibleWeeks(weeks, now)
  const selectedWeek = weeks.find((w) => w.round === week) || null
  const locked = isLocked(selectedWeek, now)
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

  const overBudget = remaining < 0
  const captainPlayer = rosterList.find((p) => p.id === captainId) || null
  const formation = formationLabel(counts)
  const filledCount = rosterList.length
  const spent = TOTAL_BUDGET - remaining
  const spentPct = Math.max(0, Math.min(100, (spent / TOTAL_BUDGET) * 100))

  // Yuva altı bilgi satırı:
  // - Deadline gelmediyse görünüme göre (sonraki maç: tarih + rakip / oyuncu değeri)
  // - Deadline geldiyse maç durumuna göre puan (bitmediyse "-", bittiyse puan)
  const slotInfoFor = (player) => {
    const fx = getTeamFixture(fixtures, player.club, week)
    if (locked) {
      // Puanlama sistemi netleşene kadar biten maçlar için 0 gösterilir
      return FINISHED.has(fx?.fixture?.status?.short) ? '0 P' : '-'
    }
    if (view === 'value') return `₺${player.price}M`
    if (!fx) return '—'
    const isHome = fx.teams?.home?.name === player.club
    const opp = isHome ? fx.teams?.away?.name : fx.teams?.home?.name
    const day = fx.fixture?.date ? matchDay(fx.fixture.date) : '—'
    return `${day} · ${isHome ? 'vs' : '@'} ${opp || '—'}`
  }

  // Toplam puan: tüm oyuncuların maçı bitince hesaplanır; o zamana kadar "-"
  const allMatchesFinished =
    rosterList.length > 0 &&
    rosterList.every((p) => FINISHED.has(getTeamFixture(fixtures, p.club, week)?.fixture?.status?.short))
  const totalPoints = allMatchesFinished ? 0 : '-'

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

  // Yuva tıklaması: yer değiştirme modundaysa hedef seç; değilse detay modalı aç
  const onSlotClick = (pos, index) => {
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
    if (!roster[pos][index].player) return
    setDetail({ pos, index })
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

  const renderSlot = (entry, opts = {}) => {
    const { pos, index, slot } = entry
    const isSwapSource =
      Boolean(swapMode) && swapMode.source.pos === pos && swapMode.source.index === index
    const isTarget =
      Boolean(swapMode) &&
      !isSwapSource &&
      (swapMode.targetType === 'bench' ? !slot.starter : slot.starter)
    return (
      <SquadSlot
        key={`${pos}-${index}`}
        entry={entry}
        info={slot.player ? slotInfoFor(slot.player) : null}
        isCaptain={slot.player ? slot.player.id === captainId : false}
        isSelected={Boolean(detail) && detail.pos === pos && detail.index === index}
        isTarget={isTarget}
        onClick={(e) => {
          e.stopPropagation()
          onSlotClick(pos, index)
        }}
        posTag={opts.posTag}
        skeleton={squadLoading}
      />
    )
  }

  // Açık modal için oyuncu bilgileri
  const detailSlot = detail ? roster[detail.pos][detail.index] : null
  const detailPlayer = detailSlot?.player || null
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
        <div className="hero-right">
          <div className="chip">
            <span className="k">Diziliş</span>
            <span className="cond">{formation}</span>
          </div>
          <div className="chip chip-deadline">
            <span className="k">Deadline</span>
            <b className="tnum">{deadlineText}</b>
          </div>
        </div>
      </div>

      {/* Stat kutucukları */}
      <div className="stats">
        <div className="tm-stat">
          <div className="stat-head">
            <span className="eyebrow">Toplam Bütçe</span>
            <span className="stat-ico ico-green"><IconMoney /></span>
          </div>
          <div className="stat-val cond tnum">{TOTAL_BUDGET.toFixed(1)}<small>M</small></div>
        </div>

        <div className="tm-stat">
          <div className="stat-head">
            <span className="eyebrow">Kalan Bütçe</span>
            <span className="stat-ico ico-gold"><IconWallet /></span>
          </div>
          <div className={`stat-val cond tnum${overBudget ? ' neg' : ''}`}>{remaining.toFixed(1)}<small>M</small></div>
          <div className="budget-bar"><div className="budget-fill" style={{ width: `${spentPct}%` }} /></div>
          <div className="budget-meta tnum">
            <span>{spent.toFixed(1)}M harcandı</span>
            <span>{remaining.toFixed(1)}M kaldı</span>
          </div>
        </div>

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
              <span className="eyebrow">Deadline</span>
              <span className="stat-ico ico-green"><IconClock /></span>
            </div>
            <div className="stat-val sm cond tnum deadline">{deadlineText}</div>
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
        />

        {!locked && (
          <div className="control-row">
            <Link to="/transfer" className="tm-btn-primary"><IconSwap />Transfer Yap</Link>
            <div className="view-sel">
              <span className="eyebrow">Görünüm</span>
              <div className="select">
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
      ) : (
        <p className="hint">Detayları görmek ve kaptan seçmek için bir oyuncuya tıkla.</p>
      )}

      {/* Saha */}
      <div className="pitch-wrap">
        <div className="tm-pitch">
          <div className="pitch-lines" aria-hidden="true">
            <span className="pl-circle" />
            <span className="pl-box" />
            <span className="pl-box2" />
            <span className="pl-spot" />
          </div>
          <div className="rows">
            <div className="row">{fieldByPos.FW.map((e) => renderSlot(e))}</div>
            <div className="row">{fieldByPos.OS.map((e) => renderSlot(e))}</div>
            <div className="row">{fieldByPos.DF.map((e) => renderSlot(e))}</div>
            <div className="row">{fieldByPos.KL.map((e) => renderSlot(e))}</div>
          </div>

          <div className="bench-div"><span className="bench-label">Yedekler</span></div>
          <div className="bench">
            {benchEntries.map((e) => renderSlot(e, { posTag: e.pos }))}
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
      </div>

      {/* Oyuncu detay modalı — yalnızca kadro görünümünde (Takımım) */}
      {detailPlayer && (
        <PlayerDetailModal
          player={detailPlayer}
          isStarter={detailSlot.starter}
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
