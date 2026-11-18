import { useEffect, useState } from 'react'
import PrefsForm from '../components/PrefsForm'
import { Alert, Icon } from '../components/ui'
import { getSettings, isPremium, startPayment, type ProfileRow, type Settings } from '../lib/api'
import { supabase } from '../lib/supabase'
import { t } from '../i18n'

const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')
const usd = (n: number) => '$' + Number(n).toFixed(2).replace(/\.00$/, '')

export default function Account({ profile, onSaved, email, payNote }: { profile: ProfileRow; onSaved: (p: ProfileRow) => void; email: string; payNote: { tone: 'ok' | 'error' | 'info'; text: string } | null }) {
  const [s, setS] = useState<Settings | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [currency, setCurrency] = useState<'NGN' | 'USD'>(profile.country_code === 'NG' ? 'NGN' : 'USD')
  const premium = isPremium(profile)
  useEffect(() => { getSettings().then(setS) }, [])

  async function pay(period: 'monthly' | 'yearly') {
    setBusy(period); setErr('')
    try { const r = await startPayment(period, currency); window.location.assign(r.url) } catch (e) { setErr((e as Error).message); setBusy('') }
  }

  return (
    <div className="space-y-6">
      <section id="premium" className="card overflow-hidden">
        <div className="bg-gradient-to-r from-brand-700 to-brand-600 p-5 text-white">
          <div className="flex items-center gap-2 text-lg font-bold"><Icon.star /> {t("CDM Food Premium")}</div>
          <p className="mt-1 text-sm text-white/90">{premium ? t("Active until {v0}. Thank you!", { v0: new Date(profile.premium_until!).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) }) : t("Recipes with cooking videos, the full shopping list and more Ask AI help every day.")}</p>
        </div>
        <div className="space-y-3 p-5">
          {payNote && <Alert tone={payNote.tone}>{payNote.text}</Alert>}
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>{t("✅ Ask AI:")} {s ? t("{v0} questions a day (free: {v1})", { v0: s.premium_ai_daily, v1: s.free_ai_daily }) : t("many more questions every day")}</li>
            <li>{t("✅ Recipes, step-by-step cooking mode and short cooking videos")}</li>
            <li>{t("✅ Full shopping list, ready to share or print")}</li>
            <li>{t("✅ Health-focused plans (diabetes, blood pressure, weight)")}</li>
            <li>{t("✅ Supports new countries and dishes")}</li>
          </ul>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">{t("Pay in")}</span>
            {(['NGN', 'USD'] as const).map((c) => <button key={c} type="button" aria-pressed={currency === c} className={`chip ${currency === c ? 'chip-on' : 'chip-off'}`} onClick={() => setCurrency(c)}>{c === 'NGN' ? t("₦ Naira") : t("$ US dollars")}</button>)}
          </div>
          {s && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn btn-ghost h-auto flex-col py-3" disabled={!!busy} onClick={() => pay('monthly')}>
                <span className="text-lg font-bold">{currency === 'NGN' ? naira(s.price_monthly_ngn) : usd(s.price_monthly_usd)}</span><span className="text-xs font-normal">{busy === 'monthly' ? t("Opening Paystack…") : premium ? t("Add a month") : t("per month")}</span>
              </button>
              <button type="button" className="btn btn-spice h-auto flex-col py-3" disabled={!!busy} onClick={() => pay('yearly')}>
                <span className="text-lg font-bold">{currency === 'NGN' ? naira(s.price_yearly_ngn) : usd(s.price_yearly_usd)}</span><span className="text-xs font-normal">{busy === 'yearly' ? t("Opening Paystack…") : premium ? t("Add a year (2 months free)") : t("per year (2 months free)")}</span>
              </button>
            </div>
          )}
          <p className="text-xs text-slate-500">{t("Secure payment by card, bank transfer or USSD through Paystack. No automatic renewals: you choose when to pay again.")}</p>
          {err && <Alert>{err}</Alert>}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">{t("My food settings")}</h2>
        <PrefsForm profile={profile} onSaved={onSaved} />
      </section>

      <section className="card space-y-3 p-5 text-sm">
        <h2 className="text-lg font-bold">{t("Account")}</h2>
        <p>{t("Signed in as")} <b>{email}</b></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>{t("Sign out")}</button>
          <a className="btn btn-ghost" href="https://wa.me/2348064068800?text=Hello%20CDM%2C%20I%20need%20help%20with%20CDM%20Food." target="_blank" rel="noopener noreferrer">{t("Help on WhatsApp")}</a>
          <a className="btn btn-ghost" href="mailto:cdmtech26@gmail.com?subject=CDM%20Food">{t("Email support")}</a>
        </div>
        <p className="text-xs text-slate-500">{t("To delete your account and all your data, email cdmtech26@gmail.com from this address. CDM Food gives general healthy-eating guidance, not medical advice. Nutrition figures are approximate.")}</p>
      </section>
    </div>
  )
}
