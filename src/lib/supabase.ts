import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the app was built without its Supabase settings (shows a friendly message instead of crashing). */
export const notConfigured = !url || !key

export const supabase = createClient(url || 'https://example.supabase.co', key || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Calls an edge function and returns its JSON, turning errors into readable messages. */
export async function callFunction<T = Record<string, unknown>>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let msg = error.message
    try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* keep message */ }
    throw new Error(msg || 'Something went wrong. Please try again.')
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    const e = new Error((data as { error: string }).error) as Error & { limited?: boolean; premiumNeeded?: boolean }
    e.limited = !!(data as { limited?: boolean }).limited
    e.premiumNeeded = !!(data as { premium_needed?: boolean }).premium_needed
    throw e
  }
  return data as T
}
