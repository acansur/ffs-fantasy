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
  slotInfo,
} from '../lib/squadData.js'
import './Takimim.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']

function SquadSlot({ entry, view, isCaptain, isSelected, isTarget, onClick, captainPopup, posTag, skeleton }) {
  const { slot, pos } = entry
  const meta = POSITIONS[pos]
  const player = slot.player
  const tag = posTag ? (
    <span className="tm-postag" style={{ '--pos': meta.color }}>{posTag}</span>
  ) : null

  // Kadro Supabase'den yüklenirken soluk animasyonlu placeholder
  if (skeleton) {
    return (
      <div className="tm-slot skeleton" aria-hidden="true">
        <span className="tm-disc skel" />
        <span className="tm-tag">
          <span className="tm-skel-line" />
        </span>
      </div>
    )
  }

  if (!player) {
    return (
      <button
        type="button"
        className={`tm-slot empty${isTarget ? ' target' : ''}`}
        style={{ '--pos': meta.color }}
        onClick={onClick}
        aria-label={`${meta.label} (boş)`}
      >
        {tag}
        <span className="tm-disc">
          <span className="tm-plus">+</span>
        </span>
        {!posTag && <span className="tm-tag muted">{meta.label}</span>}
      </button>
    )
  }

  // Kulüp rengi oyuncu nesnesinden gelir (API); mock için CLUBS'a düşer
  const bg = player.clubBg || CLUBS[player.club]?.bg || '#334155'
  const fg = player.clubFg || CLUBS[player.club]?.fg || '#ffffff'
  return (
    <div className="tm-slot-wrap">
      <button
        type="button"
        className={`tm-slot filled${isSelected ? ' selected' : ''}${isTarget ? ' target' : ''}`}
        style={{ '--pos': meta.color, '--bg': bg, '--fg': fg }}
        onClick={onClick}
      >
        {isCaptain && <span className="tm-cap">C</span>}
        {tag}
        <span className="tm-disc jersey">
          <PlayerPhoto id={player.id} name={player.name} bg={bg} fg={fg} />
        </span>
        <span className="tm-tag">
          <span className="tm-tag-name">{player.name}</span>
          <span className="tm-tag-info">{slotInfo(player, view)}</span>
        </span>
      </button>
      {captainPopup}
    </div>
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
        view={view}
        isCaptain={slot.player ? slot.player.id === captainId : false}
        isSelected={Boolean(detail) && detail.pos === pos && detail.index === index}
        isTarget={isTarget}
        onClick={(e) => {
          e.stopPropagation()
          onSlotClick(pos, index)
        }}
        captainPopup={null}
        posTag={opts.posTag}
        skeleton={squadLoading}
      />
    )
  }

  // Açık modal için oyuncu bilgileri
  const detailSlot = detail ? roster[detail.pos][detail.index] : null
  const detailPlayer = detailSlot?.player || null
  const detailFixture = detailPlayer ? getTeamFixture(fixtures, detailPlayer.club, week) : null

  return (
    <div className="tm-page" onClick={() => swapMode && setSwapMode(null)}>
      {/* Üst bar */}
      <div className="tm-topbar">
        <div className="tm-team">
          <span className="tm-team-badge">FFS</span>
          <div>
            <div className="tm-team-name">{user ? user.username : 'Takımım'}</div>
            <div className="tm-team-sub">Fantasy Süper Lig</div>
          </div>
        </div>
        <div className="tm-topbar-right">
          <div className="tm-formation-badge" title="Dizilişin otomatik güncellenir">{formation}</div>
          <div className="tm-deadline-chip">Deadline: {deadlineText}</div>
        </div>
      </div>

      {/* Stat şeridi */}
      <div className="tm-stripe">
        <div className="tm-stat">
          <span>Toplam Bütçe</span>
          <strong>{TOTAL_BUDGET.toFixed(1)}M</strong>
        </div>
        <div className="tm-stat">
          <span>Kalan Bütçe</span>
          <strong className={remaining < 0 ? 'neg' : ''}>{remaining.toFixed(1)}M</strong>
        </div>
        <div className={`tm-stat${captainId ? '' : ' warn'}`}>
          <span>Kaptan</span>
          <strong>{captainId ? surname(captainPlayer.name) : '⚠ Seçilmedi'}</strong>
        </div>
        <div className="tm-stat">
          <span>Deadline</span>
          <strong className="tm-deadline">{deadlineText}</strong>
        </div>
      </div>

      {/* Hafta bar'ı — stat kutucuklarının hemen altında */}
      <WeekBar
        weeks={weeks}
        visible={visibleWeeks}
        selected={week}
        onSelect={onSelectWeek}
        now={now}
        loading={weeksLoading}
      />

      {/* Üst aksiyon: Transfer Yap (yukarıda) + görünüm */}
      <div className="tm-toprow">
        {locked ? (
          <button type="button" className="tm-transfer-btn locked" disabled title="Bu hafta kilitli">
            🔒 Transfer Kilitli
          </button>
        ) : (
          <Link to="/transfer" className="tm-transfer-btn">⇄ Transfer Yap</Link>
        )}
        <label className="tm-select">
          <span>Görünüm</span>
          <select value={view} onChange={(e) => setView(e.target.value)}>
            {VIEWS.map((v) => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="tm-layout">
        <div className="tm-left">
          {squadLoading ? (
            <p className="tm-hint">Kadron yükleniyor…</p>
          ) : locked ? (
            <div className="tm-lock-note">🔒 Week {week} kilitli — deadline geçti, kadro değişikliği yapılamaz.</div>
          ) : swapMode ? (
            <div className="tm-swap-note">
              {swapMode.targetType === 'bench'
                ? 'Oyuncuyu göndereceğin yedek yuvasını seç.'
                : "Oyuncuyu alacağın ilk 11 yuvasını seç."}
              <button
                type="button"
                className="tm-swap-cancel"
                onClick={(e) => {
                  e.stopPropagation()
                  setSwapMode(null)
                }}
              >
                İptal
              </button>
            </div>
          ) : (
            <p className="tm-hint">Oyuncuya tıklayarak detaylarını gör ve kaptan seç.</p>
          )}

          <div className="tm-pitch">
            <div className="tm-lines">
              <div className="tm-mid" />
              <div className="tm-circle" />
              <div className="tm-spot" />
              <div className="tm-box top" />
              <div className="tm-box bottom" />
              <div className="tm-goal top" />
              <div className="tm-goal bottom" />
              <div className="tm-corner tl" />
              <div className="tm-corner tr" />
              <div className="tm-corner bl" />
              <div className="tm-corner br" />
            </div>
            <div className="tm-rows">
              <div className="tm-row">{fieldByPos.FW.map((e) => renderSlot(e))}</div>
              <div className="tm-row">{fieldByPos.OS.map((e) => renderSlot(e))}</div>
              <div className="tm-row">{fieldByPos.DF.map((e) => renderSlot(e))}</div>
              <div className="tm-row">{fieldByPos.KL.map((e) => renderSlot(e))}</div>
            </div>
          </div>

          <div className="tm-bench">
            <div className="tm-bench-row">
              {benchEntries.map((e) => renderSlot(e, { posTag: e.pos }))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky kaydet çubuğu */}
      <div className="tm-actionbar">
        <span className="tm-squad-count">{filledCount}/15 oyuncu</span>
        <div className="tm-actionbar-right">
          {overBudget && <span className="tm-budget-warn">Bütçen aşıldı — kaydedemezsin.</span>}
          {saveMsg && <span className="tm-save-msg">{saveMsg}</span>}
          {dirty && (
            <button type="button" className="tm-save" onClick={saveSquad} disabled={overBudget}>
              Takımı Kaydet
            </button>
          )}
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
