import { useCallback, useEffect, useMemo, useState } from 'react'
import FoodForm from '../components/FoodForm'
import FoodPicker from '../components/FoodPicker'
import { Alert, Icon, kcal, Modal, Spinner } from '../components/ui'
import { addPlanItems, clearPlan, openRecipe, countryFoods, deletePlanItem, foodsByIds, myFoods, planRange, updatePlanItem, type ProfileRow } from '../lib/api'
import { dailyTarget, dayLabel, weekdayShort, eatenTotals, fillWeek, iso, isLogged, MEAL_LABEL, mealTargets, totals, weekDays, weekStart, type Food, type Meal, type MealStatus, type PlanItem } from '../lib/planner'
import { locale, t } from '../i18n'

const MEAL_ICON: Record<Meal, string> = { breakfast: '🍳', lunch: '🍲', dinner: '🍛', snack: '🍎' }

export default function Planner({ profile, start, setStart, reloadKey, onAskAi }: {
  profile: ProfileRow; start: Date; setStart: (d: Date) => void; reloadKey: number; onAskAi: (prompt?: string) => void
}) {
  const days = useMemo(() => weekDays(start), [start])
  const todayIso = iso(new Date())
  const [day, setDay] = useState(() => (days.includes(todayIso) ? todayIso : days[0]))
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [foods, setFoods] = useState<Map<string, Food>>(new Map())
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<{ meal: Meal; replace?: PlanItem; ate?: PlanItem } | null>(null)
  const [adding, setAdding] = useState<{ meal: Meal; ate?: PlanItem } | null>(null)
  const [other, setOther] = useState<PlanItem | null>(null) // "had something else"
  const target = dailyTarget(profile)
  const mealT = mealTargets(profile.meals, target)

  const load = useCallback(async () => {
    setErr('')
    try {
      const list = await planRange(days[0], days[6])
      const fs = await foodsByIds(list.map((i) => i.food_id))
      setFoods((m) => { const n = new Map(m); fs.forEach((f) => n.set(f.id, f)); return n })
      setItems(list)
    } catch (e) { setErr((e as Error).message); setItems([]) }
  }, [days])
  useEffect(() => { setItems(null); load() }, [load, reloadKey])
  useEffect(() => { if (!days.includes(day)) setDay(days.includes(todayIso) ? todayIso : days[0]) }, [days, day, todayIso])

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setErr('')
    try { await fn(); await load() } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  const mark = (it: PlanItem, status: MealStatus) => run('mark', () => updatePlanItem(it.id!, { status, ate_food_id: null, ate_servings: null, ate_note: null, ate_kcal: null }))

  const fill = () => run('fill', async () => {
    if (!profile.country_code) throw new Error(t("Choose your country in Account first."))
    const [country, mine] = await Promise.all([countryFoods(profile.country_code), myFoods()])
    if (!country.length && !mine.length) throw new Error(t("Your country's menu is not ready yet. Open Explore to load it."))
    const add = fillWeek(days, profile.meals, [...country, ...mine], profile, items ?? [], Date.now() % 100000)
    if (!add.length) throw new Error(t("Every meal this week is already planned. Clear the week first to start again."))
    await addPlanItems(add)
  })
  const clear = () => { if (window.confirm(t('Remove every meal this week, except the ones you locked or ticked?'))) run('clear', () => clearPlan(days[0], days[6])) }

  function picked(f: Food) {
    const p = pick
    setPick(null)
    if (p) place(f, p)
  }
  async function place(f: Food, p: { meal: Meal; replace?: PlanItem; ate?: PlanItem }) {
    setFoods((m) => new Map(m).set(f.id, f))
    if (p.ate?.id) await run('ate', () => updatePlanItem(p.ate!.id!, { status: 'swapped', ate_food_id: f.id, ate_servings: 1, ate_note: null, ate_kcal: null }))
    else if (p.replace?.id) await run('swap', () => updatePlanItem(p.replace!.id!, { food_id: f.id }))
    else {
      const pos = (items ?? []).filter((i) => i.day === day && i.meal === p.meal).length
      const servings = f.kcal ? Math.min(2, Math.max(0.5, Math.round((mealT[p.meal] || 500) / f.kcal * 2) / 2)) : 1
      await run('add', () => addPlanItems([{ day, meal: p.meal, food_id: f.id, servings, position: pos, locked: false }]))
    }
  }

  const dayItems = (d: string) => (items ?? []).filter((i) => i.day === d)
  const tot = totals(dayItems(day), foods)
  const eaten = eatenTotals(dayItems(day), foods)
  const canTick = day <= todayIso
  const pct = Math.min(100, Math.round((tot.kcal / target) * 100))
  const shown = new Set<Meal>([...profile.meals, ...dayItems(day).map((i) => i.meal)])
  const weekEmpty = items !== null && items.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost px-2.5" aria-label={t("Previous week")} onClick={() => setStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7))}><Icon.left /></button>
          <div className="min-w-[11rem] text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{days.includes(todayIso) ? t("This week") : t("Week of")}</div>
            <div className="font-bold">{dayLabel(days[0])} – {dayLabel(days[6])}</div>
          </div>
          <button type="button" className="btn btn-ghost px-2.5" aria-label={t("Next week")} onClick={() => setStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7))}><Icon.right /></button>
          {!days.includes(todayIso) && <button type="button" className="ml-1 text-sm font-semibold text-brand-700 underline" onClick={() => setStart(weekStart(new Date()))}>{t("Today")}</button>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={fill} disabled={!!busy}><Icon.sparkle /> {busy === 'fill' ? t("Filling…") : t("Fill my week")}</button>
          <button type="button" className="btn btn-ghost" onClick={() => onAskAi()}>{t("🤖 Ask AI to change it")}</button>
          <button type="button" className="btn btn-ghost" onClick={clear} disabled={!!busy || weekEmpty}><Icon.trash /> {t("Clear week")}</button>
        </div>
      </div>
      {err && <Alert>{err}</Alert>}

      {/* week strip: one button per day with its calories */}
      <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label={t("Days of the week")}>
        {days.map((d) => {
          const k = totals(dayItems(d), foods).kcal
          const on = d === day
          return (
            <button key={d} role="tab" aria-selected={on} type="button" onClick={() => setDay(d)}
              className={`rounded-2xl border px-1 py-2 text-center transition ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white hover:border-brand-600'}`}>
              <div className={`text-[11px] font-medium uppercase ${on ? 'text-white/80' : 'text-slate-500'}`}>{weekdayShort(d)}</div>
              <div className="text-lg font-bold leading-tight">{Number(d.slice(8))}</div>
              <div className={`mx-auto mt-1 h-1.5 w-8 overflow-hidden rounded-full ${on ? 'bg-white/30' : 'bg-slate-100'}`}>
                <div className={`h-full rounded-full ${on ? 'bg-white' : k > target * 1.15 ? 'bg-spice-500' : 'bg-brand-600'}`} style={{ width: `${Math.min(100, (k / target) * 100)}%` }} />
              </div>
              {d === todayIso && <div className={`mt-0.5 text-[10px] font-semibold ${on ? 'text-white' : 'text-brand-700'}`}>{t("Today")}</div>}
            </button>
          )
        })}
      </div>

      {items === null ? <Spinner label={t("Loading your plan…")} /> : (
        <>
          <div className="card p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-sm text-slate-500">{dayLabel(day)}</div>
                <div className="text-2xl font-bold">{tot.kcal.toLocaleString(locale())} <span className="text-base font-medium text-slate-500">{t('of {n} kcal', { n: target.toLocaleString(locale()) })}</span></div>
              </div>
              <div className="flex gap-4 text-sm">
                <div><div className="text-slate-500">{t("Protein")}</div><b>{tot.protein_g} g</b></div>
                <div><div className="text-slate-500">{t("Carbs")}</div><b>{tot.carbs_g} g</b></div>
                <div><div className="text-slate-500">{t("Fat")}</div><b>{tot.fat_g} g</b></div>
                <div><div className="text-slate-500">{t("Fibre")}</div><b>{tot.fibre_g} g</b></div>
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className={`h-full rounded-full ${tot.kcal > target * 1.15 ? 'bg-spice-500' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} />
            </div>
            {canTick && eaten.logged > 0 && (
              <p className="mt-2 text-sm text-slate-700"><b>{t('Eaten: {kcal} kcal', { kcal: eaten.kcal.toLocaleString(locale()) })}</b> · {t('{done} of {all} meals as planned', { done: eaten.followed, all: eaten.planned })}</p>
            )}
            {canTick && eaten.logged === 0 && tot.kcal > 0 && <p className="mt-2 text-xs text-slate-500">{t('Tick each meal when you have it, so you can see what you really ate.')}</p>}
            {tot.unknown > 0 && <p className="mt-2 text-xs text-slate-500">{t('Foods without nutrition figures: {n}. The real total is higher.', { n: tot.unknown })}</p>}
          </div>

          {weekEmpty && (
            <div className="card flex flex-col items-center gap-2 p-6 text-center">
              <div className="text-4xl">🗓️</div>
              <p className="font-semibold">{t("Your week is empty")}</p>
              <p className="max-w-md text-sm text-slate-600">{t('Tap "Fill my week" to plan every meal from your country\'s dishes, matched to your diet and goals. Then swap anything you don\'t fancy.')}</p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {[...shown].sort((a, b) => ['breakfast', 'lunch', 'dinner', 'snack'].indexOf(a) - ['breakfast', 'lunch', 'dinner', 'snack'].indexOf(b)).map((meal) => {
              const list = dayItems(day).filter((i) => i.meal === meal)
              const mk = totals(list, foods).kcal
              return (
                <section key={meal} className="card p-4" aria-label={t(MEAL_LABEL[meal])}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-bold">{MEAL_ICON[meal]} {t(MEAL_LABEL[meal])}</h3>
                    <span className="text-sm text-slate-500">{[mk ? kcal(mk) : '', mealT[meal] ? t('aim {n}', { n: mealT[meal] }) : ''].filter(Boolean).join(' · ')}</span>
                  </div>
                  {list.length === 0 && <p className="mb-2 text-sm text-slate-500">{t("Nothing planned.")}</p>}
                  <ul className="space-y-2">
                    {list.map((it) => {
                      const f = foods.get(it.food_id)
                      return (
                        <li key={it.id} className={`rounded-xl border p-3 ${it.status === 'eaten' ? 'border-brand-200 bg-brand-50' : it.status === 'skipped' ? 'border-slate-200 bg-white opacity-75' : it.status === 'swapped' ? 'border-spice-500/40 bg-spice-50' : it.locked ? 'border-brand-200 bg-brand-50' : 'border-slate-100 bg-slate-50'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className={`font-semibold ${it.status === 'skipped' || it.status === 'swapped' ? 'text-slate-500 line-through' : ''}`}>{f?.owner_id ? '⭐ ' : ''}{f?.name ?? t('Food')}</div>
                              <div className="text-xs text-slate-500">{f?.serving}{f?.kcal != null ? ` · ${kcal(f.kcal * it.servings)}` : ''}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label={t("Fewer servings of {v0}", { v0: f?.name ?? '' })} disabled={it.servings <= 0.5 || !!busy}
                                onClick={() => run('serv', () => updatePlanItem(it.id!, { servings: Math.max(0.5, it.servings - 0.5) }))}><Icon.minus /></button>
                              <span className="w-8 text-center text-sm font-semibold" aria-label={t("{v0} servings", { v0: it.servings })}>×{it.servings}</span>
                              <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label={t("More servings of {v0}", { v0: f?.name ?? '' })} disabled={it.servings >= 4 || !!busy}
                                onClick={() => run('serv', () => updatePlanItem(it.id!, { servings: Math.min(4, it.servings + 0.5) }))}><Icon.plus /></button>
                            </div>
                          </div>
                          {isLogged(it) && <Logged it={it} foods={foods} />}
                          {canTick && (
                            <div className="mt-2 flex flex-wrap gap-1.5 text-xs" role="group" aria-label={t('What happened at this meal?')}>
                              <button type="button" aria-pressed={it.status === 'eaten'} className={`chip py-0.5 ${it.status === 'eaten' ? 'chip-on' : 'chip-off'}`} disabled={!!busy} onClick={() => mark(it, it.status === 'eaten' ? 'planned' : 'eaten')}><Icon.check className="h-3.5 w-3.5" /> {t('Eaten')}</button>
                              <button type="button" aria-pressed={it.status === 'skipped'} className={`chip py-0.5 ${it.status === 'skipped' ? 'chip-on' : 'chip-off'}`} disabled={!!busy} onClick={() => mark(it, it.status === 'skipped' ? 'planned' : 'skipped')}><Icon.x className="h-3.5 w-3.5" /> {t('Skipped')}</button>
                              <button type="button" aria-pressed={it.status === 'swapped'} className={`chip py-0.5 ${it.status === 'swapped' ? 'chip-on' : 'chip-off'}`} disabled={!!busy} onClick={() => setOther(it)}><Icon.swap className="h-3.5 w-3.5" /> {t('Had something else')}</button>
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                            {f && <button type="button" className="chip chip-off py-0.5 text-brand-800" onClick={() => openRecipe(f)}><Icon.pot className="h-3.5 w-3.5" /> {t("Recipe")}</button>}
                            <button type="button" className="chip chip-off py-0.5" onClick={() => setPick({ meal, replace: it })} disabled={it.locked || isLogged(it)}><Icon.swap className="h-3.5 w-3.5" /> {t("Swap")}</button>
                            <button type="button" className={`chip py-0.5 ${it.locked ? 'chip-on' : 'chip-off'}`} aria-pressed={it.locked} onClick={() => run('lock', () => updatePlanItem(it.id!, { locked: !it.locked }))}
                              title={t("Locked meals stay when you fill or clear the week, and Ask AI leaves them alone")}>{it.locked ? <Icon.lock className="h-3.5 w-3.5" /> : <Icon.unlock className="h-3.5 w-3.5" />} {it.locked ? t("Locked") : t("Lock")}</button>
                            <button type="button" className="chip chip-off py-0.5 text-red-700" onClick={() => run('del', () => deletePlanItem(it.id!))}><Icon.trash className="h-3.5 w-3.5" /> {t("Remove")}</button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <button type="button" className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-semibold text-brand-700 hover:border-brand-600 hover:bg-brand-50" onClick={() => setPick({ meal })}>
                    <Icon.plus /> {t('Add to {meal}', { meal: t(MEAL_LABEL[meal]).toLowerCase() })}
                  </button>
                </section>
              )
            })}
          </div>
          <p className="text-center text-xs text-slate-500">{t("Calories and nutrients are approximate. CDM Food is not medical advice.")}</p>
        </>
      )}

      <FoodPicker open={!!pick} meal={pick?.meal ?? 'lunch'} profile={profile} country={profile.country_code} onPick={picked} onClose={() => setPick(null)}
        onAddOwn={() => { setAdding({ meal: pick?.meal ?? 'lunch', ate: pick?.ate }); setPick(null) }} />
      <Modal open={!!adding} title={t('Add your own food')} onClose={() => setAdding(null)} wide>
        {adding && <FoodForm country={profile.country_code} meal={adding.meal} onCancel={() => setAdding(null)} onSaved={(f) => { const a = adding; setAdding(null); place(f, a) }} />}
      </Modal>
      <AteOther item={other} food={other ? foods.get(other.food_id) : undefined} onClose={() => setOther(null)}
        onPickFood={(it) => { setOther(null); setPick({ meal: it.meal, ate: it }) }}
        onSave={(it, note, kc) => { setOther(null); run('ate', () => updatePlanItem(it.id!, { status: 'swapped', ate_food_id: null, ate_servings: null, ate_note: note, ate_kcal: kc })) }} />
    </div>
  )
}

