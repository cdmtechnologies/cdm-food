// Supabase Edge Function: cdm-control (CDM Food's owner dashboard and the CDM Partners Control Centre)
//
// Two ways in, nothing else:
//   1. CDM Partners' Control Centre, with the shared secret CDM_CONTROL_KEY in the x-cdm-control-key header
//      (same value as in the other CDM apps). It may search, open, extend or pause a customer, and read the overview.
//   2. The owner, signed in to CDM Food with an email listed in the staff table. When two-step sign-in is required
//      (settings.owner_two_step, on by default) the session must have passed it (aal2).
// Every change is written to admin_log by the database functions it calls.
//
// Deploy with "Verify JWT" OFF (the checks above are done here). Secret: CDM_CONTROL_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cdm-control-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
/** The claims of a token that Supabase has already verified (getUser). */
export function claims(token: string): Record<string, unknown> {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return {} }
}
const id = (v: unknown) => { const s = String(v ?? ''); if (!UUID.test(s)) throw new Error('Pick a customer first'); return s }
const note = (v: unknown) => (typeof v === 'string' ? v.slice(0, 500) : null)

type Who = { actor: string; partners: boolean }
type Admin = ReturnType<typeof createClient>
const rpc = async (admin: Admin, fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await admin.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

// what each action does; partners: true means the Control Centre may use it too
const ACTIONS: Record<string, { partners?: boolean; run: (a: Admin, b: Record<string, unknown>, w: Who) => Promise<unknown> }> = {
  overview: { partners: true, run: (a) => rpc(a, 'food_owner_overview') },
  search: { partners: true, run: (a, b) => rpc(a, 'food_control_search', { p_q: String(b.q ?? '').slice(0, 100) }) },
  detail: { partners: true, run: (a, b) => rpc(a, 'food_control_detail', { p_id: id(b.id) }) },
  extend: { partners: true, run: (a, b, w) => rpc(a, 'food_control_extend', { p_id: id(b.id), p_days: Math.round(Number(b.days)), p_note: note(b.note), p_actor: w.actor }) },
  pause: { partners: true, run: (a, b, w) => rpc(a, 'food_control_pause', { p_id: id(b.id), p_note: note(b.note), p_actor: w.actor }) },
  content: { run: (a) => rpc(a, 'food_owner_content') },
  promote: { run: (a, b, w) => rpc(a, 'food_owner_promote', { p_food: id(b.id), p_actor: w.actor }) },
  payments: { run: (a, b) => rpc(a, 'food_owner_payments', { p_q: String(b.q ?? '').slice(0, 100), p_limit: Number(b.limit) || 50 }) },
  log: { run: (a, b) => rpc(a, 'food_owner_log', { p_limit: Number(b.limit) || 100 }) },
  settings: {
    run: (a, b, w) => {
      const patch = (b.patch && typeof b.patch === 'object' && !Array.isArray(b.patch)) ? b.patch : {}
      return rpc(a, 'food_owner_settings', { p_patch: patch, p_actor: w.actor })
    },
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }
  const name = String(body.action ?? '')

  // ---- who is calling ----
  let who: Who
  const key = req.headers.get('x-cdm-control-key')
  if (key !== null) {
    const secret = Deno.env.get('CDM_CONTROL_KEY') ?? ''
    if (secret.length < 24) return json({ error: 'Not configured' }, 503)
    if (!safeEqual(key, secret)) return json({ error: 'Forbidden' }, 401)
    if (!ACTIONS[name]?.partners) return json({ error: 'Unknown action' }, 400)
    who = { actor: 'CDM Partners Control Centre', partners: true }
  } else {
    const auth = req.headers.get('Authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Please sign in again.' }, 401)
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user?.email || !user.email_confirmed_at) return json({ error: 'Please sign in again.' }, 401)
    const email = user.email.toLowerCase()
    const { data: staff } = await admin.from('staff').select('role').eq('email', email).maybeSingle()
    if (!staff) return json({ error: 'This page is for the CDM Food owner only.' }, 403)
    const { data: s } = await admin.from('settings').select('owner_two_step').maybeSingle()
    const aal = String(claims(token).aal ?? 'aal1')
    const twoStep = s?.owner_two_step !== false
    if (name === 'whoami') return json({ data: { email, role: staff.role, two_step_required: twoStep, aal } })
    if (twoStep && aal !== 'aal2') return json({ error: 'Enter your two-step sign-in code first.', need_two_step: true }, 403)
    if (!ACTIONS[name]) return json({ error: 'Unknown action' }, 400)
    who = { actor: email, partners: false }
  }

  try {
    return json({ data: await ACTIONS[name].run(admin, body, who) })
  } catch (e) {
    const msg = (e as Error).message
    console.error('cdm-control', name, msg)
    return json({ error: msg.length < 200 ? msg : 'Something went wrong.' }, 400)
  }
})
