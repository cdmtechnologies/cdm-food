// Recipes for CDM Food: checking what the AI returns, scaling for the household, and short cooking videos.
// Pure code (no network), shared by the app and the food-recipe edge function (copied to supabase/functions/food-recipe).

export type RecipeIngredient = { item: string; qty: number | null; unit: string; note: string }
export type RecipeStep = { text: string; minutes: number | null }
export type Video = { id: string; title: string; channel: string }
export type Recipe = {
  food_id: string; serves: number; ingredients: RecipeIngredient[]; steps: RecipeStep[]; tips: string[]
  total_minutes: number | null; videos: Video[]
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')
const UNITS = new Set(['', 'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'cups', 'piece', 'pieces', 'pinch', 'clove', 'cloves', 'slice', 'slices', 'handful', 'bunch', 'can', 'cans', 'cube', 'cubes', 'medium', 'large', 'small', 'oz', 'lb', 'leaf', 'leaves', 'stalk', 'stalks', 'sachet', 'wrap'])

/** Checks a recipe from the AI before it is saved. Returns null when it is not usable. */
export function cleanRecipe(raw: unknown): Omit<Recipe, 'food_id' | 'videos'> | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const serves = Math.round(Number(r.serves))
  const ingredients: RecipeIngredient[] = []
  for (const x of (Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, 30)) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const item = str(o.item, 80)
    if (!item) continue
    const q = Number(o.qty)
    const unit = str(o.unit, 12).toLowerCase()
    ingredients.push({ item, qty: Number.isFinite(q) && q > 0 && q <= 5000 ? Math.round(q * 100) / 100 : null, unit: UNITS.has(unit) ? unit : '', note: str(o.note, 80) })
  }
  const steps: RecipeStep[] = []
  for (const x of (Array.isArray(r.steps) ? r.steps : []).slice(0, 20)) {
    const o = (x && typeof x === 'object' ? x : { text: x }) as Record<string, unknown>
    const text = str(o.text, 400)
    if (!text) continue
    const m = Math.round(Number(o.minutes))
    steps.push({ text, minutes: Number.isFinite(m) && m > 0 && m <= 720 ? m : null })
  }
  if (!ingredients.length || steps.length < 2) return null
  const tips = (Array.isArray(r.tips) ? r.tips : []).map((t) => str(t, 200)).filter(Boolean).slice(0, 6)
  const total = Math.round(Number(r.total_minutes))
  return {
    serves: Number.isFinite(serves) && serves >= 1 && serves <= 12 ? serves : 4,
    ingredients, steps, tips,
    total_minutes: Number.isFinite(total) && total > 0 && total <= 1440 ? total : (steps.reduce((s, x) => s + (x.minutes ?? 0), 0) || null),
  }
}

/** Amount for `people` when the recipe serves `serves`, rounded to something you can measure. */
export function scaleQty(qty: number | null, serves: number, people: number): number | null {
  if (qty == null) return null
  const v = (qty * people) / Math.max(1, serves)
  if (v >= 100) return Math.round(v / 5) * 5
  if (v >= 10) return Math.round(v)
  if (v >= 1) return Math.round(v * 2) / 2
  return Math.max(0.25, Math.round(v * 4) / 4)
}

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }
export function formatQty(q: number | null, unit: string): string {
  if (q == null) return unit ? unit : ''
  const whole = Math.floor(q)
  const frac = FRACTIONS[String(Math.round((q - whole) * 100) / 100)] ?? ''
  const n = frac ? `${whole || ''}${frac}` : String(Math.round(q * 100) / 100)
  return unit ? `${n} ${unit}` : n
}

/** "2 h 15 min", "40 min" */
export function minutesLabel(m: number | null | undefined): string {
  if (!m) return ''
  const h = Math.floor(m / 60)
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`
}

/** What to search for when looking for cooking videos of a dish. */
export function videoQuery(name: string, country?: string | null): string {
  const base = name.replace(/\(.*?\)/g, ' ').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `how to cook ${base}${country ? ` ${country}` : ''}`.trim()
}

/** A YouTube search for short cooking videos, for when in-app videos are not available. */
export const youtubeSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%253D%253D`

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
/** Picks safe video ids and titles out of a YouTube Data API search response. */
export function parseYouTube(raw: unknown, max = 4): Video[] {
  const items = (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [])
  const out: Video[] = []
  for (const it of items) {
    const o = (it ?? {}) as { id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown; liveBroadcastContent?: unknown } }
    const id = o.id?.videoId
    if (typeof id !== 'string' || !VIDEO_ID.test(id) || out.some((v) => v.id === id)) continue
    if (o.snippet?.liveBroadcastContent && o.snippet.liveBroadcastContent !== 'none') continue
    out.push({ id, title: decode(str(o.snippet?.title, 120)) || 'Cooking video', channel: decode(str(o.snippet?.channelTitle, 60)) })
    if (out.length >= max) break
  }
  return out
}
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;|&gt;/g, '')

/** Keeps only well-formed videos (e.g. when reading cached rows). */
export const cleanVideos = (v: unknown): Video[] =>
  (Array.isArray(v) ? v : []).filter((x): x is Video => !!x && typeof x === 'object' && typeof (x as Video).id === 'string' && VIDEO_ID.test((x as Video).id))
    .map((x) => ({ id: x.id, title: str(x.title, 120), channel: str(x.channel, 60) })).slice(0, 6)

export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${VIDEO_ID.test(id) ? id : ''}?rel=0&modestbranding=1&playsinline=1`
