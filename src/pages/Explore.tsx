import { useEffect, useMemo, useState } from 'react'
import { CountrySelect } from '../components/PrefsForm'
import { Alert, cost, Icon, kcal, Modal, Spinner, Tags } from '../components/ui'
import { addPlanItems, cachedAt, openRecipe, countries, countryFoods, countryName, flag, loadCountryMenu, type Country, type ProfileRow } from '../lib/api'
import { dayLabel, isVegan, isVegetarian, iso, MEAL_LABEL, MEALS, unsuitable, weekDays, type Food, type Meal } from '../lib/planner'

type Filter = Meal | 'all' | 'veg' | 'vegan' | 'suits' | 'high_protein' | 'high_fibre' | 'light' | 'low_gi'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, ...MEALS.map((m) => ({ id: m as Filter, label: MEAL_LABEL[m] })),
  { id: 'suits', label: 'Suits me' }, { id: 'veg', label: 'Vegetarian' }, { id: 'vegan', label: 'Vegan' },
  { id: 'high_protein', label: 'High protein' }, { id: 'high_fibre', label: 'High fibre' }, { id: 'low_gi', label: 'Slow-release carbs' }, { id: 'light', label: 'Light' },
]

export default function Explore({ profile, weekStartDate, onPlanned }: { profile: ProfileRow; weekStartDate: Date; onPlanned: () => void }) {
  const [code, setCode] = useState(profile.country_code ?? 'NG')
  const [info, setInfo] = useState<Country | null>(null)
  const [foods, setFoods] = useState<Food[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [making, setMaking] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [open, setOpen] = useState<Food | null>(null)
  const [, tick] = useState(0)

  async function load(sync = false) {
    setErr('')
    try {
      const [list, all] = await Promise.all([countryFoods(code, sync), countries()])
      const c = all.find((x) => x.code === code) ?? null
      setInfo(c)
      setFoods(list)
      return list
    } catch (e) { setErr((e as Error).message); setFoods([]); return [] }
  }

  async function makeMenu() {
    setMaking(true); setErr('')
    try {
      const r = await loadCountryMenu(code)
      if (r.status === 'generating') setErr('This menu is being prepared right now. Try again in a minute.')
      await load(true)
    } catch (e) { setErr((e as Error).message) }
    setMaking(false)
  }

  useEffect(() => {
    let live = true
    setFoods(null); setFilter('all'); setQ('')
    load().then((list) => { if (live && list.length < 12) makeMenu() })
    return () => { live = false }
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase()
    return (foods ?? []).filter((f) => {
      if (words && !f.name.toLowerCase().includes(words) && !f.ingredients.some((i) => i.toLowerCase().includes(words))) return false
      if ((MEALS as string[]).includes(filter)) return f.meals.includes(filter as Meal)
      if (filter === 'veg') return isVegetarian(f)
      if (filter === 'vegan') return isVegan(f)
      if (filter === 'suits') return !unsuitable(f, profile)
      if (filter !== 'all') return f.tags.includes(filter)
      return true
    })
  }, [foods, filter, q, profile])

  const synced = cachedAt('menu:' + code)
  const anyAi = (foods ?? []).some((f) => f.source === 'ai')

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="ex-country">Explore a country's dishes</label>
          <CountrySelect id="ex-country" value={code} onChange={setCode} />
        </div>
        <button type="button" className="btn btn-ghost" disabled={syncing} onClick={async () => { setSyncing(true); await load(true); setSyncing(false); tick((n) => n + 1) }}>
          <Icon.sync className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync menu'}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {flag(code)} {countryName(code)}{info?.foods != null ? ` · ${info.foods} dishes` : ''}{synced ? ` · saved on this device ${new Date(synced).toLocaleString()}` : ''}
        {anyAi ? ' · some dishes and figures were prepared by AI and are estimates' : ''}
      </p>
      {err && <Alert>{err}</Alert>}

      {making && (
        <div className="card flex items-center gap-3 p-4">
          <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
          <div><div className="font-semibold">Preparing the {countryName(code)} menu…</div><div className="text-sm text-slate-600">Our AI is listing popular dishes with their nutrition. This takes up to a minute, and only happens once for each country.</div></div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter dishes">
        {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} className={`chip shrink-0 ${filter === f.id ? 'chip-on' : 'chip-off'}`} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      <label className="relative block max-w-md">
        <span className="sr-only">Search dishes</span>
        <Icon.search className="pointer-events-none absolute left-3 top-3 text-slate-400" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes or ingredients" />
      </label>

      {foods === null ? <Spinner label="Loading the menu…" /> : shown.length === 0 ? (
        <div className="card p-6 text-center text-slate-600">
          {foods.length === 0 && !making ? (
            <>
              <p>This country's menu is not ready yet.</p>
              <button type="button" className="btn btn-primary mt-3" onClick={makeMenu}><Icon.sparkle /> Prepare the menu with AI</button>
            </>
          ) : <p>No dishes match these filters.</p>}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((f) => {
            const why = unsuitable(f, profile)
            return (
              <li key={f.id}>
                <button type="button" onClick={() => setOpen(f)} className="card h-full w-full p-4 text-left transition hover:border-brand-600 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2"><span className="font-semibold">{f.name}</span><span className="shrink-0 text-sm text-slate-600">{kcal(f.kcal)}</span></div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{f.description}</p>
                  <div className="mt-2 text-xs text-slate-500">{f.meals.map((m) => MEAL_LABEL[m]).join(' · ')}{f.cost_level ? ` · ${cost(f.cost_level)}` : ''}</div>
                  {why ? <div className="mt-2 text-xs font-medium text-red-700">{why}</div> : <div className="mt-2"><Tags food={f} max={3} /></div>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {foods && foods.length > 0 && foods.length < 12 && !making && (
        <div className="text-center"><button type="button" className="btn btn-ghost" onClick={makeMenu}><Icon.sparkle /> Add more {countryName(code)} dishes with AI</button></div>
      )}

      <FoodDetail food={open} profile={profile} weekStartDate={weekStartDate} onClose={() => setOpen(null)} onPlanned={onPlanned} />
    </div>
  )
}

export function FoodDetail({ food, profile, weekStartDate, onClose, onPlanned }: { food: Food | null; profile: ProfileRow; weekStartDate: Date; onClose: () => void; onPlanned: () => void }) {
  const days = weekDays(weekStartDate)
  const [day, setDay] = useState(days[0])
  const [meal, setMeal] = useState<Meal>('lunch')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { if (food) { setMsg(null); setMeal(food.meals[0] ?? 'lunch'); setDay(days.includes(iso(new Date())) ? iso(new Date()) : days[0]) } }, [food]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!food) return null
  const why = unsuitable(food, profile)
  async function add() {
    setBusy(true); setMsg(null)
    try {
      await addPlanItems([{ day, meal, food_id: food!.id, servings: 1, position: 9, locked: false }])
      setMsg({ tone: 'ok', text: `Added to ${MEAL_LABEL[meal].toLowerCase()} on ${dayLabel(day)}.` })
      onPlanned()
    } catch (e) { setMsg({ tone: 'error', text: (e as Error).message }) }
    setBusy(false)
  }
  const n = (v: number | null, u: string) => (v == null ? '–' : `${v}${u}`)
  return (
    <Modal open title={food.name} onClose={onClose}>
      <div className="space-y-4">
        {food.description && <p className="text-slate-700">{food.description}</p>}
        <div className="grid grid-cols-5 gap-2 rounded-2xl bg-brand-50 p-3 text-center text-sm">
          <div><div className="text-xs text-slate-500">Calories</div><b>{n(food.kcal, '')}</b></div>
          <div><div className="text-xs text-slate-500">Protein</div><b>{n(food.protein_g, ' g')}</b></div>
          <div><div className="text-xs text-slate-500">Carbs</div><b>{n(food.carbs_g, ' g')}</b></div>
          <div><div className="text-xs text-slate-500">Fat</div><b>{n(food.fat_g, ' g')}</b></div>
          <div><div className="text-xs text-slate-500">Fibre</div><b>{n(food.fibre_g, ' g')}</b></div>
        </div>
        <p className="text-xs text-slate-500">For one serving: {food.serving ?? 'one portion'}. Approximate{food.source === 'ai' ? ', prepared by AI' : ''}.</p>
        <Tags food={food} max={10} />
        {food.ingredients.length > 0 && <div><div className="label">Main ingredients</div><p className="text-sm text-slate-700">{food.ingredients.join(', ')}</p></div>}
        <div className="text-sm text-slate-600">{food.prep_minutes ? `About ${food.prep_minutes} minutes to prepare` : ''}{food.cost_level ? ` · ${cost(food.cost_level)}` : ''}</div>
        <button type="button" className="btn btn-ghost w-full" onClick={() => { const f = food; onClose(); openRecipe(f) }}><Icon.pot /> Recipe, cooking steps and videos</button>
        {why ? <Alert>{why}. It does not suit your settings.</Alert> : (
          <div className="rounded-2xl border border-slate-200 p-3">
            <div className="label">Add to my plan</div>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day">{days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}</select>
              <select className="input" value={meal} onChange={(e) => setMeal(e.target.value as Meal)} aria-label="Meal">{MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}</select>
            </div>
            <button type="button" className="btn btn-primary mt-2 w-full" onClick={add} disabled={busy}><Icon.plus /> {busy ? 'Adding…' : 'Add to plan'}</button>
            {msg && <div className="mt-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
          </div>
        )}
      </div>
    </Modal>
  )
}
