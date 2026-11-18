// The owner's dashboard (#/owner). Only emails in the staff table can open it, after two-step sign-in.
// English only, like the other CDM owner tools.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Alert, Icon, Modal, Spinner } from '../components/ui'
import { flag } from '../lib/api'
import { owner, OwnerError, type Content, type LogRow, type Overview, type Payment, type Person, type Settings, type Whoami } from '../lib/owner'
import { needsSecondStep, startEnrol, verifiedFactor, verifyCode } from '../lib/twoStep'
import { LANG_BY_CODE } from '../i18n/languages'

const ngn = (n: number | null | undefined) => `₦${Math.round(Number(n ?? 0)).toLocaleString('en-NG')}`
const usd = (n: number | null | undefined) => { const v = Number(n ?? 0); return `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}` }
const when = (s: string | null | undefined, time = false) => (s ? new Date(s).toLocaleString('en-GB', time ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-US')
const TONE: Record<string, string> = { active: 'bg-brand-100 text-brand-800', expired: 'bg-red-100 text-red-800', free: 'bg-slate-100 text-slate-700', paid: 'bg-brand-100 text-brand-800', pending: 'bg-amber-100 text-amber-800', failed: 'bg-red-100 text-red-800' }
const Badge = ({ v }: { v: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[v] ?? 'bg-slate-100 text-slate-700'}`}>{v === 'active' ? 'Premium' : v}</span>

type Tab = 'overview' | 'customers' | 'payments' | 'ai' | 'content' | 'settings' | 'log'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'customers', label: 'Customers' }, { id: 'payments', label: 'Payments' },
  { id: 'ai', label: 'AI & costs' }, { id: 'content', label: 'Content' }, { id: 'settings', label: 'Settings' }, { id: 'log', label: 'Audit log' },
]

export default function Owner() {
  const [me, setMe] = useState<Whoami | null>(null)
  const [gate, setGate] = useState<'checking' | 'denied' | 'setup' | 'code' | 'open'>('checking')
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [person, setPerson] = useState<string | null>(null)

  const check = useCallback(async () => {
    setErr(''); setGate('checking')
    try {
      const w = await owner<Whoami>('whoami')
      setMe(w)
      if (!w.two_step_required || w.aal === 'aal2') { setGate('open'); return }
      const f = await verifiedFactor()
      setGate(f ? 'code' : 'setup')
    } catch (e) {
      setErr((e as Error).message); setGate('denied')
    }
  }, [])
  useEffect(() => { check() }, [check])

  if (gate === 'checking') return <Spinner label="Checking access…" />
  if (gate === 'denied') return <div className="mx-auto max-w-md"><Alert>{err || 'This page is for the CDM Food owner only.'}</Alert></div>
  if (gate === 'setup' || gate === 'code') return <TwoStep mode={gate} onDone={check} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Owner dashboard</h1>
          <p className="text-sm text-slate-500">Signed in as {me?.email}{me?.aal === 'aal2' ? ' · two-step sign-in ✓' : ''}</p>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1" aria-label="Owner sections">
        {TABS.map((x) => (
          <button key={x.id} type="button" aria-current={tab === x.id ? 'page' : undefined} onClick={() => setTab(x.id)}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${tab === x.id ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{x.label}</button>
        ))}
      </nav>
      {tab === 'overview' && <OverviewTab open={setPerson} />}
      {tab === 'customers' && <Customers open={setPerson} />}
      {tab === 'payments' && <Payments open={setPerson} />}
      {tab === 'ai' && <AiTab open={setPerson} />}
      {tab === 'content' && <ContentTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'log' && <LogTab />}
      <PersonModal id={person} onClose={() => setPerson(null)} />
    </div>
  )
}

// ---------- two-step sign-in ----------
function TwoStep({ mode, onDone }: { mode: 'setup' | 'code'; onDone: () => void }) {
  const [enrol, setEnrol] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (mode === 'setup') startEnrol().then(setEnrol, (e) => setErr(e.message)) }, [mode])
  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const id = mode === 'setup' ? enrol?.factorId : (await verifiedFactor())?.id
      if (!id) throw new Error('Two-step sign-in is not ready yet. Reload the page.')
      await verifyCode(id, code)
      if (await needsSecondStep()) throw new Error('That did not work. Try the newest code.')
      onDone()
    } catch (er) { setErr((er as Error).message) }
    setBusy(false)
  }
  return (
    <div className="mx-auto max-w-md card space-y-4 p-6">
      <h1 className="text-xl font-bold">{mode === 'setup' ? 'Set up two-step sign-in' : 'Two-step sign-in'}</h1>
      {mode === 'setup' ? (
        <>
          <p className="text-sm text-slate-600">The owner dashboard needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator or Authy). Scan this code with the app, then type the 6-digit number it shows.</p>
          {enrol ? <img src={enrol.qr} alt="QR code for your authenticator app" className="mx-auto h-48 w-48 rounded-xl border border-slate-200 bg-white p-2" /> : !err && <Spinner label="Preparing…" />}
          {enrol && <p className="break-all text-center text-xs text-slate-500">Can't scan? Type this key into the app: <b className="font-mono">{enrol.secret}</b></p>}
        </>
      ) : <p className="text-sm text-slate-600">Open your authenticator app and type the 6-digit code for CDM Food.</p>}
      <form onSubmit={submit} className="space-y-3">
        <input className="input text-center font-mono text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="6-digit code" autoFocus />
        {err && <Alert>{err}</Alert>}
        <button className="btn btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
      </form>
    </div>
  )
}

// ---------- small building blocks ----------
function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = useCallback(() => { setErr(''); return fn().then(setData, (e: Error) => setErr(e.message)) }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [reload])
  return { data, err, reload, setData }
}
const Tile = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' }) => (
  <div className="card p-4">
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-bold ${tone === 'warn' ? 'text-spice-600' : ''}`}>{value}</div>
    {sub && <div className="text-xs text-slate-500">{sub}</div>}
  </div>
)
const Section = ({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) => (
  <section className="card p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{title}</h2>{right}</div>
    {children}
  </section>
)

/** Daily bars for the last 30 days. */
function Bars({ data, pick, label, color }: { data: Overview['daily']; pick: (d: Overview['daily'][number]) => number; label: string; color: string }) {
  const vals = data.map(pick)
  const max = Math.max(1, ...vals)
  const W = 600, H = 120, bw = W / Math.max(1, data.length)
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-semibold text-slate-500">{label} · last 30 days · total {num(vals.reduce((a, b) => a + b, 0))}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={`${label}, last 30 days`}>
        {data.map((d, i) => { const h = (pick(d) / max) * (H - 6); return <rect key={d.day} x={i * bw + 1} y={H - h} width={bw - 2} height={Math.max(h, pick(d) ? 2 : 0)} rx="2" fill={color}><title>{`${d.day}: ${num(pick(d))}`}</title></rect> })}
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#e2e8f0" />
      </svg>
    </figure>
  )
}

// ---------- overview ----------
function OverviewTab({ open }: { open: (id: string) => void }) {
  const { data: o, err, reload } = useLoad(() => owner<Overview>('overview'))
  if (err) return <Alert>{err}</Alert>
  if (!o) return <Spinner label="Loading figures…" />
  const conv = o.users.total ? Math.round((o.money.paying_ever / o.users.total) * 1000) / 10 : 0
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500"><span>Updated {when(o.generated_at, true)}</span><button type="button" className="font-semibold text-brand-700" onClick={reload}>Refresh</button></div>
      {!o.ai.enabled && <Alert>AI help is paused for everyone. Turn it back on under AI &amp; costs.</Alert>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Money this month" value={ngn(o.money.month_ngn)} sub={`${usd(o.money.month_usd)} in dollars · ${ngn(o.money.today_ngn)} today`} />
        <Tile label="Premium now" value={num(o.users.premium)} sub={`${num(o.money.paying_ever)} have ever paid · ${conv}% of sign-ups`} />
        <Tile label="Sign-ups" value={num(o.users.total)} sub={`${o.users.today} today · ${o.users.week} this week · ${o.users.month} this month`} />
        <Tile label="Active in 7 days" value={num(o.users.active_7d)} sub={`${num(o.users.onboarded)} chose a country · ${num(o.users.with_body)} added body details`} />
        <Tile label="AI cost this month" value={usd(o.ai.cost_month_usd)} sub={`${usd(o.ai.cost_7d_usd)} in the last 7 days`} tone={o.ai.cost_month_usd > o.money.month_usd + o.money.month_ngn / 1500 ? 'warn' : undefined} />
        <Tile label="Ask AI questions" value={num(o.ai.questions_today)} sub={`today · ${num(o.ai.questions_7d)} in 7 days`} />
        <Tile label="Recipes opened" value={num(o.ai.recipes_today)} sub={`new today · ${num(o.ai.recipes_cached)} saved in total`} />
        <Tile label="Money in total" value={ngn(o.money.total_ngn)} sub={`${usd(o.money.total_usd)} · ${o.money.pending} payments pending (2 days)`} />
      </div>
      <Section title="Last 30 days">
        <div className="grid gap-4 md:grid-cols-3">
          <Bars data={o.daily} pick={(d) => d.signups} label="Sign-ups" color="#15803d" />
          <Bars data={o.daily} pick={(d) => Number(d.ngn)} label="Money (₦)" color="#f97316" />
          <Bars data={o.daily} pick={(d) => d.questions} label="Ask AI questions" color="#0ea5e9" />
        </div>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Newest sign-ups">
          {o.recent_signups.length === 0 ? <p className="text-sm text-slate-500">No sign-ups yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{o.recent_signups.map((r) => (
              <li key={r.id}><button type="button" className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50" onClick={() => open(r.id)}>
                <span>{flag(r.country)}</span><span className="font-semibold">{r.name}</span><span className="truncate text-slate-500">{r.email}</span><span className="ml-auto shrink-0 text-xs text-slate-500">{when(r.at, true)}</span></button></li>
            ))}</ul>
          )}
        </Section>
        <Section title="Newest payments">
          <PaymentList rows={o.recent_payments} open={open} />
        </Section>
        <Section title="Where people are">
          {o.countries.top.length === 0 ? <p className="text-sm text-slate-500">Nobody has chosen a country yet.</p> : (
            <ul className="space-y-1.5 text-sm">{o.countries.top.map((c) => (
              <li key={c.code} className="flex items-center gap-2"><span>{flag(c.code)}</span><span className="font-medium">{c.name}</span><span className="ml-auto text-slate-500">{num(c.users)} people · {c.foods} dishes</span></li>
            ))}</ul>
          )}
          <p className="mt-3 text-xs text-slate-500">{o.countries.with_menu} countries have a menu · {o.countries.ai_menus} menus were made by AI</p>
        </Section>
        <Section title="Languages people use">
          <ul className="space-y-1.5 text-sm">{o.languages.map((l) => (
            <li key={l.lang} className="flex items-center gap-2"><span className="font-medium">{LANG_BY_CODE.get(l.lang)?.name ?? l.lang}</span>
              <span className="ml-auto text-slate-500">{num(l.users)} people · {l.lang === 'en' ? 'original' : l.of ? `${Math.round((l.strings / l.of) * 100)}% translated` : 'not translated yet'}</span></li>
          ))}</ul>
        </Section>
      </div>
    </div>
  )
}

