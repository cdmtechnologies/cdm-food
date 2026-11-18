// Pure helpers for the CDM Food "food-ai" function (no Deno or network calls, so they can be unit tested).

export type Msg = { role: 'user' | 'assistant'; content: string }
export const MAX_TURNS = 14
export const MAX_CHARS = 2000

export function cleanHistory(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return []
  const out: Msg[] = []
  for (const m of raw.slice(-MAX_TURNS * 2)) {
    if (!m || typeof m !== 'object') continue
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue
    const text = content.split('\u0000').join('').trim().slice(0, role === 'user' ? MAX_CHARS : 6000)
    if (!text) continue
    if (out.length && out[out.length - 1].role === role) out[out.length - 1] = { role, content: text }
    else out.push({ role, content: text })
  }
  const kept = out.slice(-MAX_TURNS)
  while (kept.length && kept[0].role !== 'user') kept.shift()
  return kept.length && kept[kept.length - 1].role === 'user' ? kept : []
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const isDay = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v))
export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** A day range of at most `max` days, from..to inclusive. */
export function dayRange(from: unknown, to: unknown, fallback: string, max = 14): string[] {
  let f = isDay(from) ? from : fallback
  let t = isDay(to) ? to : f
  if (t < f) [f, t] = [t, f]
  const out: string[] = []
  for (let d = f; d <= t && out.length < max; d = addDays(d, 1)) out.push(d)
  return out
}

const TAGS = new Set('meat poultry fish shellfish pork dairy egg nuts gluten soy sesame alcohol high_protein high_fibre low_carb low_gi whole_grain light fried sugary high_salt spicy'.split(' '))
const MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snack'])
const num = (v: unknown, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null }
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

export type NewFood = {
  name: string; description: string | null; meals: ('breakfast' | 'lunch' | 'dinner' | 'snack')[]; serving: string | null
  kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fibre_g: number | null
  tags: string[]; ingredients: string[]; cost_level: number | null; prep_minutes: number | null; country_code: string | null
}

/** Checks a food from the AI (a new private food, or a catalogue dish) before it is saved. */
export function cleanFood(raw: unknown): { food?: NewFood; error?: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = str(r.name, 120)
  if (!name) return { error: 'A food needs a name.' }
  const meals = (Array.isArray(r.meals) ? r.meals : []).filter((m): m is 'breakfast' | 'lunch' | 'dinner' | 'snack' => typeof m === 'string' && MEALS.has(m))
  const tags = [...new Set((Array.isArray(r.tags) ? r.tags : []).filter((t): t is string => typeof t === 'string' && TAGS.has(t)))].slice(0, 20)
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : []).map((i) => str(i, 60)).filter(Boolean).slice(0, 25)
  const kcal = num(r.kcal, 3000)
  const cc = str(r.country_code, 2).toUpperCase()
  return {
    food: {
      name, description: str(r.description, 400) || null, meals: meals.length ? [...new Set(meals)] : ['lunch', 'dinner'], serving: str(r.serving, 60) || null,
      kcal: kcal == null ? null : Math.round(kcal), protein_g: num(r.protein_g, 300), carbs_g: num(r.carbs_g, 500), fat_g: num(r.fat_g, 300), fibre_g: num(r.fibre_g, 100),
      tags, ingredients, cost_level: [1, 2, 3].includes(Number(r.cost_level)) ? Number(r.cost_level) : null,
      prep_minutes: num(r.prep_minutes, 1440) == null ? null : Math.round(Number(r.prep_minutes)),
      country_code: /^[A-Z]{2}$/.test(cc) ? cc : null,
    },
  }
}

export function capJson(v: unknown, max = 12000): string {
  const s = JSON.stringify(v)
  return s.length <= max ? s : s.slice(0, max) + '…(cut short: ask about fewer days)'
}
