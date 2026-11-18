import { useEffect, useMemo, useState } from 'react'
import { ALL_COUNTRIES, countryFoods, flag, myFoods, searchFoods } from '../lib/api'
import { MEAL_LABEL, unsuitable, type Food, type Meal, type Profile } from '../lib/planner'
import { Alert, Icon, kcal, Modal, Spinner, Tags } from './ui'

/** Choose a food for a meal: from the person's country, any country, or their own foods. */
export default function FoodPicker({ open, meal, profile, country, onPick, onClose, onAddOwn }: {
  open: boolean; meal: Meal; profile: Profile; country: string | null
  onPick: (f: Food) => void; onClose: () => void; onAddOwn: () => void
}) {
  const [from, setFrom] = useState<string>(country ?? 'mine')
  const [q, setQ] = useState('')
  const [suitsOnly, setSuitsOnly] = useState(true)
  const [allMeals, setAllMeals] = useState(false)
  const [foods, setFoods] = useState<Food[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => { if (open) { setFrom(country ?? 'mine'); setQ('') } }, [open, country])
  useEffect(() => {
    if (!open) return
    let live = true
    setFoods(null); setErr('')
    const words = q.trim()
    const p = from === 'mine' ? myFoods()
      : from === 'any' ? (words.length >= 2 ? searchFoods(words.replace(/[^\p{L}\p{N} '-]/gu, ' '), 'any', 80) : Promise.resolve([]))
      : Promise.all([countryFoods(from), myFoods()]).then(([a, b]) => [...b, ...a])
    p.then((list) => { if (live) setFoods(list) }, (e) => { if (live) { setErr(e.message); setFoods([]) } })
    return () => { live = false }
  }, [open, from, from === 'any' ? q : ''])

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase()
    return (foods ?? [])
      .filter((f) => allMeals || f.meals.includes(meal))
      .filter((f) => !words || f.name.toLowerCase().includes(words) || f.ingredients.some((i) => i.toLowerCase().includes(words)))
      .map((f) => ({ f, why: unsuitable(f, profile) }))
      .filter((x) => !suitsOnly || !x.why)
  }, [foods, q, meal, allMeals, suitsOnly, profile])

  return (
    <Modal open={open} title={`Choose ${MEAL_LABEL[meal].toLowerCase()}`} onClose={onClose} wide>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_14rem]">
        <label className="relative block">
          <span className="sr-only">Search foods</span>
          <Icon.search className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={from === 'any' ? 'Type at least 2 letters…' : 'Search dishes or ingredients'} autoFocus />
        </label>
        <label>
          <span className="sr-only">Where from</span>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {country && <option value={country}>{flag(country)} {ALL_COUNTRIES.find((c) => c.code === country)?.name} dishes</option>}
            <option value="mine">⭐ My own foods</option>
            <option value="any">🌍 Search every country</option>
            <optgroup label="Another country">
              {ALL_COUNTRIES.filter((c) => c.code !== country).map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name}</option>)}
            </optgroup>
          </select>
        </label>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <button type="button" className={`chip ${suitsOnly ? 'chip-on' : 'chip-off'}`} aria-pressed={suitsOnly} onClick={() => setSuitsOnly(!suitsOnly)}>Only foods that suit me</button>
        <button type="button" className={`chip ${allMeals ? 'chip-on' : 'chip-off'}`} aria-pressed={allMeals} onClick={() => setAllMeals(!allMeals)}>Show all meal types</button>
      </div>
      {err && <Alert>{err}</Alert>}
      {foods === null ? <Spinner /> : shown.length === 0 ? (
        <div className="py-8 text-center text-slate-600">
          <p>{from === 'any' && q.trim().length < 2 ? 'Type the name of a dish to search every country.' : 'No dishes found here.'}</p>
          <button type="button" className="btn btn-ghost mt-3" onClick={onAddOwn}><Icon.plus /> Add your own food</button>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.slice(0, 120).map(({ f, why }) => (
            <li key={f.id}>
              <button type="button" disabled={!!why} onClick={() => onPick(f)}
                className="w-full rounded-2xl border border-slate-200 p-3 text-left transition hover:border-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{f.owner_id ? '⭐ ' : ''}{f.name}</span>
                  <span className="shrink-0 text-sm text-slate-600">{kcal(f.kcal)}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{f.serving}{f.country_code && from !== f.country_code ? ` · ${flag(f.country_code)}` : ''}</div>
                {why ? <div className="mt-1 text-xs font-medium text-red-700">{why}</div> : <div className="mt-1.5"><Tags food={f} max={3} /></div>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">Can't find it? <button type="button" className="font-semibold text-brand-700 underline" onClick={onAddOwn}>Add your own food</button></p>
    </Modal>
  )
}
