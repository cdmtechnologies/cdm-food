import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AskFood from './components/AskFood'
import PrefsForm from './components/PrefsForm'
import RecipeView from './components/RecipeView'
import { Alert, Icon, Modal, Spinner } from './components/ui'
import { getProfile, isPremium, verifyPayment, type ProfileRow } from './lib/api'
import { weekStart } from './lib/planner'
import { notConfigured, supabase } from './lib/supabase'
import Account from './pages/Account'
import Explore from './pages/Explore'
import Landing from './pages/Landing'
import MyFoods from './pages/MyFoods'
import Planner from './pages/Planner'
import Shopping from './pages/Shopping'

type Tab = 'plan' | 'explore' | 'mine' | 'shop' | 'account'
const TABS: { id: Tab; label: string; icon: keyof typeof Icon }[] = [
  { id: 'plan', label: 'My plan', icon: 'plan' }, { id: 'explore', label: 'Explore', icon: 'explore' }, { id: 'mine', label: 'My foods', icon: 'mine' },
  { id: 'shop', label: 'Shopping', icon: 'cart' }, { id: 'account', label: 'Account', icon: 'user' },
]
const tabFromHash = (): Tab => { const t = location.hash.replace(/^#\/?/, '').split('?')[0] as Tab; return TABS.some((x) => x.id === t) ? t : 'plan' }

export default function App() {
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

  // back from Paystack: /pay-return?reference=...
  useEffect(() => {
    if (!session || location.pathname !== '/pay-return') return
    const ref = new URLSearchParams(location.search).get('reference') ?? new URLSearchParams(location.search).get('trxref')
    history.replaceState(null, '', '/#/account')
    setTabState('account')
    if (!ref) return
    setPayNote({ tone: 'info', text: 'Checking your payment…' })
    verifyPayment(ref).then((r) => {
      setPayNote(r.paid ? { tone: 'ok', text: 'Payment received. Premium is on. Thank you!' } : { tone: 'info', text: r.status === 'abandoned' ? 'The payment was not completed. You can try again.' : 'We have not received the payment yet. If you paid, it will show here in a few minutes.' })
      loadProfile()
    }, (e) => setPayNote({ tone: 'error', text: e.message }))
  }, [session, loadProfile])

  if (notConfigured) return <div className="p-8"><Alert>CDM Food is not connected to its database yet (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing).</Alert></div>
  if (session === undefined) return <Spinner label="Opening CDM Food…" />
  if (!session) return <><Landing /><NewPassword open={recovery} onDone={() => setRecovery(false)} /></>
  if (!profile) return <div className="mx-auto max-w-md p-8">{loadErr ? <><Alert>{loadErr}</Alert><button type="button" className="btn btn-ghost mt-3" onClick={loadProfile}>Try again</button></> : <Spinner label="Loading your settings…" />}</div>

  if (!profile.country_code) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3"><img src="/icon.svg" alt="" className="h-10 w-10" /><div><h1 className="text-2xl font-bold">Welcome to CDM Food</h1><p className="text-slate-600">Tell us how you eat. You can change any of this later.</p></div></div>
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
          <button type="button" className="flex items-center gap-2" onClick={() => setTab('plan')}><img src="/icon.svg" alt="" className="h-8 w-8" /><span className="font-bold">CDM Food</span>{premium && <span className="rounded-full bg-spice-500 px-2 py-0.5 text-xs font-bold text-white">Premium</span>}</button>
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {TABS.map((t) => { const I = Icon[t.icon]; return <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${tab === t.id ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50'}`}><I />{t.label}</button> })}
          </nav>
          <span className="truncate text-sm text-slate-500 md:hidden">{profile.display_name ? `Hi, ${profile.display_name.split(' ')[0]}` : ''}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {tab === 'plan' && <Planner profile={profile} start={start} setStart={setStart} reloadKey={reloadKey} onAskAi={(prompt) => setAi({ open: true, prompt })} />}
        {tab === 'explore' && <Explore profile={profile} weekStartDate={start} onPlanned={() => setReloadKey((k) => k + 1)} />}
        {tab === 'mine' && <MyFoods profile={profile} />}
        {tab === 'shop' && <Shopping profile={profile} premium={premium} start={start} onUpgrade={upgrade} />}
        {tab === 'account' && <Account profile={profile} email={session.user.email ?? ''} payNote={payNote} onSaved={(p) => { setProfile(p); setReloadKey((k) => k + 1) }} />}
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden" aria-label="Main">
        {TABS.map((t) => { const I = Icon[t.icon]; return <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${tab === t.id ? 'text-brand-700' : 'text-slate-500'}`}><I />{t.label}</button> })}
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
    if (pw.length < 8) { setMsg({ tone: 'error', text: 'Use at least 8 characters.' }); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg({ tone: 'error', text: error.message }); else { setMsg({ tone: 'ok', text: 'Password changed.' }); setTimeout(onDone, 1200) }
  }
  return (
    <Modal open={open} title="Choose a new password" onClose={onDone}>
      <form onSubmit={save} className="space-y-3">
        <input className="input" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" autoFocus />
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </Modal>
  )
}
