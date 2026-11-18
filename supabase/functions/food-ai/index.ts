// Supabase Edge Function: food-ai ("Ask AI" in CDM Food)
// Changes the person's meal plan on request (diet, health reasons, budget, taste), adds foods that are not in the
// catalogue, and answers food and nutrition questions. Everything runs with the person's own login, so row-level
// security limits it to their own plan, foods and settings. Message text is not stored.
//
// Secrets: ANTHROPIC_API_KEY. Optional: FOOD_AI_MODEL (default claude-haiku-5-5). Daily limits are in the settings table.
// Deploy with "Verify JWT" ON.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { addDays, capJson, cleanFood, cleanHistory, dayRange, isDay } from './lib.ts'
import { dailyTarget, fillWeek, GOALS, MEALS, totals, unsuitable, type Food, type Meal, type PlanItem, type Profile } from './planner.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = Deno.env.get('FOOD_AI_MODEL') ?? 'claude-haiku-5-5'
const FOOD_COLS = 'id, country_code, name, description, meals, serving, kcal, protein_g, carbs_g, fat_g, fibre_g, tags, ingredients, cost_level, prep_minutes, source, owner_id'

const RULES = `You are "Ask AI" in CDM Food, a meal planner made by CDM Technologies for people in every country.
You help the person plan meals they enjoy from their country's dishes, and change their plan to fit their tastes, budget, diet and health.

How to work:
- Be warm, brief and practical. Plain text only: no Markdown symbols such as #, ** or tables; short "- " lists are fine.
- Reply in the language the person writes in.
- To change the plan, use the tools: get_plan first, then search_foods, then set_meal, clear_meals or fill_days. Never claim you changed something unless a tool said it was saved. After changes, say briefly what you changed.
- Pick foods that suit the person: search results say whether each one suits their diet and allergies; never plan an unsuitable one. Prefer their country's dishes unless they ask for others.
- If they want a food that is not in the catalogue, use add_food with your best estimate of its nutrition for one typical serving, then plan it. Say the figures are estimates.
- Only change their saved preferences (diet, allergies, health goals, calorie target, meals) when they ask you to, using update_preferences.
- Locked meals are ones the person chose to keep: do not change them unless they say so.

Health and safety:
- You are not a doctor or dietitian. For medical conditions (diabetes, blood pressure, kidney or heart disease, pregnancy, allergies) give general healthy-eating guidance and suggest they confirm with their doctor or a dietitian, especially if they take medicine.
- Never plan fewer than 1,200 kcal a day for an adult unless they say a doctor set it, and never suggest crash diets, long fasts or skipping meals to lose weight quickly.
- If someone seems to be struggling with eating (fear of food, bingeing, purging, extreme restriction), do not give calorie or weight numbers; respond kindly and encourage them to talk to a doctor or someone they trust.
- Nutrition figures in CDM Food are approximate.`

type Ctx = { db: ReturnType<typeof createClient>; uid: string; today: string; profile: Profile & { country_code: string | null; notes: string | null }; changed: boolean }

async function myFoods(c: Ctx, ids: string[]): Promise<Map<string, Food>> {
  if (!ids.length) return new Map()
  const { data } = await c.db.from('foods').select(FOOD_COLS).in('id', [...new Set(ids)])
  return new Map(((data ?? []) as Food[]).map((f) => [f.id, f]))
}

async function planFor(c: Ctx, days: string[]) {
  const { data, error } = await c.db.from('plan_items').select('id, day, meal, food_id, servings, position, locked')
    .gte('day', days[0]).lte('day', days[days.length - 1]).order('day').order('position')
  if (error) throw new Error(error.message)
  return (data ?? []) as PlanItem[]
}

