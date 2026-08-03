import { useMemo, useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSquad, cloneRoster, rosterPlayers } from '../lib/squadStore.jsx'
import { loadSuperLigPlayers, toAppPlayers, clubColors, clubShort } from '../lib/apiFootball.js'
import { getVisibleWeeks, formatDeadline, getTeamFixture } from '../lib/weeks.js'
import WeekBar from '../components/WeekBar.jsx'
import PlayerPhoto from '../components/PlayerPhoto.jsx'
import ScoringGuide from '../components/ScoringGuide.jsx'
import PlayerDetailModal from '../components/PlayerDetailModal.jsx'
import { POSITIONS, TOTAL_BUDGET, MAX_PER_CLUB, initials } from '../lib/squadData.js'
import './Transfer.css'

const POS_ORDER = ['KL', 'DF', 'OS', 'FW']
const POS_TABS = [{ key: null, label: 'Tümü' }, ...POS_ORDER.map((p) => ({ key: p, label: p }))]

// Toplam puan henüz yok — şimdilik 0
const ptsOf = (p) => p.points ?? 0

function sortPlayers(arr, key) {
  const l = [...arr]
  if (key === 'value-asc') return l.sort((a, b) => a.price - b.price)
  if (key === 'points-desc') return l.sort((a, b) => ptsOf(b) - ptsOf(a) || b.price - a.price)
  if (key === 'points-asc') return l.sort((a, b) => ptsOf(a) - ptsOf(b) || a.price - b.price)
  return l.sort((a, b) => b.price - a.price) // value-desc
}

