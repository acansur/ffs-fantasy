import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useSquad } from '../lib/squadStore.jsx'
import { getVisibleWeeks, getActiveRound, isLocked, formatDeadline } from '../lib/weeks.js'
import { loadAndScoreWeek, savePrediction } from '../lib/predictionsDb.js'
import WeekBar from '../components/WeekBar.jsx'
import './KimKazanir.css'

const roundNo = (r) => Number(String(r).match(/\d+/)?.[0] ?? 0)
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO'])
const PICKS = [
  ['home', 'Ev Sahibi'],
  ['draw', 'Beraberlik'],
  ['away', 'Deplasman'],
]
const dt = (iso) =>
  new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })

export default function KimKazanir() {
  const { user } = useAuth()
  const { weeks, fixtures, weekOverrides, weeksLoading } = useSquad()

  const now = Date.now()
  // Bağımsız hafta seçimi (fantasy'nin seçili haftasını etkilemez)
  const [week, setWeek] = useState(null)
  useEffect(() => {
    if (week == null && weeks.length) setWeek(getActiveRound(weeks))
  }, [weeks, week])

  const [state, setState] = useState({ loading: false, byFixture: {}, total: 0 })
  const [msg, setMsg] = useState('')

  const visibleWeeks = getVisibleWeeks(weeks, now)
  const selectedWeek = weeks.find((w) => w.round === week) || null
  const override = weekOverrides?.[week]
  const locked = override != null ? override : isLocked(selectedWeek, now)
  const deadlineText = selectedWeek ? formatDeadline(selectedWeek.deadline) : '—'

  const weekFixtures = useMemo(() => {
    if (week == null) return []
    return fixtures
      .filter((f) => roundNo(f.league?.round) === week)
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
  }, [fixtures, week])

  // Tahminleri yükle + biten maçları puanla
  useEffect(() => {
    if (!user || week == null || !weekFixtures.length) return
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    loadAndScoreWeek(user.id, week, weekFixtures)
      .then((res) => alive && setState({ loading: false, byFixture: res.byFixture, total: res.total }))
      .catch(() => alive && setState((s) => ({ ...s, loading: false })))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, week, weekFixtures.length])

  const pick = async (fixtureId, prediction) => {
    if (locked || !user) return
    // İyimser güncelleme
    setState((s) => ({ ...s, byFixture: { ...s.byFixture, [fixtureId]: { ...(s.byFixture[fixtureId] || {}), fixture_id: fixtureId, prediction } } }))
    try {
      await savePrediction(user.id, week, fixtureId, prediction)
    } catch (e) {
      setMsg('⚠ Kaydedilemedi: ' + (e.message || e))
    }
  }

  if (!user) {
    return (
      <div className="kk">
        <h1 className="kk-title">Kim Kazanır?</h1>
        <p className="kk-sub">Tahmin yapmak için giriş yapmalısın.</p>
        <div className="kk-authbtns">
          <Link to="/giris" className="kk-btn gold">Giriş Yap</Link>
          <Link to="/kayit" className="kk-btn">Kayıt Ol</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="kk">
      <div className="kk-head">
        <div>
          <h1 className="kk-title">Kim Kazanır?</h1>
          <p className="kk-sub">Her maçın sonucunu tahmin et — doğru tahmin +1 puan. Fantasy puanından bağımsız.</p>
        </div>
        <div className="kk-score">
          <span className="l">Bu hafta</span>
          <span className="v">{state.total}<small> P</small></span>
        </div>
      </div>

      <WeekBar
        weeks={weeks}
        visible={visibleWeeks}
        selected={week}
        onSelect={setWeek}
        now={now}
        loading={weeksLoading}
        selectedPoints={locked ? state.total : null}
      />

      <div className="kk-deadline">
        {locked ? (
          <span className="lock">🔒 Hafta {week} kilitli — tahminler değiştirilemez.</span>
        ) : (
          <span>Deadline: <b>{deadlineText}</b> — o zamana kadar değiştirebilirsin.</span>
        )}
      </div>

      {msg && <div className="kk-msg err">{msg}</div>}

      {weekFixtures.length === 0 ? (
        <div className="kk-note">Bu hafta için maç bulunamadı.</div>
      ) : (
        <div className="kk-list">
          {weekFixtures.map((f) => {
            const fid = f.fixture.id
            const pred = state.byFixture[fid]?.prediction
            const finished = FINISHED.has(f.fixture?.status?.short)
            const correct = state.byFixture[fid]?.is_correct
            return (
              <div key={fid} className={`kk-match${finished ? ' done' : ''}`}>
                <div className="kk-match-top">
                  <span className="kk-teams">
                    <b>{f.teams.home.name}</b>
                    <span className="kk-vs">{finished ? `${f.goals.home} - ${f.goals.away}` : 'vs'}</span>
                    <b>{f.teams.away.name}</b>
                  </span>
                  <span className="kk-date">
                    {finished ? <span className={`kk-res ${correct === true ? 'ok' : correct === false ? 'no' : ''}`}>
                      {pred ? (correct === true ? '✓ +1' : correct === false ? '✗ 0' : 'Bitti') : 'Tahmin yok'}
                    </span> : dt(f.fixture.date)}
                  </span>
                </div>
                <div className="kk-picks">
                  {PICKS.map(([key, label]) => (
                    <button
                      key={key}
                      className={`kk-pick${pred === key ? ' sel' : ''}`}
                      disabled={locked}
                      onClick={() => pick(fid, key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