/** Shows what really happened at a ticked meal. */
function Logged({ it, foods }: { it: PlanItem; foods: Map<string, Food> }) {
  if (it.status === 'eaten') return <p className="mt-1 text-xs font-semibold text-brand-800">✓ {t('Eaten as planned')}</p>
  if (it.status === 'skipped') return <p className="mt-1 text-xs font-semibold text-slate-500">{t('Skipped')}</p>
  const other = it.ate_food_id ? foods.get(it.ate_food_id) : null
  const what = other ? other.name : it.ate_note ?? ''
  const kc = other?.kcal != null ? Math.round(other.kcal * (it.ate_servings ?? 1)) : it.ate_kcal
  return <p className="mt-1 text-xs font-semibold text-spice-600">⇄ {t('Had instead: {food}', { food: what })}{kc != null ? ` · ${kcal(kc)}` : ''}</p>
}

/** "Had something else": pick a food from the catalogue, or just type what it was. */
function AteOther({ item, food, onClose, onPickFood, onSave }: {
  item: PlanItem | null; food?: Food; onClose: () => void; onPickFood: (it: PlanItem) => void; onSave: (it: PlanItem, note: string, kcal: number | null) => void
}) {
  const [note, setNote] = useState('')
  const [kc, setKc] = useState('')
  useEffect(() => { setNote(item?.ate_note ?? ''); setKc(item?.ate_kcal != null ? String(item.ate_kcal) : '') }, [item])
  if (!item) return null
  const save = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (!note.trim()) return
    const n = kc.trim() ? Math.round(Number(kc)) : null
    onSave(item, note.trim().slice(0, 200), n != null && n >= 0 && n <= 5000 ? n : null)
  }
  return (
    <Modal open title={t('What did you have instead?')} onClose={onClose}>
      <div className="space-y-4">
        {food && <p className="text-sm text-slate-600">{t('Planned: {food}', { food: food.name })}</p>}
        <button type="button" className="btn btn-primary w-full" onClick={() => onPickFood(item)}><Icon.search /> {t('Choose a food from the menu')}</button>
        <div className="flex items-center gap-2 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t('or')}<span className="h-px flex-1 bg-slate-200" /></div>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm font-semibold">{t('Type what you had')}
            <input className="input mt-1" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. Bread and tea at the office')} />
          </label>
          <label className="block text-sm font-semibold">{t('Calories, if you know them (optional)')}
            <input className="input mt-1" type="number" inputMode="numeric" min={0} max={5000} value={kc} onChange={(e) => setKc(e.target.value)} placeholder="350" />
          </label>
          <button className="btn btn-ghost w-full" disabled={!note.trim()}><Icon.check /> {t('Save')}</button>
        </form>
      </div>
    </Modal>
  )
}