function PaymentList({ rows, open }: { rows: Payment[]; open: (id: string) => void }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No payments yet.</p>
  return (
    <ul className="divide-y divide-slate-100 text-sm">{rows.map((p) => (
      <li key={p.reference}><button type="button" className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-slate-50" onClick={() => p.user_id && open(p.user_id)}>
        <b>{p.currency === 'NGN' ? ngn(p.amount) : usd(p.amount)}</b><Badge v={p.status} /><span className="text-slate-500">{p.period}</span>
        <span className="truncate text-slate-500">{p.email}</span>
        <span className="ml-auto shrink-0 text-xs text-slate-500">{when(p.paid_at ?? p.at ?? p.created_at, true)}</span>
        <span className="w-full font-mono text-[11px] text-slate-400">{p.reference}</span></button></li>
    ))}</ul>
  )
}

// ---------- customers ----------
function Customers({ open }: { open: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Person[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function search(e: { preventDefault: () => void }) {
    e.preventDefault(); setBusy(true); setErr('')
    try { setRows(await owner<Person[]>('search', { q })) } catch (er) { setErr((er as Error).message) }
    setBusy(false)
  }
  return (
    <Section title="Find a customer">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <input className="input min-w-[14rem] flex-1" placeholder="Name or email (at least 2 letters)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || q.trim().length < 2}><Icon.search /> {busy ? 'Searching…' : 'Search'}</button>
      </form>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      {rows && (rows.length === 0 ? <p className="mt-3 text-sm text-slate-500">No match.</p> : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">{rows.map((r) => (
          <li key={r.id}><button type="button" className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-slate-50" onClick={() => open(r.id)}>
            <span className="font-semibold">{r.name}</span><span className="text-slate-500">{r.email}</span>
            <span className="ml-auto"><Badge v={r.access} /></span></button></li>
        ))}</ul>
      ))}
    </Section>
  )
}

function PersonModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [d, setD] = useState<Person | null>(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => { setD(null); setErr(''); setOk(''); if (id) owner<Person>('detail', { id }).then(setD, (e) => setErr(e.message)) }, [id])
  if (!id) return null
  async function act(action: 'extend' | 'pause') {
    if (action === 'pause' && !window.confirm('End this person\'s Premium now?')) return
    if (!note.trim()) { setErr('Write a short reason first (it goes in the audit log).'); return }
    setBusy(action); setErr(''); setOk('')
    try { setD(await owner<Person>(action, { id, days, note })); setOk(action === 'extend' ? `Added ${days} days of Premium.` : 'Premium ended.'); setNote('') } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }
  return (
    <Modal open title={d ? d.name : 'Customer'} onClose={onClose} wide>
      {!d ? (err ? <Alert>{err}</Alert> : <Spinner />) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact k="Plan" v={<><Badge v={d.access} /> {d.billing_period ? <span className="text-slate-500">· {d.billing_period}</span> : null}</>} />
            <Fact k="Premium until" v={when(d.period_end)} />
            <Fact k="Email" v={<span className="break-all">{d.email}</span>} />
            <Fact k="Country · language" v={`${d.country ? `${flag(d.country)} ${d.country}` : '—'} · ${LANG_BY_CODE.get(d.language ?? 'en')?.name ?? d.language}`} />
            <Fact k="Paid in total" v={`${ngn((d.paid_kobo ?? 0) / 100)}${d.paid_usd ? ` + ${usd(d.paid_usd)}` : ''}`} />
            <Fact k="Customer since" v={when(d.created_at)} />
            <Fact k="Last sign-in" v={when(d.last_seen, true)} />
            <Fact k="Ask AI (7 days)" v={num(d.ai_questions_7d)} />
            <Fact k="Meals planned (30 days)" v={`${num(d.meals_planned_30d)} · ${num(d.own_foods)} own foods`} />
          </dl>
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <p className="font-semibold">Change Premium</p>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input w-32" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days to add">{[7, 14, 30, 90, 180, 365].map((n) => <option key={n} value={n}>{n} days</option>)}</select>
              <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => act('extend')}>{busy === 'extend' ? 'Saving…' : 'Add Premium'}</button>
              <button type="button" className="btn btn-ghost text-red-700" disabled={!!busy || d.access !== 'active'} onClick={() => act('pause')}>End Premium now</button>
            </div>
            <input className="input" placeholder="Reason, e.g. paid by bank transfer / refund / promo" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <Alert>{err}</Alert>}
          {ok && <Alert tone="ok">{ok}</Alert>}
          {(d.payments ?? []).length > 0 && (
            <div><p className="mb-1 font-semibold">Payments</p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{d.payments!.map((p) => (
                <li key={p.reference} className="flex flex-wrap items-center gap-2 px-3 py-2"><b>{p.currency === 'NGN' ? ngn(p.amount) : usd(p.amount)}</b><Badge v={p.status === 'success' ? 'paid' : p.status} /><span className="text-slate-500">{p.period}</span><span className="ml-auto text-xs text-slate-500">{when(p.paid_at, true)}</span><span className="w-full font-mono text-[11px] text-slate-400">{p.reference}</span></li>
              ))}</ul></div>
          )}
        </div>
      )}
    </Modal>
  )
}
const Fact = ({ k, v }: { k: string; v: ReactNode }) => <div><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>

