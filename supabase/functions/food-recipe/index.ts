// Supabase Edge Function: food-recipe (Premium)
//   { food_id }  The recipe and cooking steps for a food, plus short cooking videos.
// A recipe is made once by AI and then kept for everyone who can see that food. The food is read with the person's
// own login, so nobody can get a recipe for someone else's private food. Free users get { premium_needed: true }.
// Videos: with a YOUTUBE_API_KEY secret, up to 4 short, embeddable, safe-search cooking videos are found and kept
// for 30 days; without it the app shows a link to search YouTube instead.
//
// Secrets: ANTHROPIC_API_KEY. Optional: FOOD_AI_MODEL, YOUTUBE_API_KEY. Deploy with "Verify JWT" ON.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cleanRecipe, cleanVideos, parseYouTube, videoQuery, type Video } from './recipe.ts'
import { isLang, langLabel } from './languages.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = Deno.env.get('FOOD_AI_MODEL') ?? 'claude-haiku-5-5'
const YT = Deno.env.get('YOUTUBE_API_KEY') ?? ''
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VIDEO_DAYS = 30

const RECIPE_TOOL = {
  name: 'save_recipe',
  description: 'Save the recipe',
  input_schema: {
    type: 'object', required: ['serves', 'ingredients', 'steps'],
    properties: {
      serves: { type: 'integer', minimum: 1, maximum: 12 },
      total_minutes: { type: 'integer', description: 'Preparation plus cooking time' },
      ingredients: {
        type: 'array', maxItems: 30,
        items: {
          type: 'object', required: ['item'],
          properties: {
            item: { type: 'string' }, qty: { type: 'number' },
            unit: { type: 'string', description: 'One of: g kg ml l tsp tbsp cup cups piece pieces pinch clove cloves slice slices handful bunch can cans cube cubes medium large small oz lb leaf leaves stalk stalks sachet wrap, or empty' },
            note: { type: 'string', description: 'e.g. "chopped", "or palm oil"' },
          },
        },
      },
      steps: { type: 'array', minItems: 3, maxItems: 16, items: { type: 'object', required: ['text'], properties: { text: { type: 'string', description: 'One clear action, one or two sentences' }, minutes: { type: 'integer' } } } },
      tips: { type: 'array', maxItems: 5, items: { type: 'string' }, description: 'Short tips: swaps for a healthier version, storing leftovers, food safety' },
    },
  },
}

async function makeRecipe(food: Record<string, unknown>, countryName: string, lang: string) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2500,
      system: 'You are an experienced home cook and food-safety-aware recipe writer. Write the way the dish is really made at home in its country, with ingredients people can buy there. Use metric amounts (g, ml) or spoons and cups. Steps are numbered actions a beginner can follow, with times. Cook meat, poultry, fish and eggs through, and mention it where it matters. Never add ingredients the food\'s tags say it does not contain if they are allergens (nuts, dairy, gluten, egg, fish, shellfish, soy, sesame, pork, alcohol).',
      tools: [RECIPE_TOOL], tool_choice: { type: 'tool', name: 'save_recipe' },
      messages: [{ role: 'user', content: `Dish: ${food.name}\nCountry: ${countryName || 'not given'}\nDescription: ${food.description ?? ''}\nServing: ${food.serving ?? ''}\nMain ingredients: ${(food.ingredients as string[] ?? []).join(', ')}\nTags: ${(food.tags as string[] ?? []).join(', ')}\nWrite a recipe for 4 people.${lang === 'en' ? '' : `\nWrite every ingredient, step and tip in ${langLabel(lang)}. Keep the dish name as people know it. Units stay as listed (g, ml, tsp, cup…).`}` }],
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error?.message ?? `AI error ${r.status}`)
  const use = (j.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
  return { recipe: cleanRecipe(use?.input), tokensIn: Number(j.usage?.input_tokens ?? 0), tokensOut: Number(j.usage?.output_tokens ?? 0) }
}

