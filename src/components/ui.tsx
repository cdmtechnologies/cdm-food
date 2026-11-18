import { useEffect, useRef, type ReactNode } from 'react'
import { TAG_LABEL, type Food } from '../lib/planner'

const I = (d: ReactNode, size = 18) => ({ className = '' }: { className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{d}</svg>
)
export const Icon = {
  plan: I(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  explore: I(<><circle cx="12" cy="12" r="10" /><path d="m16 8-2 6-6 2 2-6z" /></>),
  mine: I(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  cart: I(<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>),
  user: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  plus: I(<path d="M12 5v14M5 12h14" />),
  minus: I(<path d="M5 12h14" />),
  x: I(<path d="M18 6 6 18M6 6l12 12" />),
  left: I(<path d="m15 18-6-6 6-6" />),
  right: I(<path d="m9 18 6-6-6-6" />),
  lock: I(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  unlock: I(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>),
  swap: I(<><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>),
  trash: I(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>),
  sparkle: I(<><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /></>),
  search: I(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
  sync: I(<><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>),
  check: I(<path d="M20 6 9 17l-5-5" />),
  print: I(<><path d="M6 9V2h12v7" /><rect x="6" y="14" width="12" height="8" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /></>),
  copy: I(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  star: I(<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />),
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />{label}
    </div>
  )
}

export function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><Icon.x /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'ok' | 'info' }) {
  const c = tone === 'ok' ? 'bg-brand-50 text-brand-800 border-brand-200' : tone === 'info' ? 'bg-sky-50 text-sky-900 border-sky-200' : 'bg-red-50 text-red-800 border-red-200'
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${c}`}>{children}</div>
}

const CONTAINS = new Set(['meat', 'poultry', 'fish', 'shellfish', 'pork', 'dairy', 'egg', 'nuts', 'gluten', 'soy', 'sesame', 'alcohol'])
export function Tags({ food, max = 6 }: { food: Food; max?: number }) {
  const good = food.tags.filter((t) => !CONTAINS.has(t))
  const has = food.tags.filter((t) => CONTAINS.has(t))
  return (
    <div className="flex flex-wrap gap-1">
      {good.slice(0, max).map((t) => <span key={t} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">{TAG_LABEL[t] ?? t}</span>)}
      {has.slice(0, max).map((t) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{TAG_LABEL[t] ?? t}</span>)}
    </div>
  )
}

export const kcal = (n: number | null | undefined) => (n == null ? '–' : `${Math.round(n).toLocaleString()} kcal`)
export const cost = (n: number | null | undefined) => (n ? ['', 'Budget', 'Moderate', 'Special'][n] ?? '' : '')