// ---------- payments ----------
function Payments({ open }: { open: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const { data, err } = useLoad(() => owner<Payment[]>('payments', { q: term, limit: 100 }), [term])
  return (
    <Section title="Payments" right={<form onSubmit={(e) => { e.preventDefault(); setTerm(q) }} className="flex gap-2"><input className="input w-56" placeholder="Reference or email" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-ghost"><Icon.search /></button></form>}>
      {err ? <Alert>{err}</Alert> : !data ? <Spinner /> : <PaymentList rows={data} open={open} />}
      <p className="mt-3 text-xs text-slate-500">"pending" means the person opened Paystack but the payment has not been confirmed. Paystack payments confirm on their own; if someone says they paid, open them and check the reference in Paystack.</p>
    </Section>
  )
}

// ---------- AI ----------
function AiTab({ open }: { open: (id: string) => void }) {
  const { data: o, err, reload } = useLoad(() => owner<Overview>('overview'))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  if (err) return <Alert>{err}</Alert>
  if (!o) return <Spinner />
  async function toggle() {
    const on = !o!.ai.enabled
    if (!window.confirm(on ? 'Turn AI help back on for everyone?' : 'Pause all AI help (Ask AI, recipes, new menus, translations) for everyone now?')) return
    setBusy(true); setMsg('')
    try { await owner('settings', { patch: { ai_enabled: on } }); await reload(); setMsg(on ? 'AI help is on.' : 'AI help is paused.') } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }
  return (
    <div className="space-y-4">
      <div className={`card flex flex-wrap items-center gap-3 p-4 ${o.ai.enabled ? '' : 'border-red-300 bg-red-50'}`}>
        <div className="flex-1"><p className="font-bold">AI help is {o.ai.enabled ? 'on' : 'paused'}</p><p className="text-sm text-slate-600">Emergency switch for Ask AI, recipes, new country menus and translations. Everything else keeps working.</p></div>
        <button type="button" className={`btn ${o.ai.enabled ? 'btn-ghost text-red-700' : 'btn-primary'}`} disabled={busy} onClick={toggle}>{o.ai.enabled ? 'Pause AI now' : 'Turn AI back on'}</button>
        {msg && <p className="w-full text-sm">{msg}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Cost this month" value={usd(o.ai.cost_month_usd)} sub={`${usd(o.ai.cost_7d_usd)} in 7 days (estimate)`} />
        <Tile label="Tokens in 7 days" value={`${num(Math.round((o.ai.tokens_in_7d + o.ai.tokens_out_7d) / 1000))}k`} sub={`${num(Math.round(o.ai.tokens_in_7d / 1000))}k read · ${num(Math.round(o.ai.tokens_out_7d / 1000))}k written`} />
        <Tile label="Questions in 7 days" value={num(o.ai.questions_7d)} sub={`${num(o.ai.questions_today)} today`} />
        <Tile label="New recipes in 7 days" value={num(o.ai.recipes_7d)} sub={`${num(o.ai.recipes_cached)} saved recipes are reused free`} />
      </div>
      <Section title="Heaviest users in the last 7 days">
        {o.ai.heaviest_7d.length === 0 ? <p className="text-sm text-slate-500">No AI use yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{o.ai.heaviest_7d.map((h) => (
            <li key={h.id}><button type="button" className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-slate-50" onClick={() => open(h.id)}>
              <span className="font-semibold">{h.name}</span><span className="text-slate-500">{h.email}</span>{h.premium && <Badge v="active" />}
              <span className="ml-auto text-slate-600">{num(h.questions)} questions · {num(h.recipes)} recipes · {num(Math.round(h.tokens / 1000))}k tokens</span></button></li>
          ))}</ul>
        )}
      </Section>
      <p className="text-xs text-slate-500">Costs are estimates from the token counts at {usd(o.settings.ai_cost_in_per_m)} per million tokens read and {usd(o.settings.ai_cost_out_per_m)} per million written (change these under Settings). Translations of the app are made once per language and are not counted here. Check the real bill at console.anthropic.com.</p>
    </div>
  )
}

// ---------- content ----------
function ContentTab() {
  const { data, err, reload } = useLoad(() => owner<Content>('content'))
  const [msg, setMsg] = useState('')
  if (err) return <Alert>{err}</Alert>
  if (!data) return <Spinner />
  async function promote(id: string, name: string) {
    if (!window.confirm(`Add "${name}" to the shared catalogue so everyone in its country can plan it?`)) return
    setMsg('')
    try { await owner('promote', { id }); setMsg(`"${name}" is now in the catalogue.`); reload() } catch (e) { setMsg((e as Error).message) }
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><Tile label="Catalogue dishes" value={num(data.catalogue)} /><Tile label="Foods people added" value={num(data.user_foods)} /></div>
      {msg && <Alert tone="info">{msg}</Alert>}
      <Section title="Foods people add most">
        <p className="mb-2 text-xs text-slate-500">When many people add the same dish, add it to the catalogue so everyone gets it. Check the figures first: they were typed or estimated by people and AI.</p>
        {data.popular_user_foods.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{data.popular_user_foods.map((f) => (
            <li key={f.example_id} className="flex flex-wrap items-center gap-2 py-2"><span>{flag(f.country)}</span><span className="font-semibold">{f.name}</span><span className="text-slate-500">{f.people} {f.people === 1 ? 'person' : 'people'}</span>
              <span className="ml-auto">{f.in_catalogue ? <span className="text-xs text-slate-500">in catalogue</span> : <button type="button" className="chip chip-off" onClick={() => promote(f.example_id, f.name)}><Icon.plus className="h-3.5 w-3.5" /> Add to catalogue</button>}</span></li>
          ))}</ul>
        )}
      </Section>
      <Section title="Country menus made by AI">
        {data.ai_menus.length === 0 ? <p className="text-sm text-slate-500">None yet. Menus are made the first time someone opens a country without one.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{data.ai_menus.map((m) => (
            <li key={m.code} className="flex items-center gap-2 py-2"><span>{flag(m.code)}</span><span className="font-semibold">{m.name}</span><span className="text-slate-500">{m.foods} dishes · {m.status}</span><span className="ml-auto text-xs text-slate-500">{when(m.updated_at)}</span></li>
          ))}</ul>
        )}
      </Section>
    </div>
  )
}