async function findVideos(q: string): Promise<Video[]> {
  if (!YT) return []
  const u = new URL('https://www.googleapis.com/youtube/v3/search')
  const params: Record<string, string> = { part: 'snippet', type: 'video', videoDuration: 'short', videoEmbeddable: 'true', safeSearch: 'strict', maxResults: '6', q, key: YT }
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) { console.error('youtube', r.status); return [] }
    return parseYouTube(await r.json(), 4)
  } catch (e) { console.error('youtube', (e as Error).message); return [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: { user } } = await db.auth.getUser()
    if (!user) return json({ error: 'Please sign in again.' }, 401)
    const body = await req.json().catch(() => ({}))
    const foodId = String(body.food_id ?? '')
    if (!UUID.test(foodId)) return json({ error: 'Pick a food first.' }, 400)

    const { data: prof } = await admin.from('profiles').select('premium_until, language').eq('id', user.id).maybeSingle()
    if (!(prof?.premium_until && new Date(prof.premium_until) > new Date())) return json({ premium_needed: true, error: 'Recipes, cooking steps and videos are part of Premium.' })

    // read with the person's login: catalogue foods and their own foods only
    const { data: food } = await db.from('foods').select('id, name, description, serving, ingredients, tags, country_code, owner_id').eq('id', foodId).maybeSingle()
    if (!food) return json({ error: 'That food was not found.' }, 404)
    const { data: country } = food.country_code ? await admin.from('countries').select('name').eq('code', food.country_code).maybeSingle() : { data: null }

    const lang = isLang(body.lang) ? body.lang : isLang(prof?.language) ? prof!.language : 'en'
    let { data: row } = await admin.from('recipes').select('*').eq('food_id', foodId).eq('lang', lang).maybeSingle()
    if (!row) {
      if (!KEY) return json({ error: 'Recipes are not set up yet.' })
      const { data: sw } = await admin.from('settings').select('ai_enabled').maybeSingle()
      if (sw && sw.ai_enabled === false) return json({ error: 'AI help is paused for a short while. Please try again later.' })
      const { data: gate } = await admin.rpc('recipe_take', { p_user: user.id })
      if (!gate?.[0]?.allowed) return json({ error: "You have opened a lot of new recipes today. Recipes you have already opened still work; new ones are back tomorrow." })
      const made = await makeRecipe(food, country?.name ?? '', lang)
      await admin.rpc('ai_add_tokens', { p_user: user.id, p_in: made.tokensIn, p_out: made.tokensOut })
      const recipe = made.recipe
      if (!recipe) return json({ error: 'The recipe did not come out right. Please try again.' })
      const ins = await admin.from('recipes').upsert({ food_id: foodId, lang, ...recipe, source: 'ai' }, { onConflict: 'food_id,lang', ignoreDuplicates: true }).select('*').maybeSingle()
      row = ins.data ?? (await admin.from('recipes').select('*').eq('food_id', foodId).eq('lang', lang).maybeSingle()).data
      if (!row) throw new Error(ins.error?.message ?? 'recipe not saved')
    }

    let videos = cleanVideos(row.videos)
    const stale = !row.videos_at || Date.now() - new Date(row.videos_at).getTime() > VIDEO_DAYS * 864e5
    if (YT && stale) {
      const found = await findVideos(videoQuery(food.name, country?.name))
      if (found.length || !videos.length) videos = found
      await admin.from('recipes').update({ videos, videos_at: new Date().toISOString() }).eq('food_id', foodId).eq('lang', lang)
    }

    return json({
      recipe: { food_id: foodId, serves: row.serves, ingredients: row.ingredients, steps: row.steps, tips: row.tips ?? [], total_minutes: row.total_minutes, videos },
      video_search: videoQuery(food.name, country?.name),
    })
  } catch (e) {
    console.error('food-recipe', (e as Error).message)
    return json({ error: 'The recipe could not load just now. Please try again in a moment.' })
  }
})
