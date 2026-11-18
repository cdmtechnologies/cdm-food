// Data access for CDM Food. Reads and writes go through Supabase with the person's own login (row-level security).
import { callFunction, supabase } from './supabase'
import COUNTRY_LIST from './countries.json'
import type { Allergy, Diet, Food, Goal, Meal, PlanItem } from './planner'

export const FOOD_COLS = 'id, country_code, name, description, meals, serving, kcal, protein_g, carbs_g, fat_g, fibre_g, tags, ingredients, cost_level, prep_minutes, source, owner_id'

export type ProfileRow = {
  id: string; display_name: string | null; country_code: string | null; household: number; diet: Diet; allergies: Allergy[]; goals: Goal[]
  daily_kcal: number | null; meals: Meal[]; notes: string | null; premium_until: string | null
}
export type Country = { code: string; name: string; region: string; currency?: string | null; menu_status?: string; menu_source?: string | null; foods?: number }
export type Settings = { price_monthly_ngn: number; price_yearly_ngn: number; price_monthly_usd: number; price_yearly_usd: number; free_ai_daily: number; premium_ai_daily: number }

export const isPremium = (p: ProfileRow | null) => !!p?.premium_until && new Date(p.premium_until) > new Date()

const num = (f: Food): Food => ({ ...f, protein_g: f.protein_g == null ? null : Number(f.protein_g), carbs_g: f.carbs_g == null ? null : Number(f.carbs_g), fat_g: f.fat_g == null ? null : Number(f.fat_g), fibre_g: f.fibre_g == null ? null : Number(f.fibre_g) })
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

// ---------- local copies, so menus still open when the connection is poor ----------
const cacheGet = <T,>(k: string): { at: number; data: T } | null => { try { const s = localStorage.getItem('cdmfood:' + k); return s ? JSON.parse(s) : null } catch { return null } }
const cacheSet = (k: string, data: unknown) => { try { localStorage.setItem('cdmfood:' + k, JSON.stringify({ at: Date.now(), data })) } catch { /* storage full or blocked */ } }
export const cachedAt = (k: string) => cacheGet(k)?.at ?? null

// ---------- profile ----------
export async function getProfile(): Promise<ProfileRow | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.from('profiles').select('id, display_name, country_code, household, diet, allergies, goals, daily_kcal, meals, notes, premium_until').eq('id', user.id).maybeSingle()
  fail(error)
  if (data) return data as ProfileRow
  // the account was made before the profile trigger existed
  const ins = await supabase.from('profiles').insert({ id: user.id }).select('id, display_name, country_code, household, diet, allergies, goals, daily_kcal, meals, notes, premium_until').single()
  fail(ins.error)
  return ins.data as ProfileRow
}
export async function saveProfile(id: string, patch: Partial<Omit<ProfileRow, 'id' | 'premium_until'>>) {
  const { error } = await supabase.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  fail(error)
}

// ---------- countries and menus ----------
export const ALL_COUNTRIES: Country[] = (COUNTRY_LIST as [string, string, string][]).map(([code, name, region]) => ({ code, name, region }))
export const countryName = (code: string | null | undefined) => ALL_COUNTRIES.find((c) => c.code === code)?.name ?? code ?? ''
export function flag(code: string | null | undefined) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '🌍'
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export async function countries(): Promise<Country[]> {
  const { data, error } = await supabase.from('country_menus').select('code, name, region, currency, menu_status, menu_source, foods').order('name')
  if (error || !data?.length) return cacheGet<Country[]>('countries')?.data ?? ALL_COUNTRIES
  cacheSet('countries', data)
  return data as Country[]
}

/** A country's catalogue. Uses the copy on this device unless `sync` is true or it is older than a day. */
export async function countryFoods(code: string, sync = false): Promise<Food[]> {
  const c = cacheGet<Food[]>('menu:' + code)
  if (!sync && c && Date.now() - c.at < 86400000 && c.data.length) return c.data
  const { data, error } = await supabase.from('foods').select(FOOD_COLS).eq('country_code', code).is('owner_id', null).order('name')
  if (error) { if (c) return c.data; throw new Error(error.message) }
  const list = (data ?? []).map((f) => num(f as Food))
  cacheSet('menu:' + code, list)
  return list
}