// ---------- settings ----------
const FIELDS: { k: keyof Settings; label: string; step?: string; hint?: string }[] = [
  { k: 'price_monthly_ngn', label: 'Premium per month (₦)' }, { k: 'price_yearly_ngn', label: 'Premium per year (₦)' },
  { k: 'price_monthly_usd', label: 'Premium per month ($)', step: '0.5' }, { k: 'price_yearly_usd', label: 'Premium per year ($)', step: '0.5' },
  { k: 'free_ai_daily', label: 'Ask AI questions a day (free)' }, { k: 'premium_ai_daily', label: 'Ask AI questions a day (Premium)' },
  { k: 'premium_recipes_daily', label: 'New recipes a day (Premium)', hint: 'Recipes already saved do not count' },
  { k: 'ai_cost_in_per_m', label: 'AI price per million tokens read ($)', step: '0.01', hint: 'Only used to estimate costs' },
  { k: 'ai_cost_out_per_m', label: 'AI price per million tokens written ($)', step: '0.01', hint: 'Only used to estimate costs' },
]
function SettingsTab() {
  const { data: o, err, setData } = useLoad(() => owner<Overview>('overview'))
  const [form, setForm] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (o) setForm(Object.fromEntries(FIELDS.map((f) => [f.k, String(o.settings[f.k])]))) }, [o])
  if (err) return <Alert>{err}</Alert>
  if (!o) return <Spinner />
  const s = o.settings
  async function save(patch: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true); setMsg(null)
    try { const after = await owner<Settings>('settings', { patch }); setData({ ...o!, settings: after }); setMsg({ tone: 'ok', text: 'Saved. The change is in the audit log.' }) } catch (e) { setMsg({ tone: 'error', text: (e as Error).message }) }
    setBusy(false)
  }
  function submit(e: { preventDefault: () => void }) {
    e.preventDefault()
    const patch: Record<string, number> = {}
    for (const f of FIELDS) { const v = Number(form[f.k]); if (!Number.isFinite(v)) { setMsg({ tone: 'error', text: `${f.label}: enter a number.` }); return } if (v !== Number(s[f.k])) patch[f.k] = v }
    if (!Object.keys(patch).length) { setMsg({ tone: 'ok', text: 'Nothing changed.' }); return }
    save(patch, patch.price_monthly_ngn || patch.price_yearly_ngn || patch.price_monthly_usd || patch.price_yearly_usd ? 'Change Premium prices? New payments use the new price straight away.' : undefined)
  }
  return (
    <div className="space-y-4">
      <Section title="Prices and limits">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.k} className="text-sm font-semibold">{f.label}
              <input className="input mt-1" type="number" step={f.step ?? '1'} min={0} value={form[f.k] ?? ''} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
              {f.hint && <span className="text-xs font-normal text-slate-500">{f.hint}</span>}
            </label>
          ))}
          <div className="sm:col-span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </Section>
      <Section title="Security">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 text-sm"><p className="font-semibold">Two-step sign-in for the owner dashboard: {s.owner_two_step ? 'on' : 'off'}</p><p className="text-slate-600">When on, the dashboard (and every change from it) needs a code from your authenticator app. Keep it on.</p></div>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => save({ owner_two_step: !s.owner_two_step }, s.owner_two_step ? 'Turn OFF two-step sign-in for the owner dashboard? Anyone with your password could then open it.' : 'Turn two-step sign-in back on?')}>{s.owner_two_step ? 'Turn off' : 'Turn on'}</button>
        </div>
      </Section>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  )
}

// ---------- audit log ----------
const ACTION_LABEL: Record<string, string> = { premium_extend: 'Added Premium', premium_pause: 'Ended Premium', settings: 'Changed settings', food_promote: 'Added a dish to the catalogue' }
function LogTab() {
  const { data, err } = useLoad(() => owner<LogRow[]>('log', { limit: 200 }))
  if (err) return <Alert>{err}</Alert>
  if (!data) return <Spinner />
  return (
    <Section title="Audit log">
      {data.length === 0 ? <p className="text-sm text-slate-500">No changes yet.</p> : (
        <ul className="divide-y divide-slate-100 text-sm">{data.map((l) => (
          <li key={l.id} className="py-2">
            <div className="flex flex-wrap items-center gap-2"><b>{ACTION_LABEL[l.action] ?? l.action}</b><span className="text-slate-500">by {l.actor}</span><span className="ml-auto text-xs text-slate-500">{when(l.at, true)}</span></div>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">{JSON.stringify(l.detail)}</pre>
          </li>
        ))}</ul>
      )}
    </Section>
  )
}

export { OwnerError }
