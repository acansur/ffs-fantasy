import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useSquad } from '../lib/squadStore.jsx'
import { getVisibleWeeks, getActiveRound, isLocked, formatDeadline } from '../lib/weeks.js'
import { useNow } from '../lib/useNow.js'
import { loadAndScoreWeek, savePrediction, loadAllWeekPoints, fixtureOutcome } from '../lib/predictionsDb.js'
import './KimKazanir.css'

// Varsayılan (Süper Lig) tahmin veri katmanı. /pl-test/kim-kazanir kendi
// predDb'sini (pl_test_predictions) geçer; böylece AYNI bileşen farklı tabloyla
// çalışır — fixtures/weeks zaten SquadProvider config'inden gelir.
const SL_PRED_DB = { loadAndScoreWeek, savePrediction, loadAllWeekPoints }

const roundNo = (r) => Number(String(r).match(/\d+/)?.[0] ?? 0)
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])
// prediction key → segment sembolü + etiket
const SEGS = [
  { key: 'home', p: '1', lbl: 'Ev Sahibi' },
  { key: 'draw', p: 'X', lbl: 'Beraberlik' },
  { key: 'away', p: '2', lbl: 'Deplasman' },
]
const dt = (iso) =>
  new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })

export default function KimKazanir({ predDb = SL_PRED_DB }) {
  const { loadAndScoreWeek, savePrediction, loadAllWeekPoints } = predDb
  const { user } = useAuth()
  const { weeks, fixtures, weekOverrides, weeksLoading } = useSquad()
  const now = useNow(30000) // gerçek zamanlı deadline kontrolü (30 sn)

  const visibleDesc = useMemo(
    () => [...getVisibleWeeks(weeks, now)].sort((a, b) => b.round - a.round),
    [weeks, now]
  )

  // Akordiyon: yalnızca görünüm state'i. Açık panel = yüklenecek hafta.
  const [openWeekId, setOpenWeekId] = useState(null)
  useEffect(() => {
    if (openWeekId == null && weeks.length) setOpenWeekId(getActiveRound(weeks))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks])
  const week = openWeekId // yüklenecek/gösterilecek hafta

  const [state, setState] = useState({ loading: false, byFixture: {}, total: 0 })
  const [allPoints, setAllPoints] = useState({}) // { week: total } — başlık rozetleri
  const [msg, setMsg] = useState('')
  const [savedAt, setSavedAt] = useState(0) // "✓ Kaydedildi" görsel tetiği (yalnızca UX)

  const lockedFor = (round) => {
    const ov = weekOverrides?.[round]
    return ov != null ? ov : isLocked(weeks.find((w) => w.round === round) || null, now)
  }

  const weekFixtures = useMemo(() => {
    if (week == null) return []
    return fixtures.filter((f) => roundNo(f.league?.round) === week).sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
  }, [fixtures, week])

  // Tüm hafta puanlarını (başlık rozetleri) bir kez oku
  useEffect(() => {
    if (!user) return
    loadAllWeekPoints(user.id).then(setAllPoints).catch(() => {})
  }, [user])

  // Açık haftanın tahminlerini yükle + biten maçları puanla
  useEffect(() => {
    if (!user || week == null || !weekFixtures.length) return
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    loadAndScoreWeek(user.id, week, weekFixtures)
      .then((res) => {
        if (!alive) return
        setState({ loading: false, byFixture: res.byFixture, total: res.total })
        setAllPoints((prev) => ({ ...prev, [week]: res.total }))
      })
      .catch(() => alive && setState((s) => ({ ...s, loading: false })))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, week, weekFixtures.length])

  const toggle = (round) => {
    setMsg('')
    setOpenWeekId((cur) => (cur === round ? null : round))
  }

  const pick = async (fixtureId, prediction) => {
    if (!user || lockedFor(week)) return
    setState((s) => ({ ...s, byFixture: { ...s.byFixture, [fixtureId]: { ...(s.byFixture[fixtureId] || {}), fixture_id: fixtureId, prediction } } }))
    try {
      await savePrediction(user.id, week, fixtureId, prediction)
      setSavedAt(Date.now()) // görsel teyit tetiği (kayıt akışının sonunda)
    } catch (e) {
      setMsg('⚠ Kaydedilemedi: ' + (e.message || e))
    }
  }

  const heroTotal = useMemo(() => Object.values(allPoints).reduce((s, v) => s + (v || 0), 0), [allPoints])

  if (!user) {
    return (
      <div className="kk">
        <Hero total={0} />
        <p className="kk-sub" style={{ textAlign: 'center', marginTop: 20 }}>Tahmin yapmak için giriş yapmalısın.</p>
        <div className="kk-authbtns">
          <Link to="/giris" className="kk-btn gold">Giriş Yap</Link>
          <Link to="/kayit" className="kk-btn">Kayıt Ol</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="kk">
      <Hero total={heroTotal} />

      <div className="joker-cta">
        <span className="jc-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>
        </span>
        <div className="jc-txt">
          <b>Puanların boşa gitmiyor</b>
          <span>Burada topladığın puanlarla Fantasy League için joker açacaksın. Market yakında — şimdiden puan topla.</span>
        </div>
        <span className="jc-chip">Yakında</span>
      </div>

      {msg && <div className={`kk-msg ${msg.startsWith('⚠') ? 'err' : 'ok'}`}>{msg}</div>}

      {weeksLoading ? (
        <div className="kk-note">Haftalar yükleniyor…</div>
      ) : (
        <div className="weeks">
          {visibleDesc.map((w) => {
            const open = w.round === openWeekId
            const locked = lockedFor(w.round)
            const pts = allPoints[w.round] ?? 0
            return (
              <div key={w.round} className={`week${open ? ' open' : ''}`}>
                <button className="wk-head" onClick={() => toggle(w.round)}>
                  <span className="wk-chev">›</span>
                  <span className="wk-name">Hafta {w.round}</span>
                  {locked ? (
                    <span className="wk-chip locked">Kilitli</span>
                  ) : (
                    <span className="wk-chip active"><span className="dot" />Tahmin Aktif</span>
                  )}
                  <span className="wk-right">
                    {locked ? (
                      <span className="wk-pts">{pts} puan</span>
                    ) : (
                      <span className="wk-dl">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                        <span className="k">Deadline</span>
                        <span className="v">{formatDeadline(w.deadline)}</span>
                      </span>
                    )}
                  </span>
                </button>
                <div className="wk-body">
                  <div className="wk-inner">{open && <WeekBody
                    fixtures={weekFixtures}
                    byFixture={state.byFixture}
                    loading={state.loading}
                    locked={locked}
                    total={state.total}
                    onPick={pick}
                    savedAt={savedAt}
                  />}</div>
                </div>
              </div>
            )
          })}
          {visibleDesc.length === 0 && <div className="kk-note">Gösterilecek hafta yok.</div>}
        </div>
      )}
    </div>
  )
}

function Hero({ total }) {
  return (
    <div className="kk-hero">
      <div className="kk-hero-id">
        <span className="kk-eyebrow">Tahmin Oyunu</span>
        <h1 className="kk-word">Kim Kazanır?</h1>
        <p className="kk-tag">Doğru bildiğin her maç +1 puan — Fantasy puanından tamamen ayrı.</p>
      </div>
      <div className="kk-total">
        <span className="l">Toplam Puan</span>
        <span className="v">{total}</span>
      </div>
      <span className="kk-watermark" aria-hidden="true">1 X 2</span>
    </div>
  )
}

function WeekBody({ fixtures, byFixture, loading, locked, total, onPick, savedAt }) {
  // "✓ Kaydedildi" görsel teyidi: savedAt değişince ~1.5 sn görünür (yalnızca UX).
  const [showSaved, setShowSaved] = useState(false)
  useEffect(() => {
    if (!savedAt) return
    setShowSaved(true)
    const t = setTimeout(() => setShowSaved(false), 1500)
    return () => clearTimeout(t)
  }, [savedAt])

  if (loading && !Object.keys(byFixture).length) return <div className="kk-note">Yükleniyor…</div>
  if (!fixtures.length) return <div className="kk-note">Bu hafta için maç yok.</div>

  const picked = fixtures.filter((f) => byFixture[f.fixture.id]?.prediction).length
  const correct = fixtures.filter((f) => byFixture[f.fixture.id]?.is_correct === true).length
  // Görsel özet için yanlış sayısı (mevcut is_correct verisinden; hesap değil)
  const wrong = fixtures.filter((f) => byFixture[f.fixture.id]?.is_correct === false).length

  return (
    <>
      {/* Kilitli hafta özeti — yalnızca görsel; veriler mevcut mantıktan */}
      {locked && (
        <div className="summary">
          <span className="sm-stat">
            <b className="ok">{correct}</b> doğru · <b className="no">{wrong}</b> yanlış
          </span>
          <span className="sm-dots">
            {fixtures.map((f) => (
              <span
                key={f.fixture.id}
                className={`sm-dot ${byFixture[f.fixture.id]?.is_correct === true ? 'ok' : 'no'}`}
              />
            ))}
          </span>
          <span className="sm-pts">+{total} puan</span>
        </div>
      )}
      {fixtures.map((f) => {
        const fid = f.fixture.id
        const pred = byFixture[fid]?.prediction
        const finished = FINISHED.has(f.fixture?.status?.short)
        const out = finished ? fixtureOutcome(f) : null
        const correctPick = byFixture[fid]?.is_correct
        return (
          <div key={fid} className="match">
            <div className="match-head">
              <div className="kk-teams">
                <span className="tn">{f.teams.home.name}</span>
                {finished && f.goals?.home != null ? (
                  <span className="ms">{f.goals.home}-{f.goals.away}</span>
                ) : (
                  <span className="vs">vs</span>
                )}
                <span className="tn">{f.teams.away.name}</span>
              </div>
              {finished && pred ? (
                <span className={`mres ${correctPick ? 'ok' : 'no'}`}>{correctPick ? '✓ +1' : '+0'}</span>
              ) : (
                <span className="mtime">{dt(f.fixture.date)}</span>
              )}
            </div>
            <div className={`tripick${locked ? ' locked' : ''}`}>
              {SEGS.map((s) => {
                let cls = ''
                let mk = '' // köşe işaretçisi (yalnızca görsel; cls ile aynı mantıktan)
                if (finished && out) {
                  if (s.key === pred) {
                    cls = s.key === out ? ' correct' : ' wrong'
                    mk = s.key === out ? 'SONUÇ' : '✕'
                  } else if (s.key === out) {
                    cls = ' answer'
                    mk = 'SONUÇ'
                  }
                } else if (pred === s.key) {
                  cls = ' sel'
                }
                return (
                  <div
                    key={s.key}
                    className={`seg${cls}`}
                    data-p={s.p}
                    onClick={() => !locked && onPick(fid, s.key)}
                  >
                    {mk && <span className="mk">{mk}</span>}
                    <span className="sym">{s.p}</span>
                    <span className="lbl">{s.lbl}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="wk-foot">
        {locked ? (
          <span className="wk-summary"><b>{correct}</b> doğru tahmin · <b>{total}</b> puan</span>
        ) : (
          <>
            <span className="wk-count">{picked}/{fixtures.length} tahmin yapıldı</span>
            <span className={`wk-saved${showSaved ? ' show' : ''}`}>✓ Kaydedildi</span>
            <span className="wk-note">Seçimlerin anında kaydedilir · deadline'a kadar değiştirebilirsin</span>
          </>
        )}
      </div>
    </>
  )
}
