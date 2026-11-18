import { useMemo, useState } from 'react'
import { ALL_COUNTRIES, flag, saveProfile, type ProfileRow } from '../lib/api'
import { ALLERGIES, dailyTarget, DIETS, GOALS, MEAL_LABEL, MEALS, type Allergy, type Goal, type Meal } from '../lib/planner'
import { Alert } from './ui'

const REGION_ORDER = ['West Africa', 'Central Africa', 'East Africa', 'Southern Africa', 'North Africa', 'Europe', 'North America', 'Latin America & Caribbean', 'Middle East', 'South Asia', 'East Asia', 'Southeast Asia', 'Central Asia', 'Oceania']

export function CountrySelect({ value, onChange, id }: { value: string | null; onChange: (c: string) => void; id?: string }) {
  const groups = useMemo(() => REGION_ORDER.map((r) => ({ r, list: ALL_COUNTRIES.filter((c) => c.region === r) })), [])
  return (
    <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} required>
      <option value="" disabled>Choose your country…</option>
      {groups.map((g) => <optgroup key={g.r} label={g.r}>{g.list.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name}</option>)}</optgroup>)}
    </select>
  )
}

/** The person's food settings: country, diet, allergies, health goals, calories, meals and household. */
export default function PrefsForm({ profile, onSaved, first = false }: { profile: ProfileRow; onSaved: (p: ProfileRow) => void; first?: boolean }) {
  const [p, setP] = useState<ProfileRow>(profile)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const set = <K extends keyof ProfileRow>(k: K, v: ProfileRow[K]) => { setP((x) => ({ ...x, [k]: v })); setOk('') }
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function save(e: { preventDefault: () => void }) {
    e.preventDefault()
    if (!p.country_code) { setErr('Choose your country.'); return }
    if (!p.meals.length) { setErr('Choose at least one meal to plan.'); return }
    if (p.daily_kcal != null && (p.daily_kcal < 1200 || p.daily_kcal > 5000)) { setErr('Daily calories should be between 1,200 and 5,000. Leave it blank to use a suggested amount.'); return }
    setBusy(true); setErr('')
    try {
      const { id: _id, premium_until: _pu, ...patch } = p
      await saveProfile(p.id, patch)
      setOk('Saved.')
      onSaved(p)
    } catch (ex) { setErr((ex as Error).message) }
    setBusy(false)
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {first && (
        <label className="block"><span className="label">Your name (optional)</span>
          <input className="input" maxLength={80} value={p.display_name ?? ''} onChange={(e) => set('display_name', e.target.value)} />
        </label>
      )}
      <div>
        <label className="label" htmlFor="pf-country">Country whose dishes you eat most</label>
        <CountrySelect id="pf-country" value={p.country_code} onChange={(c) => set('country_code', c)} />
        <p className="mt-1 text-xs text-slate-500">You can add dishes from any other country to your plan too.</p>
      </div>
      <fieldset>
        <legend className="label">Your diet</legend>
        <div className="flex flex-wrap gap-2">{DIETS.map((d) => <button key={d.id} type="button" aria-pressed={p.diet === d.id} className={`chip ${p.diet === d.id ? 'chip-on' : 'chip-off'}`} onClick={() => set('diet', d.id)}>{d.label}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend className="label">Allergies or foods you must avoid</legend>
        <div className="flex flex-wrap gap-2">{ALLERGIES.map((a) => <button key={a.id} type="button" aria-pressed={p.allergies.includes(a.id)} className={`chip ${p.allergies.includes(a.id) ? 'chip-on' : 'chip-off'}`} onClick={() => set('allergies', toggle<Allergy>(p.allergies, a.id))}>{a.label}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend className="label">Health and goals</legend>
        <div className="flex flex-wrap gap-2">{GOALS.map((g) => <button key={g.id} type="button" aria-pressed={p.goals.includes(g.id)} className={`chip ${p.goals.includes(g.id) ? 'chip-on' : 'chip-off'}`} onClick={() => set('goals', toggle<Goal>(p.goals, g.id))}>{g.label}</button>)}</div>
        {p.goals.some((g) => ['diabetes', 'blood_pressure', 'cholesterol', 'heart', 'kidney', 'pregnancy'].includes(g)) && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">CDM Food favours suitable dishes for these, but it is not medical advice. Follow your doctor's or dietitian's advice, especially if you take medicine.</p>
        )}
      </fieldset>
      <fieldset>
        <legend className="label">Meals to plan each day</legend>
        <div className="flex flex-wrap gap-2">{MEALS.map((m) => <button key={m} type="button" aria-pressed={p.meals.includes(m)} className={`chip ${p.meals.includes(m) ? 'chip-on' : 'chip-off'}`} onClick={() => set('meals', toggle<Meal>(p.meals, m))}>{MEAL_LABEL[m]}</button>)}</div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="label">Daily calories (optional)</span>
          <input type="number" min={1200} max={5000} step={50} className="input" value={p.daily_kcal ?? ''} placeholder={`Suggested: ${dailyTarget({ daily_kcal: null, goals: p.goals })}`}
            onChange={(e) => set('daily_kcal', e.target.value === '' ? null : Number(e.target.value))} />
        </label>
        <label><span className="label">People you cook for</span>
          <input type="number" min={1} max={20} className="input" value={p.household} onChange={(e) => set('household', Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
          <span className="mt-1 block text-xs text-slate-500">Used for the shopping list.</span>
        </label>
      </div>
      <label className="block"><span className="label">Likes and dislikes (optional)</span>
        <input className="input" maxLength={500} value={p.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="For example: no okra, love fish, quick breakfasts on weekdays" />
        <span className="mt-1 block text-xs text-slate-500">Ask AI reads this when it changes your plan.</span>
      </label>
      {err && <Alert>{err}</Alert>}
      {ok && <Alert tone="ok">{ok}</Alert>}
      <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>{busy ? 'Saving…' : first ? 'Start planning' : 'Save my settings'}</button>
    </form>
  )
}
