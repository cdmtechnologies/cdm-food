import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AskFood from './components/AskFood'
import PrefsForm from './components/PrefsForm'
import RecipeView from './components/RecipeView'
import { Alert, Icon, Modal, Spinner } from './components/ui'
import LanguagePicker, { LanguageHint } from './components/LanguagePicker'
import { getProfile, isPremium, saveProfile, verifyPayment, type ProfileRow } from './lib/api'
import { weekStart } from './lib/planner'
import { notConfigured, supabase } from './lib/supabase'
import Account from './pages/Account'
import Explore from './pages/Explore'
import Landing from './pages/Landing'
import MyFoods from './pages/MyFoods'
import Progress from './pages/Progress'
import Planner from './pages/Planner'
import Shopping from './pages/Shopping'
import { currentLang, initialLang, setLanguage, t, useLanguage } from './i18n'

type Tab = 'plan' | 'explore' | 'mine' | 'shop' | 'progress' | 'account'
const TABS: { id: Tab; label: string; icon: keyof typeof Icon }[] = [
  { id: 'plan', label: /*i18n*/ 'My plan', icon: 'plan' }, { id: 'explore', label: /*i18n*/ 'Explore', icon: 'explore' }, { id: 'mine', label: /*i18n*/ 'My foods', icon: 'mine' },
  { id: 'shop', label: /*i18n*/ 'Shopping', icon: 'cart' }, { id: 'progress', label: /*i18n*/ 'Progress', icon: 'chart' }, { id: 'account', label: /*i18n*/ 'Account', icon: 'user' },
]
const tabFromHash = (): Tab => { const tb = location.hash.replace(/^#\/?/, '').split('?')[0] as Tab; return TABS.some((x) => x.id === tb) ? tb : 'plan' }

export default function App() {
  useLanguage()
  useEffect(() => { setLanguage(initialLang()) }, [])
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [tab, setTabState] = useState<Tab>(tabFromHash)
  const [start, setStart] = useState(() => weekStart(new Date()))
  const [reloadKey, setReloadKey] = useState(0)
  const [ai, setAi] = useState<{ open: boolean; prompt?: string }>({ open: false })
  const [recovery, setRecovery] = useState(false)
  const [payNote, setPayNote] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)

  const setTab = useCallback((t: Tab) => { setTabState(t); if (location.hash !== '#/' + t) history.replaceState(null, '', '#/' + t); window.scrollTo(0, 0) }, [])
  useEffect(() => { const f = () => setTabState(tabFromHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(() => {
    setLoadErr('')
    return getProfile().then(setProfile, (e) => setLoadErr(e.message))
  }, [])
  useEffect(() => { if (session) loadProfile() }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // the language saved on the account follows the person to every device
  const profileLang = profile?.language
  useEffect(() => { if (profileLang && profileLang !== currentLang()) setLanguage(profileLang) }, [profileLang])
  const changeLang = useCallback((code: string) => {
    setProfile((p) => (p ? { ...p, language: code } : p))
    if (profile?.id) saveProfile(profile.id, { language: code }).catch(() => { /* the choice still applies on this device */ })
  }, [profile?.id])

  // back from Paystack: /pay-return?reference=...
  useEffect(() => {
    if (!session || location.pathname !== '/pay-return') return
    const ref = new URLSearchParams(location.search).get('reference') ?? new URLSearchParams(location.search).get('trxref')
    history.replaceState(null, '', '/#/account')
    setTabState('account')
    if (!ref) return
    setPayNote({ tone: 'info', text: t("Checking your payment…") })
    verifyPayment(ref).then((r) => {
      setPayNote(r.paid ? { tone: 'ok', text: t("Payment received. Premium is on. Thank you!") } : { tone: 'info', text: r.status === 'abandoned' ? t("The payment was not completed. You can try again.") : t("We have not received the payment yet. If you paid, it will show here in a few minutes.") })
      loadProfile()
    }, (e) => setPayNote({ tone: 'error', text: e.message }))
  }, [session, loadProfile])

  if (notConfigured) return <div className="p-8"><Alert>{t("CDM Food is not connected to its database yet (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing).")}</Alert></div>
  if (session === undefined) return <Spinner label={t("Opening CDM Food…")} />
  if (!session) return <><Landing /><NewPassword open={recovery} onDone={() => setRecovery(false)} /></>
  if (!profile) return <div className="mx-auto max-w-md p-8">{loadErr ? <><Alert>{loadErr}</Alert><button type="button" className="btn btn-ghost mt-3" onClick={loadProfile}>{t("Try again")}</button></> : <Spinner label={t("Loading your settings…")} />}</div>

  if (!profile.country_code) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-3 flex justify-end"><LanguagePicker country={profile.country_code} onChange={changeLang} /></div>
        <div className="mb-6 flex items-center gap-3"><img src="/icon.svg" alt="" className="h-10 w-10" /><div><h1 className="text-2xl font-bold">{t("Welcome to CDM Food")}</h1><p className="text-slate-600">{t("Tell us how you eat. You can change any of this later.")}</p></div></div>
        <div className="card p-5"><PrefsForm first profile={profile} onSaved={(p) => { setProfile(p); setTab('plan') }} /></div>
        <NewPassword open={recovery} onDone={() => setRecovery(false)} />
      </div>
    )
  }

  const premium = isPremium(profile)
  const upgrade = () => { setAi({ open: false }); setTab('account'); setTimeout(() => document.getElementById('premium')?.scrollIntoView({ behavior: 'smooth' }), 50) }

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button type="button" className="flex items-center gap-2" onClick={() => setTab('plan')}><img src="/icon.svg" alt="" className="h-8 w-8" /><span className="font-bold">{t("CDM Food")}</span>{premium && <span className="rounded-full bg-spice-500 px-2 py-0.5 text-xs font-bold text-white">{t("Premium")}</span>}</button>
          <nav className="hidden gap-1 md:flex" aria-label={t("Main")}>
            {TABS.map((tb) => { const I = Icon[tb.icon]; return <button key={tb.id} type="button" aria-current={tab === tb.id ? 'page' : undefined} onClick={() => setTab(tb.id)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${tab === tb.id ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50'}`}><I />{t(tb.label)}</button> })}
          </nav>
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-slate-500 md:hidden">{profile.display_name ? t("Hi, {v0}", { v0: profile.display_name.split(' ')[0] }) : ''}</span>
            <LanguagePicker compact country={profile.country_code} onChange={changeLang} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        <LanguageHint country={profile.country_code} onChange={changeLang} />
        {tab === 'plan' && <Planner profile={profile} start={start} setStart={setStart} reloadKey={reloadKey} onAskAi={(prompt) => setAi({ open: true, prompt })} />}
        {tab === 'explore' && <Explore profile={profile} weekStartDate={start} onPlanned={() => setReloadKey((k) => k + 1)} />}
        {tab === 'mine' && <MyFoods profile={profile} />}
        {tab === 'shop' && <Shopping profile={profile} premium={premium} start={start} onUpgrade={upgrade} />}
        {tab === 'progress' && <Progress profile={profile} onSaved={(p) => { setProfile(p); setReloadKey((k) => k + 1) }} />}
        {tab === 'account' && <Account profile={profile} email={session.user.email ?? ''} payNote={payNote} onSaved={(p) => { setProfile(p); setReloadKey((k) => k + 1) }} />}
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white md:hidden" aria-label={t("Main")}>
        {TABS.map((tb) => { const I = Icon[tb.icon]; return <button key={tb.id} type="button" aria-current={tab === tb.id ? 'page' : undefined} onClick={() => setTab(tb.id)} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold leading-tight ${tab === tb.id ? 'text-brand-700' : 'text-slate-500'}`}><I />{t(tb.label)}</button> })}
      </nav>

      <AskFood open={ai.open} prompt={ai.prompt} onOpen={() => setAi({ open: true })} onClose={() => setAi({ open: false })} weekStart={`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`}
        onChanged={() => { setReloadKey((k) => k + 1); loadProfile() }} onUpgrade={upgrade} />
      <RecipeView premium={premium} household={profile.household} onUpgrade={upgrade} />
      <NewPassword open={recovery} onDone={() => setRecovery(false)} />
    </div>
  )
}

function NewPassword({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  async function save(e: { preventDefault: () => void }) {
    e.preventDefault()
    if (pw.length < 8) { setMsg({ tone: 'error', text: t("Use at least 8 characters.") }); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg({ tone: 'error', text: error.message }); else { setMsg({ tone: 'ok', text: t("Password changed.") }); setTimeout(onDone, 1200) }
  }
  return (
    <Modal open={open} title={t("Choose a new password")} onClose={onDone}>
      <form onSubmit={save} className="space-y-3">
        <input className="input" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} aria-label={t("New password")} autoFocus />
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? t("Saving…") : t("Save password")}</button>
      </form>
    </Modal>
  )
}
