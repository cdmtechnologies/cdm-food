import Family from '../components/Family'
import { useEffect, useState } from 'react'
import { AiRobot } from '../components/AiRobot'
import { Alert } from '../components/ui'
import { flag, getSettings, type Settings } from '../lib/api'
import { supabase } from '../lib/supabase'
import { currentLang, t } from '../i18n'
import LanguagePicker from '../components/LanguagePicker'

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setMsg({ tone: 'error', text: t("Enter a valid email address.") }); return }
    if (mode !== 'reset' && pw.length < 8) { setMsg({ tone: 'error', text: t("Use a password of at least 8 characters.") }); return }
    setBusy(true)
    try {
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email: mail, password: pw, options: { data: { name: name.trim().slice(0, 80), language: currentLang() }, emailRedirectTo: location.origin } })
        if (error) throw error
        if (!data.session) setMsg({ tone: 'ok', text: t("Check your email and tap the link to confirm your account, then sign in.") })
      } else if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password: pw })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? t("Wrong email or password.") : error.message)
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: location.origin })
        if (error) throw error
        setMsg({ tone: 'ok', text: t("If that email has an account, we have sent a link to choose a new password.") })
      }
    } catch (ex) { setMsg({ tone: 'error', text: (ex as Error).message }) }
    setBusy(false)
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2"><img src="/icon.svg" alt="" className="h-9 w-9" /><span className="text-lg font-bold">{t("CDM Food")}</span></div>
        <div className="flex items-center gap-2"><LanguagePicker />
        <button type="button" className="btn btn-ghost" onClick={() => { setMode('in'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}>{t("Sign in")}</button></div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-4 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <section>
          <span className="inline-block rounded-full bg-spice-500/10 px-3 py-1 text-sm font-semibold text-spice-600">{t("Meal planner for every country")}</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t("Eat your own food,")}<br /><span className="text-brand-700">{t("planned for your health.")}</span></h1>
          <p className="mt-4 max-w-xl text-lg text-slate-700">{t("Pick your country and its dishes load. Fill your whole week in one tap, matched to your diet, allergies, budget and health goals, then ask AI to change anything.")}</p>
          <div className="mt-5 flex flex-wrap gap-1.5 text-2xl" aria-label={t("Some of the countries with menus")}>{SHOWCASE.map((c) => <span key={c}>{flag(c)}</span>)}<span className="self-center pl-1 text-sm text-slate-500">{t("and every other country")}</span></div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ['🗓️', /*i18n*/ 'Your week in one tap', /*i18n*/ 'Breakfast to dinner, with calories and nutrients for each day.'],
              ['🤖', /*i18n*/ 'Ask AI to change it', /*i18n*/ '"Make it diabetes-friendly", "cheaper meals", "more protein": done.'],
              ['⭐', /*i18n*/ 'Add any food', /*i18n*/ 'Missing your favourite? Add it, and AI estimates the nutrition.'],
              ['🛒', /*i18n*/ 'Shopping list', /*i18n*/ 'Everything to buy for the week, for your whole household.'],
            ].map(([i, ti, d]) => (
              <li key={ti} className="card p-4"><div className="text-2xl">{i}</div><div className="mt-1 font-semibold">{t(ti)}</div><div className="text-sm text-slate-600">{t(d)}</div></li>
            ))}
          </ul>
        </section>

        <section id="auth" className="card relative p-6">
          <div className="absolute -top-14 right-6 hidden sm:block"><AiRobot body size={110} state="idle" className="text-brand-700" /></div>
          <h2 className="text-2xl font-bold">{mode === 'up' ? t("Start free") : mode === 'in' ? t("Welcome back") : t("Reset your password")}</h2>
          <p className="mt-1 text-sm text-slate-600">{mode === 'up' ? t("Free forever. Premium is optional.") : mode === 'in' ? t("Sign in to see your plan.") : t("We will email you a link.")}</p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === 'up' && <label className="block"><span className="label">{t("Your name")}</span><input className="input" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>}
            <label className="block"><span className="label">{t("Email")}</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {mode !== 'reset' && <label className="block"><span className="label">{t("Password")}</span><input className="input" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>}
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? t("Please wait…") : mode === 'up' ? t("Create my free account") : mode === 'in' ? t("Sign in") : t("Send the link")}</button>
          </form>
          <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
            {mode !== 'up' ? <button type="button" className="font-semibold text-brand-700" onClick={() => { setMode('up'); setMsg(null) }}>{t("Create an account")}</button> : <button type="button" className="font-semibold text-brand-700" onClick={() => { setMode('in'); setMsg(null) }}>{t("I already have an account")}</button>}
            {mode !== 'reset' && <button type="button" className="text-slate-600" onClick={() => { setMode('reset'); setMsg(null) }}>{t("Forgot password?")}</button>}
          </div>
          <p className="mt-5 text-xs text-slate-500">{t("By continuing you agree to use CDM Food for general healthy-eating guidance only. It is not medical advice.")}</p>
        </section>
      </main>

      <HowItWorks />
      <Preview />
      <Features />
      <Pricing onStart={() => { setMode('up'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }} />
      <Faq />
      <Family self="cdmfood" />
      <section className="bg-brand-700 py-12 text-center text-white">
        <h2 className="text-3xl font-extrabold">{t('Plan your first week in two minutes')}</h2>
        <p className="mx-auto mt-2 max-w-xl text-white/85">{t('Free to start. No card needed.')}</p>
        <button type="button" className="btn mt-5 bg-white px-6 py-3 text-brand-800 hover:bg-brand-50" onClick={() => { setMode('up'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }) }}>{t('Create my free account')}</button>
      </section>
      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        <p className="mb-1"><a className="hover:text-slate-800" href="mailto:cdmtech26@gmail.com">cdmtech26@gmail.com</a> · {t('Your plan and health details are private to you. We never sell your data.')}</p>{t("CDM Food by")} <a className="font-semibold text-brand-700" href="https://cdmtechnologies.github.io" target="_blank" rel="noopener noreferrer">{t("CDM Technologies")}</a>{t(", Abuja ·")} <a href="https://wa.me/2348064068800" target="_blank" rel="noopener noreferrer">{t("WhatsApp 0806 406 8800")}</a></footer>
    </div>
  )
}

