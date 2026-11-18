// CDM Food planner rules: what a person can eat, how a week is filled, and the totals and shopping list.
// Pure functions, no network, so they are unit tested (planner.test.ts).

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

export type Food = {
  id: string; country_code: string | null; name: string; description?: string | null; meals: Meal[]; serving?: string | null
  kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fibre_g: number | null
  tags: string[]; ingredients: string[]; cost_level?: number | null; prep_minutes?: number | null
  source?: 'cdm' | 'ai' | 'user'; owner_id?: string | null
}
export type Diet = 'none' | 'vegetarian' | 'vegan' | 'pescatarian' | 'halal' | 'no_pork'
export type Allergy = 'nuts' | 'dairy' | 'gluten' | 'egg' | 'fish' | 'shellfish' | 'soy' | 'sesame'
export type Goal = 'lose_weight' | 'gain_weight' | 'muscle' | 'diabetes' | 'blood_pressure' | 'cholesterol' | 'pregnancy' | 'heart' | 'kidney' | 'budget'
export type Profile = { diet: Diet; allergies: Allergy[]; goals: Goal[]; daily_kcal: number | null; meals: Meal[]; household: number }
export type PlanItem = { id?: string; day: string; meal: Meal; food_id: string; servings: number; position: number; locked: boolean }

export const DIETS: { id: Diet; label: string }[] = [
  { id: 'none', label: 'I eat everything' }, { id: 'vegetarian', label: 'Vegetarian' }, { id: 'vegan', label: 'Vegan' },
  { id: 'pescatarian', label: 'Pescatarian (fish, no meat)' }, { id: 'halal', label: 'Halal (no pork or alcohol)' }, { id: 'no_pork', label: 'No pork' },
]
export const ALLERGIES: { id: Allergy; label: string }[] = [
  { id: 'nuts', label: 'Nuts and groundnuts' }, { id: 'dairy', label: 'Milk and dairy' }, { id: 'gluten', label: 'Gluten (wheat)' },
  { id: 'egg', label: 'Egg' }, { id: 'fish', label: 'Fish' }, { id: 'shellfish', label: 'Shellfish' }, { id: 'soy', label: 'Soy' }, { id: 'sesame', label: 'Sesame' },
]
export const GOALS: { id: Goal; label: string }[] = [
  { id: 'lose_weight', label: 'Lose weight' }, { id: 'gain_weight', label: 'Gain weight' }, { id: 'muscle', label: 'Build muscle' },
  { id: 'diabetes', label: 'Blood sugar (diabetes)' }, { id: 'blood_pressure', label: 'Blood pressure' }, { id: 'cholesterol', label: 'Cholesterol' },
  { id: 'heart', label: 'Heart health' }, { id: 'kidney', label: 'Kidney care' }, { id: 'pregnancy', label: 'Pregnancy' }, { id: 'budget', label: 'Save money' },
]
export const TAG_LABEL: Record<string, string> = {
  meat: 'Meat', poultry: 'Poultry', fish: 'Fish', shellfish: 'Shellfish', pork: 'Pork', dairy: 'Dairy', egg: 'Egg', nuts: 'Nuts', gluten: 'Gluten',
  soy: 'Soy', sesame: 'Sesame', alcohol: 'Alcohol', high_protein: 'High protein', high_fibre: 'High fibre', low_carb: 'Low carb', low_gi: 'Slow-release carbs',
  whole_grain: 'Whole grain', light: 'Light', fried: 'Fried', sugary: 'Sweet', high_salt: 'Salty', spicy: 'Spicy',
}

const DIET_EXCLUDES: Record<Diet, string[]> = {
  none: [], vegetarian: ['meat', 'poultry', 'fish', 'shellfish', 'pork'], vegan: ['meat', 'poultry', 'fish', 'shellfish', 'pork', 'dairy', 'egg'],
  pescatarian: ['meat', 'poultry', 'pork'], halal: ['pork', 'alcohol'], no_pork: ['pork'],
}

