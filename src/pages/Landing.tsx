import { useState } from 'react'
import { AiRobot } from '../components/AiRobot'
import { Alert } from '../components/ui'
import { flag } from '../lib/api'
import { supabase } from '../lib/supabase'

const SHOWCASE = ['NG', 'GH', 'KE', 'ZA', 'EG', 'GB', 'US', 'IN', 'CN', 'PH', 'BR', 'MX', 'FR', 'SA', 'JM', 'ET']

export default function Landing() {
  const [mode, setMode] = useState<'up' | 'in' | 'reset'>('up')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault()
    setMsg(null)
    const mail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setMsg({ tone: 'error', text: 'Enter a valid email address.' }); return }
    if (mode !== 'reset' && pw.length < 8) { setMsg({ tone: 'error', text: 'Use a password of at least 8 characters.' }); return }
    setBusy(true)
    try {
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email: mail, password: pw, options: { data: { name: name.trim().slice(0, 80) }, emailRedirectTo: location.origin } })
        if (error) throw error
        if (!data.session) setMsg({ tone: 'ok', text: 'Check your email and tap the link to confirm your account, then sign in.' })
      } else if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password: pw })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: location.origin })
        if (error) throw error
        setMsg({ tone: 'ok', text: 'If that email has an account, we have sent a link to choose a new password.' })
      }
    } catch (ex) { setMsg({ tone: 'error', text: (ex as Error).message }) }
    setBusy(false)
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2"><img src="/icon.svg" alt="" className="h-9 w-9" /><span className="text-lg font-bold">CDM Food</span></div>
        <button type="button" className="btn btn-ghost" onClick={() => { setMode('in'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}>Sign in</button>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-4 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <section>
          <span className="inline-block rounded-full bg-spice-500/10 px-3 py-1 text-sm font-semibold text-spice-600">Meal planner for every country</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Eat your own food,<br /><span className="text-brand-700">planned for your health.</span></h1>
          <p className="mt-4 max-w-xl text-lg text-slate-700">Pick your country and its dishes load. Fill your whole week in one tap, matched to your diet, allergies, budget and health goals, then ask AI to change anything.</p>
          <div className="mt-5 flex flex-wrap gap-1.5 text-2xl" aria-label="Some of the countries with menus">{SHOWCASE.map((c) => <span key={c}>{flag(c)}</span>)}<span className="self-center pl-1 text-sm text-slate-500">and every other country</span></div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ['🗓️', 'Your week in one tap', 'Breakfast to dinner, with calories and nutrients for each day.'],
              ['🤖', 'Ask AI to change it', '"Make it diabetes-friendly", "cheaper meals", "more protein": done.'],
              ['⭐', 'Add any food', 'Missing your favourite? Add it, and AI estimates the nutrition.'],
              ['🛒', 'Shopping list', 'Everything to buy for the week, for your whole household.'],
            ].map(([i, t, d]) => (
              <li key={t} className="card p-4"><div className="text-2xl">{i}</div><div className="mt-1 font-semibold">{t}</div><div className="text-sm text-slate-600">{d}</div></li>
            ))}
          </ul>
        </section>

        <section id="auth" className="card relative p-6">
          <div className="absolute -top-14 right-6 hidden sm:block"><AiRobot body size={110} state="idle" className="text-brand-700" /></div>
          <h2 className="text-2xl font-bold">{mode === 'up' ? 'Start free' : mode === 'in' ? 'Welcome back' : 'Reset your password'}</h2>
          <p className="mt-1 text-sm text-slate-600">{mode === 'up' ? 'Free forever. Premium is optional.' : mode === 'in' ? 'Sign in to see your plan.' : 'We will email you a link.'}</p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === 'up' && <label className="block"><span className="label">Your name</span><input className="input" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>}
            <label className="block"><span className="label">Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {mode !== 'reset' && <label className="block"><span className="label">Password</span><input className="input" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>}
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? 'Please wait…' : mode === 'up' ? 'Create my free account' : mode === 'in' ? 'Sign in' : 'Send the link'}</button>
          </form>
          <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
            {mode !== 'up' ? <button type="button" className="font-semibold text-brand-700" onClick={() => { setMode('up'); setMsg(null) }}>Create an account</button> : <button type="button" className="font-semibold text-brand-700" onClick={() => { setMode('in'); setMsg(null) }}>I already have an account</button>}
            {mode !== 'reset' && <button type="button" className="text-slate-600" onClick={() => { setMode('reset'); setMsg(null) }}>Forgot password?</button>}
          </div>
          <p className="mt-5 text-xs text-slate-500">By continuing you agree to use CDM Food for general healthy-eating guidance only. It is not medical advice.</p>
        </section>
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">CDM Food by <a className="font-semibold text-brand-700" href="https://cdmtechnologies.github.io" target="_blank" rel="noopener noreferrer">CDM Technologies</a>, Abuja · <a href="https://wa.me/2348064068800" target="_blank" rel="noopener noreferrer">WhatsApp 0806 406 8800</a></footer>
    </div>
  )
}
