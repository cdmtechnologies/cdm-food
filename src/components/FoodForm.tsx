import { useState } from 'react'
import { ALL_COUNTRIES, estimateFood, flag, saveFood, type NewFood } from '../lib/api'
import { MEAL_LABEL, MEALS, TAG_LABEL, type Food, type Meal } from '../lib/planner'
import { Alert, Icon } from './ui'

const CONTAINS = ['meat', 'poultry', 'fish', 'shellfish', 'pork', 'dairy', 'egg', 'nuts', 'gluten', 'soy', 'sesame', 'alcohol']
const QUALITIES = ['high_protein', 'high_fibre', 'low_carb', 'low_gi', 'whole_grain', 'light', 'fried', 'sugary', 'high_salt', 'spicy']

const empty = (country: string | null, meal?: Meal): NewFood => ({
  name: '', country_code: country, description: '', meals: meal ? [meal] : ['lunch', 'dinner'], serving: '1 plate',
  kcal: null, protein_g: null, carbs_g: null, fat_g: null, fibre_g: null, tags: [], ingredients: [], cost_level: 1, prep_minutes: null,
})

/** Add or edit one of the person's own foods. "Fill in with AI" estimates the nutrition from the name. */
export default function FoodForm({ food, country, meal, onSaved, onCancel }: {
  food?: Food; country: string | null; meal?: Meal; onSaved: (f: Food) => void; onCancel: () => void
}) {
  const [f, setF] = useState<NewFood>(() => (food ? { ...food } : empty(country, meal)))
  const [ingr, setIngr] = useState((food?.ingredients ?? []).join(', '))
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState<'' | 'ai' | 'save'>('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const set = <K extends keyof NewFood>(k: K, v: NewFood[K]) => setF((x) => ({ ...x, [k]: v }))
  const toggle = (k: 'meals' | 'tags', v: string) => setF((x) => ({ ...x, [k]: (x[k] as string[]).includes(v) ? (x[k] as string[]).filter((y) => y !== v) : [...(x[k] as string[]), v] }))
  const numIn = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g' | 'prep_minutes', max: number) => (
    <input type="number" inputMode="decimal" min={0} max={max} step="any" className="input" value={f[k] ?? ''}
      onChange={(e) => set(k, e.target.value === '' ? null : Math.min(max, Math.max(0, Number(e.target.value))))} />
  )

  async function estimate() {
    if (!f.name.trim()) { setErr('Type the name of the food first.'); return }
    setBusy('ai'); setErr(''); setNote('')
    try {
      const { food: e } = await estimateFood(f.name.trim(), f.country_code, details)
      setF((x) => ({ ...x, ...e, name: x.name.trim() || e.name, country_code: x.country_code ?? e.country_code, description: e.description ? `${e.description} (nutrition estimated by AI)` : 'Nutrition estimated by AI' }))
      setIngr((e.ingredients ?? []).join(', '))
      setNote('Filled in by AI. These are estimates: check them and change anything you know better.')
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  async function save(ev: { preventDefault: () => void }) {
    ev.preventDefault()
    if (!f.name.trim()) { setErr('Give the food a name.'); return }
    if (!f.meals.length) { setErr('Choose at least one meal it is for.'); return }
    setBusy('save'); setErr('')
    try {
      const saved = await saveFood({ ...f, name: f.name.trim(), ingredients: ingr.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 25), kcal: f.kcal == null ? null : Math.round(f.kcal) }, food?.id)
      onSaved(saved)
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="label" htmlFor="ff-name">Food name</label>
        <input id="ff-name" className="input" maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="For example: Grandma's vegetable soup" autoFocus />
      </div>
      <div className="rounded-2xl bg-brand-50 p-3">
        <label className="label" htmlFor="ff-details">Anything that helps the AI (optional)</label>
        <input id="ff-details" className="input" maxLength={300} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ingredients, size of the portion, how it is cooked" />
        <button type="button" onClick={estimate} disabled={busy !== ''} className="btn btn-spice mt-2 w-full sm:w-auto"><Icon.sparkle /> {busy === 'ai' ? 'Estimating…' : 'Fill in with AI'}</button>
        {note && <p className="mt-2 text-sm text-brand-800">{note}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">Country</span>
          <select className="input" value={f.country_code ?? ''} onChange={(e) => set('country_code', e.target.value || null)}>
            <option value="">Not one country</option>
            {ALL_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name}</option>)}
          </select>
        </label>
        <label><span className="label">One serving is</span><input className="input" maxLength={60} value={f.serving ?? ''} onChange={(e) => set('serving', e.target.value)} placeholder="1 plate (350 g)" /></label>
      </div>
      <fieldset>
        <legend className="label">Good for</legend>
        <div className="flex flex-wrap gap-2">{MEALS.map((m) => <button key={m} type="button" aria-pressed={f.meals.includes(m)} className={`chip ${f.meals.includes(m) ? 'chip-on' : 'chip-off'}`} onClick={() => toggle('meals', m)}>{MEAL_LABEL[m]}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend className="label">Nutrition for one serving (leave blank if you don't know)</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <label className="text-xs text-slate-600">Calories (kcal){numIn('kcal', 3000)}</label>
          <label className="text-xs text-slate-600">Protein (g){numIn('protein_g', 300)}</label>
          <label className="text-xs text-slate-600">Carbs (g){numIn('carbs_g', 500)}</label>
          <label className="text-xs text-slate-600">Fat (g){numIn('fat_g', 300)}</label>
          <label className="text-xs text-slate-600">Fibre (g){numIn('fibre_g', 100)}</label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">It contains</legend>
        <div className="flex flex-wrap gap-2">{CONTAINS.map((t) => <button key={t} type="button" aria-pressed={f.tags.includes(t)} className={`chip ${f.tags.includes(t) ? 'chip-on' : 'chip-off'}`} onClick={() => toggle('tags', t)}>{TAG_LABEL[t]}</button>)}</div>
        <p className="mt-1 text-xs text-slate-500">This keeps it away from people with these allergies or diets.</p>
      </fieldset>
      <fieldset>
        <legend className="label">It is</legend>
        <div className="flex flex-wrap gap-2">{QUALITIES.map((t) => <button key={t} type="button" aria-pressed={f.tags.includes(t)} className={`chip ${f.tags.includes(t) ? 'chip-on' : 'chip-off'}`} onClick={() => toggle('tags', t)}>{TAG_LABEL[t]}</button>)}</div>
      </fieldset>
      <label className="block"><span className="label">Main ingredients (separate with commas)</span><input className="input" maxLength={600} value={ingr} onChange={(e) => setIngr(e.target.value)} placeholder="rice, tomato, onion, chicken" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">Cost</span>
          <select className="input" value={f.cost_level ?? 1} onChange={(e) => set('cost_level', Number(e.target.value))}>
            <option value={1}>Budget</option><option value={2}>Moderate</option><option value={3}>Special</option>
          </select>
        </label>
        <label><span className="label">Minutes to prepare</span>{numIn('prep_minutes', 1440)}</label>
      </div>
      <label className="block"><span className="label">Notes (optional)</span><input className="input" maxLength={400} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></label>
      {err && <Alert>{err}</Alert>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy !== ''}>{busy === 'save' ? 'Saving…' : food ? 'Save changes' : 'Add food'}</button>
      </div>
    </form>
  )
}