/** Why a food does not suit this person ('' when it does). Diet and allergies are hard rules. */
export function unsuitable(food: Food, p: Pick<Profile, 'diet' | 'allergies'>): string {
  const tags = new Set(food.tags)
  const d = DIET_EXCLUDES[p.diet]?.find((t) => tags.has(t))
  if (d) return `Not ${DIETS.find((x) => x.id === p.diet)?.label.toLowerCase().split(' (')[0]} (${TAG_LABEL[d].toLowerCase()})`
  const a = p.allergies.find((t) => tags.has(t))
  if (a) return `Contains ${TAG_LABEL[a].toLowerCase()}`
  return ''
}

export const isVegetarian = (f: Food) => !['meat', 'poultry', 'fish', 'shellfish', 'pork'].some((t) => f.tags.includes(t))
export const isVegan = (f: Food) => isVegetarian(f) && !f.tags.includes('dairy') && !f.tags.includes('egg')

/** Daily calories to aim for: the person's own figure, or a sensible default for their goals. */
export function dailyTarget(p: Pick<Profile, 'daily_kcal' | 'goals'>): number {
  if (p.daily_kcal && p.daily_kcal >= 800) return p.daily_kcal
  if (p.goals.includes('lose_weight')) return 1700
  if (p.goals.includes('gain_weight')) return 2600
  if (p.goals.includes('muscle')) return 2400
  if (p.goals.includes('pregnancy')) return 2200
  return 2000
}

const SHARE: Record<Meal, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 }
/** Calories to aim for at each chosen meal, sharing the day's target. */
export function mealTargets(meals: Meal[], daily: number): Record<Meal, number> {
  const total = meals.reduce((n, m) => n + SHARE[m], 0) || 1
  const out = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
  for (const m of meals) out[m] = Math.round((daily * SHARE[m]) / total)
  return out
}

/** How well a food fits a meal and the person's goals (higher is better). */
export function score(f: Food, p: Pick<Profile, 'goals'>, target: number): number {
  const t = new Set(f.tags)
  let s = 0
  if (f.kcal && target) s -= Math.abs(f.kcal - target) / Math.max(target, 1) * 4
  const g = new Set(p.goals)
  const has = (x: string) => t.has(x)
  if (g.has('diabetes')) s += (has('low_gi') ? 2 : 0) + (has('high_fibre') ? 1.5 : 0) + (has('whole_grain') ? 1 : 0) - (has('sugary') ? 4 : 0) - (has('fried') ? 0.5 : 0)
  if (g.has('blood_pressure')) s += -(has('high_salt') ? 4 : 0) - (has('fried') ? 1 : 0) + (has('high_fibre') ? 1 : 0) + (has('light') ? 1 : 0)
  if (g.has('cholesterol') || g.has('heart')) s += -(has('fried') ? 2.5 : 0) - (has('pork') ? 1 : 0) + (has('fish') ? 1.5 : 0) + (has('high_fibre') ? 1.5 : 0) + (has('whole_grain') ? 1 : 0)
  if (g.has('kidney')) s += -(has('high_salt') ? 3 : 0) - (has('high_protein') ? 1 : 0)
  if (g.has('lose_weight')) s += (has('light') ? 1.5 : 0) + (has('high_fibre') ? 1 : 0) + (has('high_protein') ? 1 : 0) - (has('fried') ? 2 : 0) - (has('sugary') ? 2 : 0)
  if (g.has('gain_weight')) s += (f.kcal ?? 0) > 600 ? 1 : 0
  if (g.has('muscle')) s += has('high_protein') ? 2.5 : 0
  if (g.has('pregnancy')) s += (has('high_fibre') ? 1 : 0) + (has('high_protein') ? 1 : 0) - (has('alcohol') ? 10 : 0)
  if (g.has('budget')) s += f.cost_level === 1 ? 1.5 : f.cost_level === 3 ? -1.5 : 0
  return s
}

