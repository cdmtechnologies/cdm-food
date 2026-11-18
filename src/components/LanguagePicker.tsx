import { useMemo, useState } from 'react'
import { currentLang, langStatus, setLanguage, t, useLanguage } from '../i18n'
import { countryLangs, LANG_BY_CODE, LANGS } from '../i18n/languages'
import { countryName } from '../lib/api'
import { Icon, Modal } from './ui'

const Globe = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
  </svg>
)

/** Button that shows the current language and opens the list. The country's own languages come first. */
export default function LanguagePicker({ country, onChange, compact = false }: { country?: string | null; onChange?: (code: string) => void; compact?: boolean }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const now = currentLang()
  const here = useMemo(() => countryLangs(country).filter((c) => c !== 'en' || country), [country])
  const words = q.trim().toLowerCase()
  const match = (code: string) => { const l = LANG_BY_CODE.get(code)!; return !words || l.name.toLowerCase().includes(words) || l.native.toLowerCase().includes(words) }
  const others = LANGS.filter((l) => !here.includes(l.code) && match(l.code)).sort((a, b) => a.name.localeCompare(b.name))
  const choose = (code: string) => { setOpen(false); setQ(''); setLanguage(code); onChange?.(code) }
  const cur = LANG_BY_CODE.get(now) ?? LANGS[0]

  const row = (code: string) => {
    const l = LANG_BY_CODE.get(code)!
    return (
      <li key={code}>
        <button type="button" lang={code} onClick={() => choose(code)} aria-current={code === now ? 'true' : undefined}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-slate-50 ${code === now ? 'bg-brand-50 font-semibold text-brand-800' : ''}`}>
          <span>{l.native}{l.native !== l.name && <span className="ml-2 text-xs font-normal text-slate-500" lang="en">{l.name}</span>}</span>
          {code === now && <Icon.check className="h-4 w-4" />}
        </button>
      </li>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-brand-600 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}
        aria-label={t('Language: {name}. Change language', { name: cur.native })}>
        <Globe />{compact ? cur.code.split('-')[0].toUpperCase() : cur.native}
        {langStatus() === 'loading' && <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" aria-hidden="true" />}
      </button>
      <Modal open={open} title={t('Language')} onClose={() => setOpen(false)}>
        <input className="input mb-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search languages')} aria-label={t('Search languages')} />
        {here.length > 0 && !words && (
          <>
            <h3 className="mb-1 px-1 text-xs font-semibold uppercase text-slate-500">{country ? t('Spoken in {country}', { country: countryName(country) }) : t('Suggested')}</h3>
            <ul className="mb-3">{here.map(row)}</ul>
            <h3 className="mb-1 px-1 text-xs font-semibold uppercase text-slate-500">{t('All languages')}</h3>
          </>
        )}
        <ul>{(words ? LANGS.filter((l) => match(l.code)).map((l) => l.code) : others.map((l) => l.code)).map(row)}</ul>
        <p className="mt-3 text-xs text-slate-500">{t('Translations are made by AI. Ask AI and recipes also answer in the language you choose.')}</p>
      </Modal>
    </>
  )
}

/** Shown once a country is chosen and the app is not yet in one of its languages. */
export function LanguageHint({ country, onChange }: { country: string | null; onChange: (code: string) => void }) {
  useLanguage()
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('cdmfood-lang-hint') === country } catch { return false } })
  const langs = countryLangs(country)
  const now = currentLang()
  if (!country || hidden || langs.includes(now) || langs[0] === 'en') return null
  const suggest = langs.filter((c) => c !== now).slice(0, 3)
  const dismiss = () => { setHidden(true); try { localStorage.setItem('cdmfood-lang-hint', country) } catch { /* blocked */ } }
  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
      <span className="font-semibold">{t('Use CDM Food in:')}</span>
      {suggest.map((c) => <button key={c} type="button" lang={c} className="chip chip-off" onClick={() => { setLanguage(c); onChange(c); dismiss() }}>{LANG_BY_CODE.get(c)?.native}</button>)}
      <button type="button" className="ml-auto text-slate-500 hover:text-slate-800" onClick={dismiss} aria-label={t('Close')}><Icon.x className="h-4 w-4" /></button>
    </div>
  )
}