function HowItWorks() {
  const steps = [
    ['🌍', /*i18n*/ 'Pick your country', /*i18n*/ 'Its everyday dishes load, with calories and nutrients. Add your diet, allergies and health goals.'],
    ['🗓️', /*i18n*/ 'Fill your week', /*i18n*/ 'One tap plans breakfast, lunch and dinner for the week. Swap anything, or ask AI to change it.'],
    ['✅', /*i18n*/ 'Cook, tick and track', /*i18n*/ 'Follow the recipe, tick each meal you eat, and watch your weight and progress over time.'],
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="how">
      <h2 id="how" className="text-center text-3xl font-extrabold">{t('How it works')}</h2>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {steps.map(([i, ti, d], n) => (
          <li key={ti} className="card relative p-5">
            <span className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{n + 1}</span>
            <div className="text-3xl" aria-hidden="true">{i}</div>
            <h3 className="mt-2 text-lg font-bold">{t(ti)}</h3>
            <p className="mt-1 text-sm text-slate-600">{t(d)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A drawn preview of the planner (no screenshots to keep the page light). */
function Preview() {
  const meals: [string, string, string, number][] = [
    ['🍳', /*i18n*/ 'Breakfast', 'Moi moi with pap', 420], ['🍲', /*i18n*/ 'Lunch', 'Jollof rice with chicken', 650], ['🍛', /*i18n*/ 'Dinner', 'Efo riro with eba', 610],
  ]
  return (
    <section className="bg-white py-12" aria-labelledby="preview">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
        <div>
          <h2 id="preview" className="text-3xl font-extrabold">{t('Your day, at a glance')}</h2>
          <p className="mt-3 text-slate-700">{t('See every meal with its calories, how close you are to your daily target, and what you really ate. Ask AI in your own language: "make Wednesday cheaper", "I have diabetes", "I ate suya instead".')}</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>✅ {t('Plans that respect halal, vegetarian, vegan and allergies')}</li>
            <li>✅ {t('Gentle calorie targets from your height, weight and goal')}</li>
            <li>✅ {t('Shopping list for your whole household')}</li>
          </ul>
        </div>
        <div className="mx-auto w-full max-w-sm rounded-[2rem] border-8 border-slate-800 bg-brand-50 p-4 shadow-2xl" aria-hidden="true">
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">{t('Today')}</div>
            <div className="text-xl font-bold">1,680 <span className="text-sm font-medium text-slate-500">/ 1,750 kcal</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[94%] rounded-full bg-brand-600" /></div>
          </div>
          <ul className="mt-3 space-y-2">
            {meals.map(([i, m, f, k], n) => (
              <li key={m} className={`rounded-2xl border p-3 ${n === 0 ? 'border-brand-200 bg-brand-50' : 'border-slate-100 bg-white'}`}>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>{i} {t(m)}</span><span>{k} kcal</span></div>
                <div className="mt-0.5 font-semibold">{f}</div>
                {n === 0 && <div className="mt-1 text-xs font-semibold text-brand-800">✓ {t('Eaten as planned')}</div>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-brand-700 px-3 py-2 text-sm text-white"><span>🤖</span><span>{t('Make my dinners lighter this week')}</span></div>
        </div>
      </div>
    </section>
  )
}

function Features() {
  const items = [
    ['🗣️', /*i18n*/ '100+ languages', /*i18n*/ 'Use the app, Ask AI and recipes in your own language.'],
    ['❤️', /*i18n*/ 'Health goals', /*i18n*/ 'Blood sugar, blood pressure, weight, pregnancy and more. Not medical advice.'],
    ['👩‍🍳', /*i18n*/ 'Recipes and videos', /*i18n*/ 'Step-by-step cooking mode with timers, and short cooking videos (Premium).'],
    ['📈', /*i18n*/ 'Progress', /*i18n*/ 'Weigh-ins, BMI, and how closely you followed your plan.'],
    ['⭐', /*i18n*/ 'Your own foods', /*i18n*/ 'Add family recipes; AI estimates the nutrition for you.'],
    ['🔒', /*i18n*/ 'Private', /*i18n*/ 'Only you can see your plan, body details and notes.'],
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="features">
      <h2 id="features" className="text-center text-3xl font-extrabold">{t('Everything you need to eat well')}</h2>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([i, ti, d]) => <li key={ti} className="card p-5"><div className="text-2xl" aria-hidden="true">{i}</div><h3 className="mt-1 font-bold">{t(ti)}</h3><p className="mt-1 text-sm text-slate-600">{t(d)}</p></li>)}
      </ul>
    </section>
  )
}

const localCurrency = (): 'NGN' | 'USD' => {
  try { if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Africa/Lagos' || /-NG$/i.test(navigator.language)) return 'NGN' } catch { /* ignore */ }
  return 'USD'
}
function Pricing({ onStart }: { onStart: () => void }) {
  const [s, setS] = useState<Settings | null>(null)
  const [cur, setCur] = useState<'NGN' | 'USD'>(localCurrency)
  useEffect(() => { getSettings().then(setS, () => setS(null)) }, [])
  const price = (n: number | undefined) => (n == null ? '…' : cur === 'NGN' ? `₦${Number(n).toLocaleString('en-NG')}` : `$${Number(n).toLocaleString('en-US')}`)
  const free = [/*i18n*/ 'Week planner for your country', /*i18n*/ 'Diet, allergy and health filters', /*i18n*/ 'Add your own foods', /*i18n*/ 'Tick meals and track your weight', /*i18n*/ 'Ask AI a few times a day']
  const prem = [/*i18n*/ 'Everything in Free', /*i18n*/ 'Recipes, cooking mode and short videos', /*i18n*/ 'Full shopping list to share or print', /*i18n*/ 'Many more Ask AI questions every day', /*i18n*/ 'No automatic renewals: you choose when to pay']
  return (
    <section className="bg-white py-12" aria-labelledby="pricing">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="pricing" className="text-center text-3xl font-extrabold">{t('Simple prices')}</h2>
        <div className="mt-3 flex justify-center gap-2" role="group" aria-label={t('Currency')}>
          {(['NGN', 'USD'] as const).map((c) => <button key={c} type="button" aria-pressed={cur === c} className={`chip ${cur === c ? 'chip-on' : 'chip-off'}`} onClick={() => setCur(c)}>{c === 'NGN' ? '₦ Naira' : '$ US dollars'}</button>)}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <h3 className="text-xl font-bold">{t('Free')}</h3>
            <p className="mt-1 text-3xl font-extrabold">{cur === 'NGN' ? '₦0' : '$0'}</p>
            <ul className="mt-4 space-y-2 text-sm">{free.map((x) => <li key={x}>✓ {t(x)}</li>)}</ul>
            <button type="button" className="btn btn-ghost mt-6 w-full" onClick={onStart}>{t('Start free')}</button>
          </div>
          <div className="card relative border-2 border-spice-500 p-6">
            <span className="absolute -top-3 right-5 rounded-full bg-spice-500 px-3 py-0.5 text-xs font-bold text-white">{t('Premium')}</span>
            <h3 className="text-xl font-bold">{t('Premium')}</h3>
            <p className="mt-1 text-3xl font-extrabold">{price(cur === 'NGN' ? s?.price_monthly_ngn : s?.price_monthly_usd)} <span className="text-base font-medium text-slate-500">{t('per month')}</span></p>
            <p className="text-sm text-slate-600">{t('or {price} a year (2 months free)', { price: price(cur === 'NGN' ? s?.price_yearly_ngn : s?.price_yearly_usd) })}</p>
            <ul className="mt-4 space-y-2 text-sm">{prem.map((x) => <li key={x}>✓ {t(x)}</li>)}</ul>
            <button type="button" className="btn btn-spice mt-6 w-full" onClick={onStart}>{t('Start free, upgrade any time')}</button>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">{t('Secure payment by card, bank transfer or USSD through Paystack.')}</p>
      </div>
    </section>
  )
}

function Faq() {
  const qa = [
    [/*i18n*/ 'Is CDM Food medical advice?', /*i18n*/ 'No. It gives general healthy-eating guidance. If you have a medical condition or take medicine, follow your doctor or dietitian, and use CDM Food alongside their advice.'],
    [/*i18n*/ 'Which countries are covered?', /*i18n*/ 'Every country. Many have a ready menu; for the rest, our AI prepares the popular local dishes the first time someone opens that country. You can also add any dish yourself.'],
    [/*i18n*/ 'Can I use it in my language?', /*i18n*/ 'Yes. Choose from more than 100 languages with the language button. Ask AI and recipes answer in your language too.'],
    [/*i18n*/ 'How does Premium payment work?', /*i18n*/ 'You pay for a month or a year through Paystack. Nothing renews automatically, so you are never charged without choosing to pay.'],
    [/*i18n*/ 'Who can see my details?', /*i18n*/ 'Only you. Your plan, weight and health goals are private to your account. You can ask us to delete your account and data at any time.'],
  ]
  return (
    <section className="mx-auto max-w-3xl px-4 py-12" aria-labelledby="faq">
      <h2 id="faq" className="text-center text-3xl font-extrabold">{t('Questions')}</h2>
      <div className="mt-6 space-y-2">
        {qa.map(([q, a]) => (
          <details key={q} className="card group p-4">
            <summary className="cursor-pointer list-none font-semibold marker:hidden">{t(q)}<span className="float-right text-slate-400 group-open:rotate-45">+</span></summary>
            <p className="mt-2 text-sm text-slate-600">{t(a)}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