/** Small seeded random numbers, so "Fill my week" is repeatable in tests. */
export function rng(seed: number) {
  let x = (seed >>> 0) || 1
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000 }
}

const half = (n: number) => Math.round(n * 2) / 2

/** Fills the empty meals of the given days. Locked foods stay; the same food is not repeated within 2 days.
 *  Returns only the new items to add. */
export function fillWeek(days: string[], meals: Meal[], foods: Food[], p: Profile, existing: PlanItem[], seed = 1): PlanItem[] {
  const rand = rng(seed)
  const ok = foods.filter((f) => !unsuitable(f, p))
  const targets = mealTargets(meals, dailyTarget(p))
  const used = new Map<string, number>() // food id -> last day index used
  existing.forEach((i) => used.set(i.food_id, Math.max(used.get(i.food_id) ?? -9, days.indexOf(i.day))))
  const out: PlanItem[] = []
  days.forEach((day, di) => {
    const today = new Set(existing.filter((i) => i.day === day).map((i) => i.food_id))
    for (const meal of meals) {
      if (existing.some((i) => i.day === day && i.meal === meal)) continue
      const target = targets[meal]
      const cands = ok.filter((f) => f.meals.includes(meal) && !today.has(f.id) && di - (used.get(f.id) ?? -9) > 2)
      const pool = cands.length ? cands : ok.filter((f) => f.meals.includes(meal) && !today.has(f.id))
      if (!pool.length) continue
      const ranked = pool.map((f) => ({ f, s: score(f, p, target) + rand() * 1.5 })).sort((a, b) => b.s - a.s)
      const pick = ranked[Math.floor(rand() * Math.min(3, ranked.length))].f
      const servings = pick.kcal ? Math.min(2, Math.max(0.5, half(target / pick.kcal))) : 1
      out.push({ day, meal, food_id: pick.id, servings, position: 0, locked: false })
      today.add(pick.id)
      used.set(pick.id, di)
    }
  })
  return out
}

export type Totals = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number; unknown: number }
/** Nutrition for a set of plan items (foods without figures are counted in `unknown`). */
export function totals(items: PlanItem[], foods: Map<string, Food>): Totals {
  const t: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0, unknown: 0 }
  for (const i of items) {
    const f = foods.get(i.food_id)
    if (!f || f.kcal == null) { t.unknown++; continue }
    t.kcal += f.kcal * i.servings
    t.protein_g += (f.protein_g ?? 0) * i.servings
    t.carbs_g += (f.carbs_g ?? 0) * i.servings
    t.fat_g += (f.fat_g ?? 0) * i.servings
    t.fibre_g += (f.fibre_g ?? 0) * i.servings
  }
  for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'] as const) t[k] = Math.round(t[k])
  return t
}

/** Ingredients to buy for the plan: each ingredient with the meals it is for, for the whole household. */
export function shoppingList(items: PlanItem[], foods: Map<string, Food>, household = 1) {
  const map = new Map<string, { item: string; portions: number; meals: number; dishes: Set<string> }>()
  for (const i of items) {
    const f = foods.get(i.food_id)
    if (!f) continue
    for (const raw of f.ingredients) {
      const key = raw.trim().toLowerCase()
      if (!key) continue
      const e = map.get(key) ?? { item: raw.trim(), portions: 0, meals: 0, dishes: new Set<string>() }
      e.portions += i.servings * Math.max(1, household)
      e.meals += 1
      e.dishes.add(f.name)
      map.set(key, e)
    }
  }
  return [...map.values()]
    .map((e) => ({ item: e.item, portions: half(e.portions), meals: e.meals, dishes: [...e.dishes] }))
    .sort((a, b) => b.meals - a.meals || a.item.localeCompare(b.item))
}

/** The Monday of the week that contains `d` (local date). */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function weekDays(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
}
export function dayLabel(isoDay: string, locale?: string): string {
  const [y, m, d] = isoDay.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Search words that are safe inside a PostgREST filter. */
export const searchWords = (raw: unknown) => String(raw ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
