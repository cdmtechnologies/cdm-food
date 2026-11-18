import { useEffect, useMemo, useState } from 'react'
import { Alert, Icon, Spinner } from '../components/ui'
import { foodsByIds, planRange, type ProfileRow } from '../lib/api'
import { dayLabel, shoppingList, weekDays, type Food, type PlanItem } from '../lib/planner'

/** The week's ingredients for the whole household (Premium). Ticks are kept on this device. */
export default function Shopping({ profile, premium, start, onUpgrade }: { profile: ProfileRow; premium: boolean; start: Date; onUpgrade: () => void }) {
  const days = useMemo(() => weekDays(start), [start])
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [foods, setFoods] = useState<Map<string, Food>>(new Map())
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const key = 'cdmfood:ticks:' + days[0]
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  useEffect(() => { try { setTicks(JSON.parse(localStorage.getItem(key) || '{}')) } catch { setTicks({}) } }, [key])
  const tick = (k: string) => setTicks((t) => { const n = { ...t, [k]: !t[k] }; try { localStorage.setItem(key, JSON.stringify(n)) } catch { /* blocked */ } return n })

  useEffect(() => {
    setItems(null)
    planRange(days[0], days[6]).then(async (list) => {
      const fs = await foodsByIds(list.map((i) => i.food_id))
      setFoods(new Map(fs.map((f) => [f.id, f])))
      setItems(list)
    }, (e) => { setErr(e.message); setItems([]) })
  }, [days])

  const list = useMemo(() => (items ? shoppingList(items, foods, profile.household) : []), [items, foods, profile.household])
  const visible = premium ? list : list.slice(0, 5)
  const asText = () => `Shopping list, ${dayLabel(days[0])} to ${dayLabel(days[6])} (${profile.household} ${profile.household === 1 ? 'person' : 'people'})\n` +
    list.map((x) => `- ${x.item} (${x.meals} meal${x.meals === 1 ? '' : 's'})`).join('\n') + '\n\nMade with CDM Food'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Shopping list</h1>
          <p className="text-sm text-slate-600">{dayLabel(days[0])} to {dayLabel(days[6])} · for {profile.household} {profile.household === 1 ? 'person' : 'people'} · from the plan for that week</p>
        </div>
        {premium && list.length > 0 && (
          <div className="no-print flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(asText()); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setErr('Could not copy. Select the list and copy it instead.') } }}><Icon.copy /> {copied ? 'Copied' : 'Copy'}</button>
            <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(asText())}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}><Icon.print /> Print</button>
          </div>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      {items === null ? <Spinner /> : list.length === 0 ? (
        <div className="card p-6 text-center text-slate-600">Plan some meals for this week first, then your shopping list appears here.</div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {visible.map((x) => {
            const k = x.item.toLowerCase()
            return (
              <label key={k} className="flex cursor-pointer items-start gap-3 px-4 py-3">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-700" checked={!!ticks[k]} onChange={() => tick(k)} />
                <span className={`flex-1 ${ticks[k] ? 'text-slate-400 line-through' : ''}`}>
                  <span className="font-semibold">{x.item}</span>
                  <span className="block text-xs text-slate-500">In {x.meals} meal{x.meals === 1 ? '' : 's'}: {x.dishes.slice(0, 4).join(', ')}{x.dishes.length > 4 ? ` and ${x.dishes.length - 4} more` : ''}</span>
                </span>
              </label>
            )
          })}
          {!premium && (
            <div className="space-y-2 bg-amber-50 px-4 py-5 text-center">
              <p className="font-semibold">See all {list.length} items with Premium</p>
              <p className="text-sm text-slate-600">Premium gives you the full shopping list for your household, more Ask AI help every day, and supports CDM Food.</p>
              <button type="button" className="btn btn-spice" onClick={onUpgrade}><Icon.star /> Go Premium</button>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500">Buy enough for {profile.household} {profile.household === 1 ? 'person' : 'people'} for each meal listed. Check your recipes for exact amounts.</p>
    </div>
  )
}
