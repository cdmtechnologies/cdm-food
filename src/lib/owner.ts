// Calls the cdm-control function as the signed-in owner. Owner pages are in English only.
import { supabase } from './supabase'

export class OwnerError extends Error {
  status: number; needTwoStep: boolean
  constructor(msg: string, status: number, needTwoStep: boolean) { super(msg); this.status = status; this.needTwoStep = needTwoStep }
}

export async function owner<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cdm-control', { body: { action, ...body } })
  if (error) {
    const res = (error as { context?: Response }).context
    let j: { error?: string; need_two_step?: boolean } = {}
    try { j = (await res?.json()) ?? {} } catch { /* not JSON */ }
    throw new OwnerError(j.error || error.message || 'Something went wrong.', res?.status ?? 0, !!j.need_two_step)
  }
  if (data?.error) throw new OwnerError(data.error, 400, !!data.need_two_step)
  return data?.data as T
}

export type Whoami = { email: string; role: string; two_step_required: boolean; aal: string }

export type Person = {
  id: string; name: string; email: string; access: 'active' | 'expired' | 'free'; plan?: string; period_end: string | null; created_at: string
  country?: string | null; language?: string; billing_period?: string | null; paid_kobo?: number; paid_usd?: number; last_seen?: string | null
  ai_questions_7d?: number; own_foods?: number; meals_planned_30d?: number
  payments?: { reference: string; amount: number; currency: string; status: string; period: string; paid_at: string }[]
}

export type Overview = {
  generated_at: string
  users: { total: number; today: number; week: number; month: number; active_7d: number; premium: number; onboarded: number; with_body: number }
  money: { today_ngn: number; month_ngn: number; month_usd: number; total_ngn: number; total_usd: number; paying_ever: number; pending: number }
  ai: {
    enabled: boolean; questions_today: number; recipes_today: number; questions_7d: number; recipes_7d: number
    tokens_in_7d: number; tokens_out_7d: number; cost_7d_usd: number; cost_month_usd: number; recipes_cached: number
    heaviest_7d: { id: string; name: string; email: string; questions: number; recipes: number; tokens: number; premium: boolean }[]
  }
  daily: { day: string; signups: number; questions: number; ngn: number }[]
  countries: { with_menu: number; ai_menus: number; top: { code: string; name: string; users: number; foods: number }[] }
  languages: { lang: string; users: number; strings: number; of: number | null }[]
  recent_signups: { id: string; name: string; email: string; country: string | null; at: string }[]
  recent_payments: Payment[]
  settings: Settings
}
export type Payment = { reference: string; user_id: string; email: string | null; amount: number; currency: string; period: string; status: string; at?: string; created_at?: string; paid_at?: string | null }
export type Settings = {
  price_monthly_ngn: number; price_yearly_ngn: number; price_monthly_usd: number; price_yearly_usd: number
  free_ai_daily: number; premium_ai_daily: number; premium_recipes_daily: number; ai_enabled: boolean; owner_two_step: boolean
  ai_cost_in_per_m: number; ai_cost_out_per_m: number; updated_at?: string
}
export type Content = {
  catalogue: number; user_foods: number
  popular_user_foods: { name: string; country: string | null; people: number; example_id: string; in_catalogue: boolean }[]
  ai_menus: { code: string; name: string; status: string; updated_at: string; foods: number }[]
}
export type LogRow = { id: number; at: string; actor: string; action: string; target: string | null; detail: Record<string, unknown> }
