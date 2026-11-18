// Supabase Edge Function: food-i18n
//   { lang }  Translates the app's English text (strings.json, made from the code) into one of the app's languages with AI,
//             once, and saves it in ui_strings for everyone. Later calls only fill in text added since.
// Anyone may call it (people pick a language before signing in), but it only ever translates the app's own text into the
// app's own languages, one request at a time per language, so it cannot be used to run up AI costs.
//
// Secrets: ANTHROPIC_API_KEY. Optional: FOOD_AI_MODEL. Deploy with "Verify JWT" OFF.
import { createClient } from 'npm:@supabase/supabase-js@2'
import STRINGS from './strings.json' with { type: 'json' }
import { isLang, langLabel } from './languages.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = Deno.env.get('FOOD_AI_MODEL') ?? 'claude-haiku-5-5'
const BATCH = 90

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

/** Keeps a translation only if it has exactly the same {placeholders} and no markup. */
export function goodTranslation(english: string, text: unknown): string | null {
  if (typeof text !== 'string') return null
  const out = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!out || out.length > 1200 || /<\/?[a-z][^>]*>/i.test(out)) return null
  if (placeholders(out) !== placeholders(english)) return null
  return out
}

async function translate(lang: string, batch: string[]): Promise<Record<string, string>> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000,
      system: `You translate the screens of CDM Food, a friendly meal-planning app, from English into ${langLabel(lang)}. Use the everyday words people in the countries that speak it use on their phones, short and clear like an app (buttons stay short). Keep words in {curly braces} exactly as they are. Keep CDM Food, Premium, Ask AI, Paystack, kcal, g, kg, cm and emoji unchanged. Do not add explanations.`,
      tools: [{ name: 'save', description: 'Save the translations', input_schema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['i', 'text'], properties: { i: { type: 'integer' }, text: { type: 'string' } } } } } } }],
      tool_choice: { type: 'tool', name: 'save' },
      messages: [{ role: 'user', content: 'Translate each item. Answer with the same numbers.\n' + JSON.stringify(batch.map((text, i) => ({ i, text }))) }],
    }),
    signal: AbortSignal.timeout(110_000),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error?.message ?? `AI error ${r.status}`)
  const items = (j.content ?? []).find((b: { type: string }) => b.type === 'tool_use')?.input?.items ?? []
  const out: Record<string, string> = {}
  for (const it of items) {
    const en = batch[Number(it?.i)]
    const ok = en != null ? goodTranslation(en, it?.text) : null
    if (en != null && ok) out[en] = ok
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const body = await req.json().catch(() => ({}))
  const lang = body?.lang
  if (!isLang(lang) || lang === 'en') return json({ error: 'Unknown language' }, 400)
  if (!KEY) return json({ error: 'Translations are not set up yet.' })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  try {
    const have = new Set<string>()
    for (let from = 0; from < 5000; from += 1000) {
      const { data } = await admin.from('ui_strings').select('key').eq('lang', lang).range(from, from + 999)
      for (const r of data ?? []) have.add(r.key)
      if (!data || data.length < 1000) break
    }
    const missing = (STRINGS as string[]).filter((s) => !have.has(s))
    if (!missing.length) return json({ done: true, added: 0 })

    const { data: mine } = await admin.rpc('claim_ui_lang', { p_lang: lang })
    if (!mine) return json({ done: false, busy: true })
    try {
      const batches: string[][] = []
      for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH))
      let added = 0
      // a few at a time so one language finishes well inside the time limit
      for (let i = 0; i < batches.length; i += 4) {
        const results = await Promise.allSettled(batches.slice(i, i + 4).map((b) => translate(lang, b)))
        const rows = results.flatMap((r) => (r.status === 'fulfilled' ? Object.entries(r.value).map(([key, text]) => ({ lang, key, text })) : []))
        results.forEach((r) => { if (r.status === 'rejected') console.error('food-i18n', lang, (r.reason as Error).message) })
        if (rows.length) {
          const { error } = await admin.from('ui_strings').upsert(rows, { onConflict: 'lang,key', ignoreDuplicates: true })
          if (error) throw error
          added += rows.length
        }
      }
      return json({ done: added >= missing.length, added })
    } finally {
      await admin.rpc('release_ui_lang', { p_lang: lang })
    }
  } catch (e) {
    console.error('food-i18n', (e as Error).message)
    return json({ error: 'Could not translate just now.' })
  }
})
