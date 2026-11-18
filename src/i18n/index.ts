// Translations. Every piece of text in the app is written in English inside t('...'), and that English text is the key.
// Other languages come from the ui_strings table; the first person to pick a language asks the food-i18n function to
// translate the app once with AI, and everyone after that gets it straight from the table (and from this browser's cache).
import { useSyncExternalStore } from 'react'
import STRINGS from './strings.json'
import { fromBrowser, isLang, LANG_BY_CODE } from './languages'
import { callFunction, supabase } from '../lib/supabase'

type Vars = Record<string, string | number>
let lang = 'en'
let dict: Map<string, string> = new Map()
let status: 'ready' | 'loading' | 'partial' = 'ready'
let version = 0
const subs = new Set<() => void>()
const emit = () => { version++; subs.forEach((f) => f()) }
const VERSION = String(STRINGS.length) + ':' + hash(STRINGS.join('\n'))
const KEY = 'cdmfood-lang'

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }
const fill = (s: string, v?: Vars) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s)

/** Text in the person's language. `vars` fill in {name} placeholders. */
export function t(english: string, vars?: Vars): string {
  return fill(lang === 'en' ? english : dict.get(english) ?? english, vars)
}
/** Marks text for translation where it is defined (lists of labels); translate it with t() where it is shown. */
export const N = (english: string) => english

export const currentLang = () => lang
export const locale = () => (lang === 'pcm' ? 'en-NG' : lang)
export const langStatus = () => status

/** Re-renders a component when the language changes. Use once near the top of the app. */
export function useLanguage(): string {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version)
  return lang
}

function applyDocument() {
  const l = LANG_BY_CODE.get(lang)
  document.documentElement.lang = lang
  document.documentElement.dir = l?.rtl ? 'rtl' : 'ltr'
}

/** The language saved in this browser, or the browser's own. */
export function initialLang(): string {
  try { const s = localStorage.getItem(KEY); if (isLang(s)) return s } catch { /* storage blocked */ }
  return fromBrowser(navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en'])
}

function readCache(code: string): Record<string, string> | null {
  try { const raw = localStorage.getItem(`${KEY}:${code}`); if (!raw) return null; const j = JSON.parse(raw); return j.v === VERSION ? j.d : null } catch { return null }
}
function writeCache(code: string, d: Record<string, string>) {
  try { localStorage.setItem(`${KEY}:${code}`, JSON.stringify({ v: VERSION, d })) } catch { /* full or blocked */ }
}

async function fetchTable(code: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await supabase.from('ui_strings').select('key, text').eq('lang', code).range(from, from + 999)
    if (error) throw error
    for (const r of data ?? []) out[r.key] = r.text
    if (!data || data.length < 1000) break
  }
  return out
}

let loading = 0
/** Switches the app to a language, loading (and if needed making) its translations. */
export async function setLanguage(code: string): Promise<void> {
  if (!isLang(code)) code = 'en'
  const ticket = ++loading
  try { localStorage.setItem(KEY, code) } catch { /* storage blocked */ }
  if (code === 'en') { lang = 'en'; dict = new Map(); status = 'ready'; applyDocument(); emit(); return }

  const cached = readCache(code)
  if (cached) { lang = code; dict = new Map(Object.entries(cached)); status = 'ready'; applyDocument(); emit(); return }

  status = 'loading'; emit()
  try {
    let d = await fetchTable(code)
    const missing = STRINGS.filter((s) => !(s in d)).length
    if (missing > 0) {
      if (ticket === loading) { lang = code; dict = new Map(Object.entries(d)); applyDocument(); emit() } // show what is there already
      await callFunction('food-i18n', { lang: code }).catch(() => null)
      d = await fetchTable(code)
    }
    if (ticket !== loading) return
    const complete = STRINGS.every((s) => s in d)
    lang = code; dict = new Map(Object.entries(d)); status = complete ? 'ready' : 'partial'
    if (complete) writeCache(code, d)
  } catch {
    if (ticket !== loading) return
    lang = code; status = 'partial'
  }
  applyDocument(); emit()
}