const TOOLS: { def: Record<string, unknown>; run: (c: Ctx, i: Record<string, unknown>) => Promise<unknown> }[] = [
  {
    def: { name: 'get_profile', description: "The person's country, diet, allergies, health goals, daily calorie target, chosen meals, household size and notes.", input_schema: { type: 'object', properties: {} } },
    async run(c) {
      const p = c.profile
      return { country: p.country_code, diet: p.diet, allergies: p.allergies, goals: p.goals, daily_kcal_target: dailyTarget(p), own_target_set: !!p.daily_kcal, meals: p.meals, household: p.household, notes: p.notes }
    },
  },
  {
    def: {
      name: 'get_plan', description: 'The plan between two dates (at most 14 days): each meal with its foods, servings, calories and whether it is locked, plus daily totals. Dates YYYY-MM-DD.',
      input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
    },
    async run(c, i) {
      const days = dayRange(i.from, i.to, c.today)
      const items = await planFor(c, days)
      const foods = await myFoods(c, items.map((x) => x.food_id))
      return {
        daily_target: dailyTarget(c.profile),
        days: days.map((d) => {
          const di = items.filter((x) => x.day === d)
          return {
            day: d, total: totals(di, foods),
            meals: MEALS.filter((m) => di.some((x) => x.meal === m)).map((m) => ({
              meal: m, items: di.filter((x) => x.meal === m).map((x) => ({ food_id: x.food_id, food: foods.get(x.food_id)?.name, servings: x.servings, kcal: Math.round((foods.get(x.food_id)?.kcal ?? 0) * x.servings), locked: x.locked })),
            })),
          }
        }),
      }
    },
  },
  {
    def: {
      name: 'search_foods', description: "Find foods in the catalogue and the person's own foods. Filters are optional; country defaults to the person's country (use 'any' for all). Results say whether each suits the person.",
      input_schema: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Words in the name, for example "rice" or "soup"' },
          country: { type: 'string', description: 'Two-letter country code, or "any"' },
          meal: { type: 'string', enum: MEALS },
          with_tags: { type: 'array', items: { type: 'string' }, description: 'All of these tags, e.g. high_fibre, low_gi, high_protein, light' },
          without_tags: { type: 'array', items: { type: 'string' }, description: 'None of these tags, e.g. fried, sugary, high_salt' },
          max_kcal: { type: 'integer' },
        },
      },
    },
    async run(c, i) {
      let q = c.db.from('foods').select(FOOD_COLS).limit(60)
      const cc = String(i.country ?? '').toUpperCase()
      if (cc !== 'ANY') {
        const country = /^[A-Z]{2}$/.test(cc) ? cc : c.profile.country_code
        if (country) q = q.or(`country_code.eq.${country},owner_id.eq.${c.uid}`)
      }
      const words = String(i.query ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').trim().slice(0, 40)
      if (words) q = q.ilike('name', `%${words}%`)
      if (typeof i.meal === 'string' && (MEALS as string[]).includes(i.meal)) q = q.contains('meals', [i.meal])
      const withT = (Array.isArray(i.with_tags) ? i.with_tags : []).filter((t): t is string => typeof t === 'string' && /^[a-z_]{2,20}$/.test(t))
      if (withT.length) q = q.contains('tags', withT)
      if (Number(i.max_kcal) > 0) q = q.lte('kcal', Number(i.max_kcal))
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const without = new Set((Array.isArray(i.without_tags) ? i.without_tags : []).filter((t): t is string => typeof t === 'string'))
      const list = ((data ?? []) as Food[]).filter((f) => !f.tags.some((t) => without.has(t)))
      if (!list.length) return { foods: [], note: 'Nothing found. Try fewer filters, another country, or add_food.' }
      return {
        foods: list.slice(0, 40).map((f) => {
          const why = unsuitable(f, c.profile)
          return { food_id: f.id, name: f.name, country: f.country_code, own: !!f.owner_id, meals: f.meals, serving: f.serving, kcal: f.kcal, protein_g: f.protein_g, fibre_g: f.fibre_g, tags: f.tags, cost_level: f.cost_level, suits: !why, ...(why ? { why_not: why } : {}) }
        }),
      }
    },
  },
  {
    def: {
      name: 'set_meal', description: 'Replace one meal on one day with these foods (1 to 4 foods). Fails if that meal is locked.',
      input_schema: {
        type: 'object', required: ['day', 'meal', 'foods'], properties: {
          day: { type: 'string' }, meal: { type: 'string', enum: MEALS },
          foods: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', required: ['food_id'], properties: { food_id: { type: 'string' }, servings: { type: 'number', minimum: 0.25, maximum: 4 } } } },
        },
      },
    },
    async run(c, i) {
      if (!isDay(i.day) || !(MEALS as string[]).includes(String(i.meal))) return { saved: false, error: 'Give a date (YYYY-MM-DD) and a meal.' }
      const want = (Array.isArray(i.foods) ? i.foods : []).slice(0, 4) as { food_id?: unknown; servings?: unknown }[]
      const foods = await myFoods(c, want.map((w) => String(w.food_id)))
      for (const w of want) {
        const f = foods.get(String(w.food_id))
        if (!f) return { saved: false, error: `Food ${w.food_id} was not found.` }
        const why = unsuitable(f, c.profile)
        if (why) return { saved: false, error: `${f.name}: ${why}. Pick another food.` }
      }
      const { data: locked } = await c.db.from('plan_items').select('id').eq('day', i.day).eq('meal', i.meal).eq('locked', true).limit(1)
      if (locked?.length) return { saved: false, error: 'That meal is locked. Ask the person if they want to unlock it first.' }
      const del = await c.db.from('plan_items').delete().eq('day', i.day).eq('meal', i.meal)
      if (del.error) throw new Error(del.error.message)
      const rows = want.map((w, n) => ({ user_id: c.uid, day: i.day, meal: i.meal, food_id: String(w.food_id), servings: Math.min(4, Math.max(0.25, Number(w.servings) || 1)), position: n }))
      const ins = await c.db.from('plan_items').insert(rows)
      if (ins.error) throw new Error(ins.error.message)
      c.changed = true
      return { saved: true, day: i.day, meal: i.meal, foods: rows.map((r) => foods.get(r.food_id)?.name) }
    },
  },
  {
    def: {
      name: 'clear_meals', description: 'Remove the unlocked foods between two dates (at most 14 days), for all meals or only the listed meals.',
      input_schema: { type: 'object', required: ['from', 'to'], properties: { from: { type: 'string' }, to: { type: 'string' }, meals: { type: 'array', items: { type: 'string', enum: MEALS } } } },
    },
    async run(c, i) {
      const days = dayRange(i.from, i.to, c.today)
      let q = c.db.from('plan_items').delete().gte('day', days[0]).lte('day', days[days.length - 1]).eq('locked', false)
      const meals = (Array.isArray(i.meals) ? i.meals : []).filter((m) => (MEALS as string[]).includes(String(m)))
      if (meals.length) q = q.in('meal', meals)
      const { error } = await q
      if (error) throw new Error(error.message)
      c.changed = true
      return { cleared: true, from: days[0], to: days[days.length - 1] }
    },
  },
  {
    def: {
      name: 'fill_days', description: "Fill the empty meals between two dates (at most 14 days) with suitable dishes from the person's country and their own foods, balanced for their goals.",
      input_schema: { type: 'object', required: ['from', 'to'], properties: { from: { type: 'string' }, to: { type: 'string' } } },
    },
    async run(c, i) {
      const days = dayRange(i.from, i.to, c.today)
      const existing = await planFor(c, days)
      let q = c.db.from('foods').select(FOOD_COLS).limit(1000)
      if (c.profile.country_code) q = q.or(`country_code.eq.${c.profile.country_code},owner_id.eq.${c.uid}`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const add = fillWeek(days, c.profile.meals, (data ?? []) as Food[], c.profile, existing, Date.now() % 100000)
      if (!add.length) return { added: 0, note: 'Every meal in those days is already planned, or there are no suitable foods.' }
      const ins = await c.db.from('plan_items').insert(add.map((x) => ({ ...x, user_id: c.uid })))
      if (ins.error) throw new Error(ins.error.message)
      c.changed = true
      return { added: add.length }
    },
  },
  {
    def: {
      name: 'add_food', description: "Add a food to the person's own foods (when it is not in the catalogue), with estimated nutrition for one typical serving. Returns its food_id.",
      input_schema: {
        type: 'object', required: ['name', 'meals', 'kcal'], properties: {
          name: { type: 'string' }, description: { type: 'string' }, country_code: { type: 'string' },
          meals: { type: 'array', items: { type: 'string', enum: MEALS } }, serving: { type: 'string', description: 'e.g. 1 plate (350 g)' },
          kcal: { type: 'integer' }, protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' }, fibre_g: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' }, description: 'From: meat poultry fish shellfish pork dairy egg nuts gluten soy sesame alcohol high_protein high_fibre low_carb low_gi whole_grain light fried sugary high_salt spicy' },
          ingredients: { type: 'array', items: { type: 'string' } }, cost_level: { type: 'integer', enum: [1, 2, 3] },
        },
      },
    },
    async run(c, i) {
      const { food, error } = cleanFood({ ...i, country_code: i.country_code ?? c.profile.country_code })
      if (!food) return { saved: false, error }
      const { data, error: e } = await c.db.from('foods').insert({ ...food, description: food.description ? `${food.description} (nutrition estimated by AI)` : 'Nutrition estimated by AI', source: 'user', owner_id: c.uid }).select('id, name').single()
      if (e) return { saved: false, error: e.message }
      c.changed = true
      return { saved: true, food_id: data.id, name: data.name }
    },
  },
  {
    def: {
      name: 'update_preferences', description: "Change the person's saved preferences, only when they ask.",
      input_schema: {
        type: 'object', properties: {
          diet: { type: 'string', enum: ['none', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'no_pork'] },
          allergies: { type: 'array', items: { type: 'string', enum: ['nuts', 'dairy', 'gluten', 'egg', 'fish', 'shellfish', 'soy', 'sesame'] } },
          goals: { type: 'array', items: { type: 'string', enum: GOALS.map((g) => g.id) } },
          daily_kcal: { type: 'integer', minimum: 1200, maximum: 5000 },
          meals: { type: 'array', items: { type: 'string', enum: MEALS } },
          notes: { type: 'string', description: 'Likes and dislikes to remember, short' },
        },
      },
    },
    async run(c, i) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of ['diet', 'allergies', 'goals', 'meals'] as const) if (i[k] !== undefined) patch[k] = i[k]
      if (Number(i.daily_kcal) >= 1200) patch.daily_kcal = Math.min(5000, Math.round(Number(i.daily_kcal)))
      if (typeof i.notes === 'string') patch.notes = i.notes.slice(0, 500)
      const { error } = await c.db.from('profiles').update(patch).eq('id', c.uid)
      if (error) return { saved: false, error: error.message }
      Object.assign(c.profile, patch)
      c.changed = true
      return { saved: true }
    },
  },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    const url = Deno.env.get('SUPABASE_URL')!
    const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: { user } } = await db.auth.getUser()
    if (!user) return json({ error: 'Please sign in again.' }, 401)
    if (!KEY) return json({ error: 'Ask AI is not set up yet.' })
    const history = cleanHistory(body.messages)
    if (!history.length) return json({ error: 'Type a question first.' }, 400)

    const { data: gate, error: gateErr } = await admin.rpc('ai_take_question', { p_user: user.id })
    if (gateErr) throw new Error(gateErr.message)
    const g = gate?.[0]
    if (!g?.allowed) {
      return json({ limited: true, premium: !!g?.premium, error: g?.premium ? `You have used today's ${g.daily_limit} questions. Ask AI resets tomorrow.` : `You have used today's ${g?.daily_limit ?? 3} free questions. Go Premium for more, or come back tomorrow.` })
    }

    const { data: prof } = await db.from('profiles').select('country_code, diet, allergies, goals, daily_kcal, meals, household, notes').eq('id', user.id).maybeSingle()
    const today = isDay(body.today) ? body.today : new Date().toISOString().slice(0, 10)
    const ctx: Ctx = {
      db, uid: user.id, today, changed: false,
      profile: { country_code: prof?.country_code ?? null, diet: prof?.diet ?? 'none', allergies: prof?.allergies ?? [], goals: prof?.goals ?? [], daily_kcal: prof?.daily_kcal ?? null, meals: (prof?.meals ?? ['breakfast', 'lunch', 'dinner']) as Meal[], household: prof?.household ?? 1, notes: prof?.notes ?? null },
    }
    const week = isDay(body.week_start) ? body.week_start : today
    const about = `About this conversation:\n- Today: ${today}\n- Week on screen: ${week} to ${addDays(week, 6)}\n- Country: ${ctx.profile.country_code ?? 'not chosen'}\n- Diet: ${ctx.profile.diet}; allergies: ${ctx.profile.allergies.join(', ') || 'none'}; goals: ${ctx.profile.goals.join(', ') || 'none'}; target ${dailyTarget(ctx.profile)} kcal a day`

    // deno-lint-ignore no-explicit-any
    const messages: any[] = history.map((m) => ({ role: m.role, content: m.content }))
    let inTok = 0, outTok = 0, reply = ''
    for (let round = 0; round < 8; round++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: about }], tools: TOOLS.map((t) => t.def), messages }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error?.message ?? `AI error ${r.status}`)
      inTok += (j.usage?.input_tokens ?? 0) + (j.usage?.cache_read_input_tokens ?? 0) + (j.usage?.cache_creation_input_tokens ?? 0)
      outTok += j.usage?.output_tokens ?? 0
      const blocks = j.content ?? []
      reply = blocks.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim()
      const calls = blocks.filter((b: { type: string }) => b.type === 'tool_use')
      if (j.stop_reason !== 'tool_use' || !calls.length) break
      messages.push({ role: 'assistant', content: blocks })
      const results = []
      for (const call of calls) {
        const t = TOOLS.find((x) => x.def.name === call.name)
        let out: string
        try { out = t ? capJson(await t.run(ctx, (call.input ?? {}) as Record<string, unknown>)) : capJson({ error: 'Unknown tool' }) } catch (e) { out = capJson({ error: (e as Error).message.slice(0, 200) }) }
        results.push({ type: 'tool_result', tool_use_id: call.id, content: out })
      }
      messages.push({ role: 'user', content: results })
    }
    await admin.rpc('ai_add_tokens', { p_user: user.id, p_in: inTok, p_out: outTok })
    if (!reply) reply = ctx.changed ? 'Done. Your plan is updated.' : 'Sorry, I could not answer that. Try asking in a different way.'
    return json({ reply, changed: ctx.changed, used_today: g.used_today, daily_limit: g.daily_limit, premium: g.premium })
  } catch (e) {
    console.error('food-ai', (e as Error).message)
    return json({ error: 'Ask AI could not answer just now. Please try again in a moment.' })
  }
})