export default function Transfer() {
  const navigate = useNavigate()
  const { roster: committed, commitAndSave, week, setWeek, weeks, fixtures, weeksLoading, squadLoading } = useSquad()

  const now = Date.now()
  const visibleWeeks = getVisibleWeeks(weeks, now)
  const selectedWeek = weeks.find((w) => w.round === week) || null
  const deadlineText = selectedWeek ? formatDeadline(selectedWeek.deadline) : '—'

  // Taslak: kaydedilene kadar kadroya yansımaz
  const [draft, setDraft] = useState(() => cloneRoster(committed))
  const editedRef = useRef(false) // kullanıcı taslakta değişiklik yaptı mı
  const [picker, setPicker] = useState(null) // { pos, index } — açık oyuncu seçme popup'ı
  const [posFilter, setPosFilter] = useState(null)
  const [selectedClubs, setSelectedClubs] = useState([])
  const [sortKey, setSortKey] = useState('value-desc')
  const [openDrop, setOpenDrop] = useState(null) // 'club' | 'value' | 'points' | null
  const [msg, setMsg] = useState('')
  const [scoringOpen, setScoringOpen] = useState(false)
  const [infoPlayer, setInfoPlayer] = useState(null)
  const clubRef = useRef(null)
  const valueRef = useRef(null)
  const pointsRef = useRef(null)

  // Gerçek API oyuncuları
  const [api, setApi] = useState({ loading: true, error: null, players: [], teams: [] })

  useEffect(() => {
    let alive = true
    loadSuperLigPlayers()
      .then((res) => alive && setApi({ loading: false, error: null, players: toAppPlayers(res.players), teams: res.teams }))
      .catch((err) => alive && setApi({ loading: false, error: err.message || String(err), players: [], teams: [] }))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!openDrop) return
    const refs = { club: clubRef, value: valueRef, points: pointsRef }
    const onDown = (e) => {
      const ref = refs[openDrop]
      if (ref?.current && !ref.current.contains(e.target)) setOpenDrop(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openDrop])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2800)
    return () => clearTimeout(t)
  }, [msg])

  // Kaydedilmiş kadronun imzası (yuva sırasına göre oyuncu id'leri)
  const committedSig = useMemo(() => {
    const parts = []
    for (const pos of POS_ORDER) for (const s of committed[pos]) parts.push(s.player?.id ?? '_')
    return parts.join(',')
  }, [committed])

  // Kaydedilmiş kadro (örn. Supabase'den) sonradan yüklenirse ve kullanıcı henüz
  // taslakta değişiklik yapmadıysa, taslağı kaydedilmiş kadroyla senkronla.
  useEffect(() => {
    if (!editedRef.current) setDraft(cloneRoster(committed))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSig])

  const draftList = useMemo(() => rosterPlayers(draft), [draft])
  const rosterIds = useMemo(() => new Set(draftList.map((p) => p.id)), [draftList])
  const clubCounts = useMemo(() => {
    const c = {}
    for (const p of draftList) c[p.club] = (c[p.club] || 0) + 1
    return c
  }, [draftList])

  const filledCount = draftList.length
  const spent = draftList.reduce((s, p) => s + p.price, 0)
  const remaining = TOTAL_BUDGET - spent
  const overBudget = remaining < 0

  // Kulüp filtresi için takım listesi (renk + kısa kod)
  const teamsInfo = useMemo(
    () => api.teams.map((t) => ({ name: t.name, short: clubShort(t.name), bg: clubColors(t.name).bg })),
    [api.teams]
  )

  const list = useMemo(() => {
    let l = api.players
    if (posFilter) l = l.filter((p) => p.pos === posFilter)
    if (selectedClubs.length) l = l.filter((p) => selectedClubs.includes(p.club))
    return sortPlayers(l, sortKey)
  }, [api.players, posFilter, selectedClubs, sortKey])

  const setDraftSlot = (pos, index, player) => {
    editedRef.current = true
    setDraft((d) => {
      const next = cloneRoster(d)
      next[pos][index].player = player
      return next
    })
  }

  const toggleClub = (name) =>
    setSelectedClubs((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]))

  // Boş veya dolu yuvaya tıklama → oyuncu seçme popup'ı
  const openPicker = (pos, index) => {
    setPicker({ pos, index })
    setPosFilter(pos)
    setMsg('')
  }
  const closePicker = () => {
    setPicker(null)
    setOpenDrop(null)
  }
  const clearPickerSlot = () => {
    if (!picker) return
    setDraftSlot(picker.pos, picker.index, null)
    setPicker(null)
  }

  const addPlayer = (player) => {
    const pos = player.pos
    let target = null
    if (picker && picker.pos === pos) target = picker
    else {
      const idx = draft[pos].findIndex((s) => !s.player)
      if (idx >= 0) target = { pos, index: idx }
    }
    if (!target) {
      setMsg(`⚠ ${POSITIONS[pos].label} için boş yuva yok.`)
      return
    }
    setDraftSlot(pos, target.index, player)
    setPicker(null)
  }

  // Listede + butonuna tıklama: kulüp limiti dolu ise uyarı, değilse ekle
  const onAddClick = (p, clubMaxed) => {
    if (clubMaxed) {
      setMsg('Bu kulüpten maksimum 3 oyuncu seçebilirsin')
      return
    }
    addPlayer(p)
  }

  // Otomatik doldur: boş mevkileri, bütçe + kulüp limiti kurallarına göre,
  // mümkün olan en yüksek değerli oyuncularla doldurur (kalanları da
  // dolduracak minimum maliyeti rezerve ederek bütçeyi aşmaz).
  const autoFill = () => {
    const pool = api.players
    const next = cloneRoster(draft)
    const used = new Set()
    const clubCount = {}
    let budgetLeft = TOTAL_BUDGET
    const needed = { KL: 0, DF: 0, OS: 0, FW: 0 }
    for (const pos of POS_ORDER) {
      for (const slot of next[pos]) {
        if (slot.player) {
          used.add(slot.player.id)
          clubCount[slot.player.club] = (clubCount[slot.player.club] || 0) + 1
          budgetLeft -= slot.player.price
        } else {
          needed[pos] += 1
        }
      }
    }

    const minReserve = (need, u0, c0) => {
      const u = new Set(u0)
      const c = { ...c0 }
      let sum = 0
      for (const pos of POS_ORDER) {
        for (let i = 0; i < need[pos]; i++) {
          const opt = pool
            .filter((p) => p.pos === pos && !u.has(p.id) && (c[p.club] || 0) < MAX_PER_CLUB)
            .sort((a, b) => a.price - b.price)[0]
          if (!opt) return Infinity
          u.add(opt.id)
          c[opt.club] = (c[opt.club] || 0) + 1
          sum += opt.price
        }
      }
      return sum
    }

    const candidates = pool.filter((p) => !used.has(p.id)).sort((a, b) => b.price - a.price)
    for (const p of candidates) {
      if (needed[p.pos] <= 0) continue
      if ((clubCount[p.club] || 0) >= MAX_PER_CLUB) continue
      const after = budgetLeft - p.price
      if (after < 0) continue
      const need2 = { ...needed, [p.pos]: needed[p.pos] - 1 }
      const u2 = new Set(used); u2.add(p.id)
      const c2 = { ...clubCount, [p.club]: (clubCount[p.club] || 0) + 1 }
      if (after < minReserve(need2, u2, c2)) continue
      const idx = next[p.pos].findIndex((s) => !s.player)
      if (idx < 0) continue
      next[p.pos][idx].player = p
      used.add(p.id)
      clubCount[p.club] = (clubCount[p.club] || 0) + 1
      budgetLeft -= p.price
      needed[p.pos] -= 1
    }

    const stillEmpty = POS_ORDER.reduce((n, pos) => n + next[pos].filter((s) => !s.player).length, 0)
    editedRef.current = true
    setDraft(next)
    setPicker(null)
    setMsg(stillEmpty > 0 ? `⚠ Bütçe/oyuncu yetmedi, ${stillEmpty} mevki boş kaldı.` : 'Kadro otomatik dolduruldu ✓')
  }

  const emptyCount = 15 - filledCount
  const canSave = filledCount === 15 && !overBudget

  const onSave = async () => {
    if (!canSave) return
    await commitAndSave(draft)
    navigate('/takimim')
  }

  const clubLabel = selectedClubs.length === 0 ? 'Tüm kulüpler' : `${selectedClubs.length} kulüp`
  const valueLabel = sortKey === 'value-desc' ? 'Değer ↓' : sortKey === 'value-asc' ? 'Değer ↑' : 'Değer'
  const pointsLabel = sortKey === 'points-desc' ? 'Toplam Puan ↓' : sortKey === 'points-asc' ? 'Toplam Puan ↑' : 'Toplam Puan'
  const pickerHasPlayer = Boolean(picker && draft[picker.pos][picker.index].player)

  return (
    <div className="tr-page">
      {/* Üst bar */}
      <div className="tr-topbar">
        <Link to="/takimim" className="tr-back">‹ Takımım</Link>
        <div className="tr-topbar-mid">
          <span className="tr-title">Transfer</span>
        </div>
        <div className="tr-deadline">Deadline: {deadlineText}</div>
      </div>

      {/* Puanlama başlığı + buton */}
      <div className="tr-scoring-head">
        <h2>Puanlama</h2>
        <button type="button" className="tr-scoring-btn" onClick={() => setScoringOpen(true)}>
          Puanlama Rehberi
        </button>
      </div>

      {/* Stat kutucukları */}
      <div className="tr-stripe">
        <div className="tr-stat tr-stat-budget">
          <span>Bütçe</span>
          <div className="tr-budget-rows">
            <div className="tr-budget-row">
              <small>Toplam</small>
              <strong>{TOTAL_BUDGET.toFixed(1)}M</strong>
            </div>
            <div className="tr-budget-row">
              <small>Kalan</small>
              <strong className={overBudget ? 'neg' : ''}>{remaining.toFixed(1)}M</strong>
            </div>
          </div>
        </div>
        <div className="tr-stat">
          <span>Ekstra Bütçe &amp; Aktif Joker</span>
          <strong className="tr-muted">—</strong>
        </div>
        <div className="tr-stat">
          <span>Serbest Transfer Hakkı</span>
          <strong>Sınırsız</strong>
        </div>
      </div>

      {/* Hafta bar'ı */}
      <WeekBar
        weeks={weeks}
        visible={visibleWeeks}
        selected={week}
        onSelect={setWeek}
        now={now}
        loading={weeksLoading}
      />
      <div className="tr-week-note">Hafta {week} için transfer yapıyorsunuz</div>

      {msg && !picker && <div className={`tr-msg${msg.startsWith('⚠') ? ' warn' : ' ok'}`}>{msg}</div>}

      {/* Taktik sahası (tam genişlik) */}
      <div className="tr-field">
        {POS_ORDER.slice().reverse().map((pos) => (
          <div key={pos} className="tr-field-row">
            {draft[pos].map((slot, index) => {
              const meta = POSITIONS[pos]
              // Kadro Supabase'den yüklenirken soluk animasyonlu placeholder
              if (squadLoading) {
                return (
                  <div key={`${pos}-${index}`} className="tr-slot skeleton" aria-hidden="true">
                    <span className="tr-disc skel" />
                    <span className="tr-skel-line" />
                  </div>
                )
              }
              if (!slot.player) {
                return (
                  <button
                    key={`${pos}-${index}`}
                    type="button"
                    className="tr-slot empty"
                    style={{ '--pos': meta.color }}
                    onClick={() => openPicker(pos, index)}
                  >
                    <span className="tr-postag" style={{ '--pos': meta.color }}>{pos}</span>
                    <span className="tr-disc"><span className="tr-plus">+</span></span>
                  </button>
                )
              }
              const p = slot.player
              return (
                <div
                  key={`${pos}-${index}`}
                  className="tr-slot filled"
                  style={{ '--pos': meta.color, '--bg': p.clubBg, '--fg': p.clubFg }}
                >
                  {/* Fotoğraf / ikon → oyuncu seçme popup'ı */}
                  <button type="button" className="tr-slot-photo" onClick={() => openPicker(pos, index)} aria-label={`${p.name} — değiştir`}>
                    <span className="tr-postag" style={{ '--pos': meta.color }}>{pos}</span>
                    <span className="tr-disc jersey">
                      <PlayerPhoto id={p.id} name={p.name} bg={p.clubBg} fg={p.clubFg} />
                    </span>
                  </button>
                  {/* İsim → oyuncu bilgi kartı */}
                  <button type="button" className="tr-slot-tag tr-slot-name" onClick={() => setInfoPlayer(p)}>{p.name}</button>
                  <span className="tr-slot-price">₺{p.price}M</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Sticky aksiyon çubuğu */}
      <div className="tr-actionbar">
        {overBudget ? (
          <span className="tr-budget-warn">Bütçeni aştın — kadroyu kaydedemezsin.</span>
        ) : (
          <span className="tr-count-note">{filledCount}/15 oyuncu seçildi</span>
        )}
        <div className="tr-actionbar-right">
          <button
            type="button"
            className="tr-autofill"
            onClick={autoFill}
            disabled={emptyCount === 0 || api.loading || !api.players.length}
          >
            ⚡ Boş Mevkileri Otomatik Doldur
          </button>
          <button type="button" className="tr-save" onClick={onSave} disabled={!canSave}>
            Kaydet ve Takıma Dön
          </button>
        </div>
      </div>

      {/* Puanlama rehberi popup */}
      {scoringOpen && (
        <div className="tr-modal-overlay" onClick={() => setScoringOpen(false)}>
          <div className="tr-modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="tr-modal-close" onClick={() => setScoringOpen(false)} aria-label="Kapat">×</button>
            <ScoringGuide />
          </div>
        </div>
      )}

      {/* Oyuncu seçme popup */}
      {picker && (
        <div className="tr-modal-overlay" onClick={closePicker}>
          <div className="tr-picker" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="tr-picker-head">
              <h2>{posFilter ? POSITIONS[posFilter].label : 'Oyuncu'} Seç</h2>
              <button className="tr-modal-close" onClick={closePicker} aria-label="Kapat">×</button>
            </div>

            <div className="tr-pos-tabs">
              {POS_TABS.map((t) => (
                <button key={t.label} type="button" className={`tr-pos-tab${posFilter === t.key ? ' active' : ''}`} onClick={() => setPosFilter(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="tr-list-controls">
              {/* Kulüp filtresi */}
              <div className="dropdown" ref={clubRef}>
                <button type="button" className="dropdown-toggle" onClick={() => setOpenDrop((d) => (d === 'club' ? null : 'club'))} disabled={api.loading}>
                  {clubLabel}
                </button>
                {openDrop === 'club' && (
                  <div className="dropdown-panel">
                    {teamsInfo.map((t) => (
                      <label key={t.name} className="check-row">
                        <input type="checkbox" checked={selectedClubs.includes(t.name)} onChange={() => toggleClub(t.name)} />
                        <span className="club-dot" style={{ background: t.bg }} />
                        {t.name}
                      </label>
                    ))}
                    <div className="dropdown-foot">
                      {selectedClubs.length > 0 && (
                        <button type="button" className="link-btn" onClick={() => setSelectedClubs([])}>Temizle</button>
                      )}
                      <button type="button" className="link-btn dropdown-done" onClick={() => setOpenDrop(null)}>Tamam</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Değer sıralaması */}
              <div className="dropdown tr-sort" ref={valueRef}>
                <button type="button" className={`dropdown-toggle${sortKey.startsWith('value') ? ' active' : ''}`} onClick={() => setOpenDrop((d) => (d === 'value' ? null : 'value'))} aria-expanded={openDrop === 'value'}>
                  {valueLabel}
                </button>
                {openDrop === 'value' && (
                  <div className="dropdown-panel">
                    <button type="button" className={`tr-sort-opt${sortKey === 'value-desc' ? ' active' : ''}`} onClick={() => { setSortKey('value-desc'); setOpenDrop(null) }}>Azalan</button>
                    <button type="button" className={`tr-sort-opt${sortKey === 'value-asc' ? ' active' : ''}`} onClick={() => { setSortKey('value-asc'); setOpenDrop(null) }}>Artan</button>
                  </div>
                )}
              </div>

              {/* Toplam Puan sıralaması */}
              <div className="dropdown tr-sort" ref={pointsRef}>
                <button type="button" className={`dropdown-toggle${sortKey.startsWith('points') ? ' active' : ''}`} onClick={() => setOpenDrop((d) => (d === 'points' ? null : 'points'))} aria-expanded={openDrop === 'points'}>
                  {pointsLabel}
                </button>
                {openDrop === 'points' && (
                  <div className="dropdown-panel">
                    <button type="button" className={`tr-sort-opt${sortKey === 'points-desc' ? ' active' : ''}`} onClick={() => { setSortKey('points-desc'); setOpenDrop(null) }}>Azalan</button>
                    <button type="button" className={`tr-sort-opt${sortKey === 'points-asc' ? ' active' : ''}`} onClick={() => { setSortKey('points-asc'); setOpenDrop(null) }}>Artan</button>
                  </div>
                )}
              </div>
            </div>

            {pickerHasPlayer && (
              <button type="button" className="tr-clear-slot" onClick={clearPickerSlot}>
                Bu mevkiyi boşalt
              </button>
            )}

            {msg && <div className={`tr-picker-msg${msg.startsWith('⚠') ? ' warn' : ''}`}>{msg}</div>}

            <ul className="tr-player-list">
              {api.loading && <li className="tr-loading">Yükleniyor…</li>}
              {!api.loading && api.error && <li className="tr-loading err">⚠ {api.error}</li>}
              {!api.loading && !api.error && list.length === 0 && (
                <li className="tr-loading">Filtreye uygun oyuncu yok.</li>
              )}
              {!api.loading && !api.error &&
                list.map((p) => {
                  const inRoster = rosterIds.has(p.id)
                  const clubMaxed = (clubCounts[p.club] || 0) >= MAX_PER_CLUB && !inRoster
                  const dimmed = inRoster || clubMaxed
                  return (
                    <li key={p.id} className={`tr-player${dimmed ? ' disabled' : ''}`}>
                      <span className="tr-p-jersey" style={{ background: p.clubBg, color: p.clubFg }}>{initials(p.name)}</span>
                      <button type="button" className="tr-p-namebtn" onClick={() => setInfoPlayer(p)}>
                        <span className="tr-p-name">{p.name}</span>
                        <span className="tr-p-sub">
                          {p.club} · {POSITIONS[p.pos].label}
                          {inRoster && ' · kadroda'}
                          {clubMaxed && ' · kulüp dolu'}
                        </span>
                      </button>
                      <span className="tr-p-points tnum">{ptsOf(p)} P</span>
                      <span className="tr-p-price">{p.price.toFixed(1)}M</span>
                      <button
                        type="button"
                        className="tr-add"
                        disabled={inRoster}
                        onClick={() => onAddClick(p, clubMaxed)}
                        aria-label={`${p.name} ekle`}
                      >
                        +
                      </button>
                    </li>
                  )
                })}
            </ul>
          </div>
        </div>
      )}

      {/* Oyuncu info kartı (Takımım detay modalı ile aynı tasarım; aksiyon butonları yok) */}
      {infoPlayer && (
        <PlayerDetailModal
          variant="info"
          player={infoPlayer}
          week={week}
          fixture={getTeamFixture(fixtures, infoPlayer.club, week)}
          weeks={weeks}
          onClose={() => setInfoPlayer(null)}
        />
      )}
    </div>
  )
}
