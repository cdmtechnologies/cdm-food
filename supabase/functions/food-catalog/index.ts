// Supabase Edge Function: food-catalog
//   { action: 'load', country: 'KE' }  Makes (or tops up) a country's menu with AI when it has fewer than 12 dishes.
//                                       Each country is made once and then shared with everyone; figures are estimates.
//   { action: 'estimate', name, country?, details? }  Estimates nutrition and tags for a food the person wants to add.
//                                       Counts as one Ask AI question. Nothing is saved; the app shows the result in the form.
// Secrets: ANTHROPIC_API_KEY. Optional: FOOD_AI_MODEL. Deploy with "Verify JWT" ON.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cleanFood } from './lib.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = Deno.env.get('FOOD_AI_MODEL') ?? 'claude-haiku-5-5'
const TAG_LIST = 'meat poultry fish shellfish pork dairy egg nuts gluten soy sesame alcohol high_protein high_fibre low_carb low_gi whole_grain light fried sugary high_salt spicy'

const FOOD_SCHEMA = {
  type: 'object',
  required: ['name', 'meals', 'serving', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'tags', 'ingredients', 'cost_level', 'prep_minutes', 'description'],
  properties: {
    name: { type: 'string', description: 'Common name, with the local name in brackets if different' },
    description: { type: 'string', description: 'One short sentence' },
    meals: { type: 'array', items: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] } },
    serving: { type: 'string', description: 'A typical serving, e.g. "1 plate (350 g)"' },
    kcal: { type: 'integer' }, protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' }, fibre_g: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' }, description: `Only from: ${TAG_LIST}. Always list what it contains (meat, poultry, fish, shellfish, pork, dairy, egg, nuts, gluten, soy, sesame, alcohol).` },
    ingredients: { type: 'array', items: { type: 'string' }, description: 'Main ingredients, 3 to 8' },
    cost_level: { type: 'integer', enum: [1, 2, 3], description: '1 cheap everyday, 2 moderate, 3 special or costly' },
    prep_minutes: { type: 'integer' },
  },
}

async function claude(system: string, prompt: string, tool: Record<string, unknown>, maxTokens = 6000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content: prompt }] }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error?.message ?? `AI error ${r.status}`)
  const use = (j.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
  return { input: use?.input ?? {}, usage: j.usage ?? {} }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let claimed = ''
  let before = 'empty'
  try {
    const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
    const { data: { user } } = await db.auth.getUser()
    if (!user) return json({ error: 'Please sign in again.' }, 401)
    if (!KEY) return json({ error: 'This needs Ask AI, which is not set up yet.' })
    const { data: sw } = await admin.from('settings').select('ai_enabled').maybeSingle()
    if (sw && sw.ai_enabled === false) return json({ error: 'AI help is paused for a short while. Please try again later.' })
    const body = await req.json().catch(() => ({}))

    if (body.action === 'load') {
      const cc = String(body.country ?? '').toUpperCase()
      const { data: country } = await admin.from('countries').select('code, name, menu_status, menu_source').eq('code', cc).maybeSingle()
      if (!country) return json({ error: 'Unknown country.' }, 400)
      before = country.menu_status === 'generating' ? 'empty' : country.menu_status
      const { data: ok } = await admin.rpc('claim_country_menu', { p_code: cc })
      if (!ok) return json({ added: 0, status: country.menu_status === 'generating' ? 'generating' : 'ready' })
      claimed = cc
      const { data: have } = await admin.from('foods').select('name').eq('country_code', cc).is('owner_id', null)
      const existing = (have ?? []).map((f: { name: string }) => f.name)
      const want = Math.max(10, 22 - existing.length)
      const { input } = await claude(
        'You are a food expert and nutritionist building a meal-planning catalogue. Choose dishes people in the country really eat at home and in everyday restaurants, across breakfast, lunch, dinner and snacks, from all its main regions and communities. Nutrition is for one typical serving and must be realistic (kcal close to 4 x protein + 4 x carbs + 9 x fat).',
        `Country: ${country.name} (${cc}).\nList ${want} popular dishes, including at least 3 breakfasts, 2 snacks and some vegetarian dishes if the cuisine has them.${existing.length ? `\nAlready in the catalogue (do not repeat): ${existing.join('; ')}` : ''}`,
        { name: 'save_menu', description: 'Save the dishes', input_schema: { type: 'object', required: ['dishes'], properties: { dishes: { type: 'array', items: FOOD_SCHEMA, maxItems: 30 } } } },
      )
      const seen = new Set(existing.map((n) => n.toLowerCase()))
      const rows = []
      for (const d of (Array.isArray(input.dishes) ? input.dishes : []).slice(0, 30)) {
        const { food } = cleanFood({ ...d, country_code: cc })
        if (!food || seen.has(food.name.toLowerCase()) || !food.kcal) continue
        seen.add(food.name.toLowerCase())
        rows.push({ ...food, country_code: cc, source: 'ai' })
      }
      if (rows.length) {
        const { error } = await admin.from('foods').insert(rows)
        if (error) throw new Error(error.message)
      }
      await admin.from('countries').update({ menu_status: 'ready', menu_source: country.menu_source ?? 'ai', updated_at: new Date().toISOString() }).eq('code', cc)
      claimed = ''
      return json({ added: rows.length, status: 'ready' })
    }

    if (body.action === 'estimate') {
      const name = String(body.name ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120)
      if (!name) return json({ error: 'Type the name of the food first.' }, 400)
      const { data: gate } = await admin.rpc('ai_take_question', { p_user: user.id })
      if (!gate?.[0]?.allowed) return json({ limited: true, error: "You have used today's AI questions. Fill in the figures yourself, or try tomorrow." })
      const cc = /^[A-Z]{2}$/.test(String(body.country ?? '').toUpperCase()) ? String(body.country).toUpperCase() : ''
      const details = String(body.details ?? '').slice(0, 300)
      const { input } = await claude(
        'You are a nutritionist. Estimate realistic nutrition for one typical serving of the food described, and its tags and main ingredients. If the name is not a food or drink, return the name "unknown".',
        `Food: ${name}${cc ? `\nCountry: ${cc}` : ''}${details ? `\nDetails from the person: ${details}` : ''}`,
        { name: 'food', description: 'The food with estimated nutrition', input_schema: FOOD_SCHEMA }, 1200,
      )
      const { food, error } = cleanFood({ ...input, country_code: cc || null })
      if (!food || food.name.toLowerCase() === 'unknown') return json({ error: error ?? 'That does not look like a food. Check the name and try again.' })
      return json({ food })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('food-catalog', (e as Error).message)
    if (claimed) await admin.from('countries').update({ menu_status: before === 'ready' ? 'ready' : 'empty' }).eq('code', claimed)
    return json({ error: 'That did not work just now. Please try again in a moment.' })
  }
})
