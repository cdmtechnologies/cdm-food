import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Icon, kcal, Modal, Spinner } from '../components/ui'
import { deleteWeight, foodsByIds, logWeight, planRange, saveProfile, weights, type ProfileRow, type Weigh } from '../lib/api'
import {
  ACTIVITY, age, bmi, BMI_LABEL, bmiBand, bodyIssue, bodyTarget, cmToFtIn, ftInToCm, healthyRange, kgToLb, lbToKg, progress, weeksToTarget,
  type Activity, type Sex,
} from '../lib/body'
import { dailyTarget, dayLabel, eatenTotals, iso, weekDays, weekStart, type Food } from '../lib/planner'
import { locale, t } from '../i18n'

/** Body measurements, weigh-ins and how closely the week's plan was followed. */
export default function Progress({ profile, onSaved }: { profile: ProfileRow; onSaved: (p: ProfileRow) => void }) {
  const [log, setLog] = useState<Weigh[] | null>(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)
  const imperial = profile.units === 'imperial'
  const w = (kg: number | null) => (kg == null ? '–' : imperial ? `${kgToLb(kg)} lb` : `${kg} kg`)

  const loadLog = useCallback(() => {
    const from = new Date(); from.setDate(from.getDate() - 365)
    return weights(iso(from)).then(setLog, (e) => { setErr(e.message); setLog([]) })
  }, [])
  useEffect(() => { loadLog() }, [loadLog])

  const b = bmi(profile.height_cm, profile.weight_kg)
  const band = b ? bmiBand(b) : null
  const range = healthyRange(profile.height_cm)
  const bt = bodyTarget(profile)
  const target = dailyTarget(profile)
  const weeks = weeksToTarget(profile, bt)
  const start = log?.length ? log[0].kg : null
  const pr = progress(start, profile.weight_kg, profile.target_weight_kg)
  const complete = !!(profile.sex && profile.birth_year && profile.height_cm && profile.weight_kg)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('My progress')}</h1>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}><Icon.user /> {complete ? t('Edit my body details') : t('Add my body details')}</button>
      </div>
      {err && <Alert>{err}</Alert>}

      {!complete && (
        <div className="card flex flex-col items-start gap-2 p-5 sm:flex-row sm:items-center">
          <div className="text-4xl" aria-hidden="true">📏</div>
          <div className="flex-1">
            <p className="font-semibold">{t('Add your height, weight and a target')}</p>
            <p className="text-sm text-slate-600">{t('CDM Food then works out the calories that suit you and tracks your progress. Only you can see these details.')}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>{t('Add details')}</button>
        </div>
      )}

      {complete && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t('Weight now')} value={w(profile.weight_kg)} sub={profile.target_weight_kg ? t('Target {w}', { w: w(profile.target_weight_kg) }) : t('No target set')} />
          <Stat label={t('BMI')} value={b ? String(b) : '–'} sub={band ? t(BMI_LABEL[band]) : ''} tone={band === 'healthy' ? 'ok' : band ? 'warn' : undefined} />
          <Stat label={t('Daily calories')} value={kcal(target)} sub={profile.daily_kcal ? t('Your own target (Account)') : bt?.direction === 'lose' ? t('About {kg} kg a week down', { kg: bt.kgPerWeek }) : bt?.direction === 'gain' ? t('About {kg} kg a week up', { kg: bt.kgPerWeek }) : t('To keep your weight')} />
        </div>
      )}

      {complete && (
        <div className="card space-y-2 p-4 text-sm text-slate-700">
          {range && <p>{t('A healthy weight for your height is about {a} to {b}.', { a: w(range[0]), b: w(range[1]) })}</p>}
          {bt && <p>{t('Your body uses about {k} a day.', { k: kcal(bt.maintenance) })} {weeks ? t('At this pace you could reach your target in about {n} weeks.', { n: weeks }) : ''}</p>}
          {bt?.note && <Alert tone="info">{t(bt.note)}</Alert>}
          {band === 'under' && <Alert tone="info">{t('Your weight is below the healthy range for your height. Plans will not cut calories; please talk to a doctor about the right weight for you.')}</Alert>}
          {pr != null && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{t('Start {w}', { w: w(start) })}</span><span>{t('{p}% of the way', { p: pr })}</span><span>{t('Target {w}', { w: w(profile.target_weight_kg) })}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${pr}%` }} /></div>
            </div>
          )}
          <p className="text-xs text-slate-400">{t('These figures are estimates for healthy adults and are not medical advice.')}</p>
        </div>
      )}

      <WeighIn profile={profile} log={log} imperial={imperial} onSaved={async () => { await loadLog(); onSaved({ ...profile }) }} onError={setErr} />
      <WeekFollow profile={profile} target={target} />

      <BodyForm open={editing} profile={profile} onClose={() => setEditing(false)} onSaved={(p) => { setEditing(false); onSaved(p); loadLog() }} />
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${tone === 'ok' ? 'text-brand-700' : tone === 'warn' ? 'text-spice-600' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function WeighIn({ profile, log, imperial, onSaved, onError }: { profile: ProfileRow; log: Weigh[] | null; imperial: boolean; onSaved: () => void; onError: (m: string) => void }) {
  const today = iso(new Date())
  const [val, setVal] = useState('')
  const [day, setDay] = useState(today)
  const [busy, setBusy] = useState(false)
  async function save(e: { preventDefault: () => void }) {
    e.preventDefault()
    const n = Number(val)
    const kg = imperial ? lbToKg(n) : Math.round(n * 10) / 10
    if (!(kg >= 25 && kg <= 350)) { onError(t('Weight should be between 25 and 350 kg.')); return }
    setBusy(true)
    try { await logWeight(day, kg); setVal(''); onSaved() } catch (er) { onError((er as Error).message) }
    setBusy(false)
  }
  const recent = (log ?? []).slice(-90)
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-bold">{t('Weigh-ins')}</h2>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-sm font-semibold">{imperial ? t('Weight (lb)') : t('Weight (kg)')}
          <input className="input mt-1 w-32" type="number" inputMode="decimal" step="0.1" required value={val} onChange={(e) => setVal(e.target.value)} placeholder={profile.weight_kg ? String(imperial ? kgToLb(profile.weight_kg) : profile.weight_kg) : ''} />
        </label>
        <label className="flex flex-col text-sm font-semibold">{t('Date')}
          <input className="input mt-1 w-40" type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? t('Saving…') : t('Save weigh-in')}</button>
      </form>
      {log === null ? <Spinner label={t('Loading…')} /> : recent.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t('No weigh-ins yet. Weigh yourself at the same time of day, once or twice a week.')}</p>
      ) : (
        <>
          <WeightChart log={recent} target={profile.target_weight_kg} imperial={imperial} />
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {[...recent].reverse().slice(0, 8).map((x) => (
              <li key={x.day} className="chip chip-off py-0.5">{dayLabel(x.day, locale())}: <b>{imperial ? `${kgToLb(x.kg)} lb` : `${x.kg} kg`}</b>
                <button type="button" className="ml-1 text-slate-400 hover:text-red-600" aria-label={t('Delete the weigh-in on {d}', { d: dayLabel(x.day, locale()) })} onClick={() => deleteWeight(x.day).then(onSaved, (e) => onError(e.message))}><Icon.x className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** A small line chart of weigh-ins, with the target as a dashed line. */
function WeightChart({ log, target, imperial }: { log: Weigh[]; target: number | null; imperial: boolean }) {
  const conv = (kg: number) => (imperial ? kgToLb(kg) : kg)
  const vals = log.map((x) => conv(x.kg))
  const tv = target ? conv(target) : null
  const lo = Math.floor(Math.min(...vals, tv ?? Infinity) - 1)
  const hi = Math.ceil(Math.max(...vals, tv ?? -Infinity) + 1)
  const W = 900, H = 200, P = 30
  const t0 = new Date(log[0].day).getTime(), t1 = new Date(log[log.length - 1].day).getTime()
  const x = (d: string) => (t1 === t0 ? W / 2 : P + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - P * 2))
  const y = (v: number) => H - P - ((v - lo) / Math.max(1, hi - lo)) * (H - P * 2)
  const pts = log.map((p, i) => `${x(p.day)},${y(vals[i])}`).join(' ')
  const unit = imperial ? 'lb' : 'kg'
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('Weight from {a} to {b}', { a: `${vals[0]} ${unit}`, b: `${vals[vals.length - 1]} ${unit}` })}>
        <line x1={P} x2={W - P} y1={y(lo)} y2={y(lo)} stroke="#e2e8f0" />
        <text x={4} y={y(hi) + 4} fontSize="11" fill="#64748b">{hi}</text>
        <text x={4} y={y(lo) + 4} fontSize="11" fill="#64748b">{lo}</text>
        {tv != null && <><line x1={P} x2={W - P} y1={y(tv)} y2={y(tv)} stroke="#f97316" strokeDasharray="6 5" /><text x={W - P} y={y(tv) - 5} fontSize="11" fill="#ea580c" textAnchor="end">{t('Target')}</text></>}
        {log.length > 1 && <polyline points={pts} fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinejoin="round" />}
        {log.map((p, i) => <circle key={p.day} cx={x(p.day)} cy={y(vals[i])} r="3.5" fill="#15803d"><title>{`${p.day}: ${vals[i]} ${unit}`}</title></circle>)}
      </svg>
    </figure>
  )
}

/** This week: what was eaten each day against the target, and how many meals went as planned. */
function WeekFollow({ profile, target }: { profile: ProfileRow; target: number }) {
  const days = useMemo(() => weekDays(weekStart(new Date())), [])
  const today = iso(new Date())
  const [rows, setRows] = useState<{ day: string; kcal: number; followed: number; logged: number; planned: number }[] | null>(null)
  useEffect(() => {
    let live = true
    planRange(days[0], days[6]).then(async (items) => {
      const fs = await foodsByIds(items.flatMap((i) => (i.ate_food_id ? [i.food_id, i.ate_food_id] : [i.food_id])))
      const map = new Map<string, Food>(fs.map((f) => [f.id, f]))
      if (live) setRows(days.filter((d) => d <= today).map((d) => { const e = eatenTotals(items.filter((i) => i.day === d), map); return { day: d, kcal: e.kcal, followed: e.followed, logged: e.logged, planned: e.planned } }))
    }, () => live && setRows([]))
    return () => { live = false }
  }, [days, today, profile.id])
  if (!rows) return <Spinner label={t('Loading…')} />
  const planned = rows.reduce((n, r) => n + r.planned, 0)
  const followed = rows.reduce((n, r) => n + r.followed, 0)
  const logged = rows.reduce((n, r) => n + r.logged, 0)
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">{t('This week so far')}</h2>
        {planned > 0 && <span className="text-sm text-slate-600">{t('{done} of {all} meals as planned', { done: followed, all: planned })}{logged < planned ? ` · ${t('{n} not ticked yet', { n: planned - logged })}` : ''}</span>}
      </div>
      {rows.length === 0 || planned === 0 ? <p className="text-sm text-slate-500">{t('Plan your week and tick your meals to see how you are doing.')}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.day} className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-2 text-sm">
              <span className="text-slate-600">{dayLabel(r.day, locale())}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <span className={`block h-full rounded-full ${r.kcal > target * 1.15 ? 'bg-spice-500' : 'bg-brand-600'}`} style={{ width: `${Math.min(100, (r.kcal / target) * 100)}%` }} />
              </span>
              <span className="text-right font-semibold">{r.logged ? kcal(r.kcal) : <span className="font-normal text-slate-400">{t('not ticked')}</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function BodyForm({ open, profile, onClose, onSaved }: { open: boolean; profile: ProfileRow; onClose: () => void; onSaved: (p: ProfileRow) => void }) {
  const [units, setUnits] = useState(profile.units)
  const [sex, setSex] = useState<Sex | ''>(profile.sex ?? '')
  const [year, setYear] = useState(profile.birth_year ? String(profile.birth_year) : '')
  const [cm, setCm] = useState(profile.height_cm ? String(profile.height_cm) : '')
  const [ft, setFt] = useState(() => (profile.height_cm ? String(cmToFtIn(profile.height_cm)[0]) : ''))
  const [inch, setInch] = useState(() => (profile.height_cm ? String(cmToFtIn(profile.height_cm)[1]) : ''))
  const [wt, setWt] = useState(profile.weight_kg ? String(profile.units === 'imperial' ? kgToLb(profile.weight_kg) : profile.weight_kg) : '')
  const [tg, setTg] = useState(profile.target_weight_kg ? String(profile.units === 'imperial' ? kgToLb(profile.target_weight_kg) : profile.target_weight_kg) : '')
  const [act, setAct] = useState<Activity | ''>(profile.activity ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const imp = units === 'imperial'
  const toKg = (s: string) => (s.trim() ? (imp ? lbToKg(Number(s)) : Math.round(Number(s) * 10) / 10) : null)

  function switchUnits(u: 'metric' | 'imperial') {
    if (u === units) return
    const conv = (s: string) => (s.trim() ? String(u === 'imperial' ? kgToLb(Number(s)) : lbToKg(Number(s))) : '')
    setWt(conv(wt)); setTg(conv(tg))
    if (u === 'imperial' && cm) { const [f, i] = cmToFtIn(Number(cm)); setFt(String(f)); setInch(String(i)) }
    if (u === 'metric' && ft) setCm(String(ftInToCm(Number(ft), Number(inch || 0))))
    setUnits(u)
  }

  async function save(e: { preventDefault: () => void }) {
    e.preventDefault()
    const height = imp ? (ft ? ftInToCm(Number(ft), Number(inch || 0)) : null) : cm ? Math.round(Number(cm) * 10) / 10 : null
    const patch = { units, sex: sex || null, birth_year: year ? Number(year) : null, height_cm: height, weight_kg: toKg(wt), target_weight_kg: toKg(tg), activity: act || null }
    const problem = bodyIssue(patch)
    if (problem) { setErr(t(problem.text, problem.vars)); return }
    setBusy(true); setErr('')
    try {
      await saveProfile(profile.id, patch)
      if (patch.weight_kg && patch.weight_kg !== profile.weight_kg) await logWeight(iso(new Date()), patch.weight_kg)
      onSaved({ ...profile, ...patch })
    } catch (er) { setErr((er as Error).message) }
    setBusy(false)
  }
  const a = age(year ? Number(year) : null)
  return (
    <Modal open={open} title={t('My body details')} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="flex gap-2" role="group" aria-label={t('Units')}>
          <button type="button" className={`chip ${!imp ? 'chip-on' : 'chip-off'}`} aria-pressed={!imp} onClick={() => switchUnits('metric')}>kg · cm</button>
          <button type="button" className={`chip ${imp ? 'chip-on' : 'chip-off'}`} aria-pressed={imp} onClick={() => switchUnits('imperial')}>lb · ft</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">{t('Sex')}
            <select className="input mt-1" value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}>
              <option value="">{t('Choose')}</option><option value="female">{t('Female')}</option><option value="male">{t('Male')}</option>
            </select>
          </label>
          <label className="text-sm font-semibold">{t('Year of birth')}
            <input className="input mt-1" type="number" inputMode="numeric" min={1915} max={new Date().getFullYear() - 13} value={year} onChange={(e) => setYear(e.target.value)} placeholder="1990" />
            {a ? <span className="text-xs font-normal text-slate-500">{t('{n} years old', { n: a })}</span> : null}
          </label>
          {imp ? (
            <div className="text-sm font-semibold">{t('Height')}
              <div className="mt-1 flex gap-2">
                <input className="input" type="number" inputMode="numeric" min={3} max={8} value={ft} onChange={(e) => setFt(e.target.value)} aria-label={t('Feet')} placeholder="5 ft" />
                <input className="input" type="number" inputMode="numeric" min={0} max={11} value={inch} onChange={(e) => setInch(e.target.value)} aria-label={t('Inches')} placeholder="7 in" />
              </div>
            </div>
          ) : (
            <label className="text-sm font-semibold">{t('Height (cm)')}
              <input className="input mt-1" type="number" inputMode="decimal" step="0.5" min={100} max={250} value={cm} onChange={(e) => setCm(e.target.value)} placeholder="170" />
            </label>
          )}
          <label className="text-sm font-semibold">{imp ? t('Weight (lb)') : t('Weight (kg)')}
            <input className="input mt-1" type="number" inputMode="decimal" step="0.1" value={wt} onChange={(e) => setWt(e.target.value)} placeholder={imp ? '165' : '75'} />
          </label>
          <label className="col-span-2 text-sm font-semibold">{imp ? t('Target weight (lb), optional') : t('Target weight (kg), optional')}
            <input className="input mt-1" type="number" inputMode="decimal" step="0.1" value={tg} onChange={(e) => setTg(e.target.value)} />
          </label>
          <label className="col-span-2 text-sm font-semibold">{t('How active are you?')}
            <select className="input mt-1" value={act} onChange={(e) => setAct(e.target.value as Activity | '')}>
              <option value="">{t('Choose')}</option>
              {ACTIVITY.map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-500">{t('Used only to work out your calories and progress. You can clear them at any time.')}</p>
        {err && <Alert>{err}</Alert>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? t('Saving…') : t('Save')}</button>
      </form>
    </Modal>
  )
}