/** Asks CDM to prepare (or top up) a country's menu with AI. */
export const loadCountryMenu = (code: string) => callFunction<{ added: number; status: string }>('food-catalog', { action: 'load', country: code })

export async function myFoods(): Promise<Food[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('foods').select(FOOD_COLS).eq('owner_id', user.id).order('name')
  fail(error)
  return (data ?? []).map((f) => num(f as Food))
}

export async function foodsByIds(ids: string[]): Promise<Food[]> {
  const uniq = [...new Set(ids)].filter(Boolean)
  if (!uniq.length) return []
  const { data, error } = await supabase.from('foods').select(FOOD_COLS).in('id', uniq)
  fail(error)
  return (data ?? []).map((f) => num(f as Food))
}

export async function searchFoods(words: string, country: string | 'any', limit = 60): Promise<Food[]> {
  let q = supabase.from('foods').select(FOOD_COLS).limit(limit).order('name')
  if (words) q = q.ilike('name', `%${words}%`)
  if (country !== 'any') {
    const { data: { user } } = await supabase.auth.getUser()
    q = user ? q.or(`country_code.eq.${country},owner_id.eq.${user.id}`) : q.eq('country_code', country)
  }
  const { data, error } = await q
  fail(error)
  return (data ?? []).map((f) => num(f as Food))
}

export type NewFood = Omit<Food, 'id' | 'source' | 'owner_id'>
export async function saveFood(food: NewFood, id?: string): Promise<Food> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again.')
  const row = { ...food, source: 'user', owner_id: user.id }
  const q = id ? supabase.from('foods').update(row).eq('id', id) : supabase.from('foods').insert(row)
  const { data, error } = await q.select(FOOD_COLS).single()
  fail(error)
  return num(data as Food)
}
export async function deleteFood(id: string) {
  const { error } = await supabase.from('foods').delete().eq('id', id)
  fail(error)
}
export const estimateFood = (name: string, country: string | null, details: string) =>
  callFunction<{ food: NewFood }>('food-catalog', { action: 'estimate', name, country, details })

// ---------- plan ----------
export async function planRange(from: string, to: string): Promise<PlanItem[]> {
  const { data, error } = await supabase.from('plan_items').select('id, day, meal, food_id, servings, position, locked').gte('day', from).lte('day', to).order('day').order('position')
  fail(error)
  return (data ?? []).map((i) => ({ ...(i as PlanItem), servings: Number(i.servings) }))
}
export async function addPlanItems(items: PlanItem[]) {
  if (!items.length) return
  const { error } = await supabase.from('plan_items').insert(items.map(({ id: _id, ...rest }) => rest))
  fail(error)
}
export async function updatePlanItem(id: string, patch: Partial<Pick<PlanItem, 'servings' | 'locked' | 'food_id'>>) {
  const { error } = await supabase.from('plan_items').update(patch).eq('id', id)
  fail(error)
}
export async function deletePlanItem(id: string) {
  const { error } = await supabase.from('plan_items').delete().eq('id', id)
  fail(error)
}
export async function clearPlan(from: string, to: string) {
  const { error } = await supabase.from('plan_items').delete().gte('day', from).lte('day', to).eq('locked', false)
  fail(error)
}

// ---------- premium ----------
export async function getSettings(): Promise<Settings | null> {
  const { data } = await supabase.from('settings').select('price_monthly_ngn, price_yearly_ngn, price_monthly_usd, price_yearly_usd, free_ai_daily, premium_ai_daily').maybeSingle()
  return (data as Settings) ?? null
}
export const startPayment = (period: 'monthly' | 'yearly', currency: 'NGN' | 'USD') =>
  callFunction<{ url: string; reference: string }>('food-pay', { action: 'start', period, currency, return_url: `${location.origin}/pay-return` })
export const verifyPayment = (reference: string) =>
  callFunction<{ paid: boolean; premium_until?: string; status?: string }>('food-pay', { action: 'verify', reference })

// ---------- Ask AI ----------
export type AiMsg = { role: 'user' | 'assistant'; content: string }
export const askFood = (messages: AiMsg[], weekStart: string, today: string) =>
  callFunction<{ reply: string; changed: boolean; used_today: number; daily_limit: number; premium: boolean }>('food-ai', { messages, week_start: weekStart, today })
