import { useEffect, useRef, useState } from 'react'
import { getRecipe } from '../lib/api'
import { embedUrl, formatQty, minutesLabel, scaleQty, youtubeSearchUrl, type Recipe, type Video } from '../lib/recipe'
import { AiRobot } from './AiRobot'
import { Alert, Icon, Modal } from './ui'
import { t } from '../i18n'

/** Recipe, step-by-step cooking mode and short cooking videos (Premium). Opened with openRecipe() from anywhere. */
export default function RecipeView({ premium, household, onUpgrade }: { premium: boolean; household: number; onUpgrade: () => void }) {
  const [food, setFood] = useState<{ id: string; name: string } | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [needPremium, setNeedPremium] = useState(false)
  const [people, setPeople] = useState(household)
  const [cooking, setCooking] = useState(false)
  const cache = useRef(new Map<string, { recipe: Recipe; search: string }>())

  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ id: string; name: string }>).detail; if (d?.id) setFood({ id: d.id, name: d.name }) }
    window.addEventListener('cdmfood:recipe', on)
    return () => window.removeEventListener('cdmfood:recipe', on)
  }, [])

  useEffect(() => {
    if (!food) return
    setErr(''); setNeedPremium(false); setCooking(false); setPeople(household); setSearch(`how to cook ${food.name}`)
    const hit = cache.current.get(food.id)
    if (hit) { setRecipe(hit.recipe); setSearch(hit.search); return }
    setRecipe(null)
    if (!premium) { setNeedPremium(true); return }
    let live = true
    setBusy(true)
    getRecipe(food.id).then((r) => {
      if (!live || !r.recipe) return
      cache.current.set(food.id, { recipe: r.recipe, search: r.video_search ?? '' })
      setRecipe(r.recipe); if (r.video_search) setSearch(r.video_search)
    }, (e) => { if (live) { setErr(e.message); setNeedPremium(!!e.premiumNeeded) } }).finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [food, premium, household])

  const close = () => setFood(null)
  if (!food) return null

  return (
    <Modal open wide title={food.name} onClose={close}>
      {busy && (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-slate-600" role="status">
          <AiRobot body size={110} state="writing" className="text-brand-700" />
          <p>{t("Writing the recipe for you…")}</p>
          <p className="text-xs text-slate-400">{t("The first time takes a few seconds. After that it opens straight away.")}</p>
        </div>
      )}

      {needPremium && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-spice-50 p-4">
            <AiRobot body size={84} state="talking" className="shrink-0 text-brand-700" />
            <div>
              <p className="font-semibold">{t("Recipes and cooking videos are part of Premium")}</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                <li>{t("Full ingredients, sized for your household")}</li>
                <li>{t("Step-by-step cooking mode with timers that reads the steps aloud")}</li>
                <li>{t("Short cooking videos for the dish")}</li>
                <li>{t("Ask AI for any recipe and it opens here")}</li>
              </ul>
            </div>
          </div>
          <button type="button" className="btn btn-spice w-full" onClick={() => { close(); onUpgrade() }}><Icon.star /> {t("Go Premium")}</button>
          <a className="btn btn-ghost w-full" href={youtubeSearchUrl(search)} target="_blank" rel="noopener noreferrer"><Icon.external /> {t("Search videos on YouTube")}</a>
        </div>
      )}

      {err && !needPremium && <Alert>{err}</Alert>}

      {recipe && !cooking && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {recipe.total_minutes ? <span className="chip chip-off"><Icon.clock className="h-4 w-4" /> {minutesLabel(recipe.total_minutes)}</span> : null}
            <span className="flex items-center gap-1 rounded-full border border-slate-200 px-1 py-0.5">
              <button type="button" className="rounded-full p-1 hover:bg-slate-100 disabled:opacity-40" disabled={people <= 1} onClick={() => setPeople((p) => p - 1)} aria-label={t("Fewer people")}><Icon.minus /></button>
              <span className="min-w-[5.5rem] text-center font-semibold" aria-live="polite">{t('For {n} people', { n: people })}</span>
              <button type="button" className="rounded-full p-1 hover:bg-slate-100 disabled:opacity-40" disabled={people >= 20} onClick={() => setPeople((p) => p + 1)} aria-label={t("More people")}><Icon.plus /></button>
            </span>
            <button type="button" className="btn btn-primary ml-auto" onClick={() => setCooking(true)}><Icon.pot /> {t("Start cooking")}</button>
          </div>

          <Videos videos={recipe.videos} search={search} />

          <section>
            <h3 className="mb-2 font-bold">{t("Ingredients")}</h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {recipe.ingredients.map((g, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-100 px-3 py-2 has-[:checked]:bg-slate-50 has-[:checked]:text-slate-400 has-[:checked]:line-through">
                    <input type="checkbox" className="mt-1 accent-brand-700" />
                    <span><b className="font-semibold">{formatQty(scaleQty(g.qty, recipe.serves, people), g.unit)}</b> {g.item}{g.note ? <span className="text-slate-500">, {g.note}</span> : null}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-bold">{t("Steps")}</h3>
            <ol className="space-y-2">
              {recipe.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{i + 1}</span>
                  <p className="pt-0.5 text-slate-800">{s.text}{s.minutes ? <span className="ml-1 text-xs text-slate-500">({minutesLabel(s.minutes)})</span> : null}</p>
                </li>
              ))}
            </ol>
          </section>

          {recipe.tips.length > 0 && (
            <section className="rounded-2xl bg-brand-50 p-4">
              <h3 className="mb-1 font-bold">{t("Tips")}</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{recipe.tips.map((tb, i) => <li key={i}>{tb}</li>)}</ul>
            </section>
          )}
          <p className="text-xs text-slate-400">{t("Recipe written by AI. Amounts are a guide: taste as you go, and cook meat, fish and eggs right through.")}</p>
        </div>
      )}

      {recipe && cooking && <CookMode recipe={recipe} people={people} onDone={() => setCooking(false)} />}
    </Modal>
  )
}

function Videos({ videos, search }: { videos: Video[]; search: string }) {
  const [playing, setPlaying] = useState<string | null>(null)
  if (!videos.length) {
    return (
      <a className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 hover:bg-slate-50" href={youtubeSearchUrl(search)} target="_blank" rel="noopener noreferrer">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white"><Icon.play className="h-5 w-5" /></span>
        <span className="text-sm"><b>{t("Watch short cooking videos")}</b><br /><span className="text-slate-500">{t("Opens YouTube in a new tab")}</span></span>
      </a>
    )
  }
  return (
    <section>
      <h3 className="mb-2 font-bold">{t("Short videos")}</h3>
      {playing && (
        <div className="mb-3 aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe className="h-full w-full" src={embedUrl(playing) + '&autoplay=1'} title={t("Cooking video")} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" />
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {videos.map((v) => (
          <button key={v.id} type="button" onClick={() => setPlaying(v.id)} aria-pressed={playing === v.id}
            className={`w-40 shrink-0 overflow-hidden rounded-xl border text-left ${playing === v.id ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-200'}`}>
            <span className="relative block aspect-video bg-slate-200">
              <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-0 m-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"><Icon.play className="h-4 w-4" /></span>
            </span>
            <span className="line-clamp-2 block px-2 pt-1.5 text-xs font-semibold">{v.title}</span>
            <span className="block truncate px-2 pb-1.5 text-[11px] text-slate-500">{v.channel}</span>
          </button>
        ))}
      </div>
      <a className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800" href={youtubeSearchUrl(search)} target="_blank" rel="noopener noreferrer"><Icon.external className="h-3.5 w-3.5" /> {t("More on YouTube")}</a>
    </section>
  )
}

/** One step at a time, big text, timers, read aloud, and the screen kept on while cooking. */
function CookMode({ recipe, people, onDone }: { recipe: Recipe; people: number; onDone: () => void }) {
  const [n, setN] = useState(-1) // -1 = get the ingredients ready
  const [left, setLeft] = useState<number | null>(null)
  const [voice, setVoice] = useState(false)
  const steps = recipe.steps
  const step = n >= 0 ? steps[n] : null
  const speakable = typeof window !== 'undefined' && 'speechSynthesis' in window

  // keep the screen on
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => { /* not allowed: fine */ })
    return () => { lock?.release().catch(() => {}); if (speakable) speechSynthesis.cancel() }
  }, [speakable])

  useEffect(() => { setLeft(null) }, [n])
  useEffect(() => {
    if (left == null || left <= 0) return
    const tb = setTimeout(() => setLeft((s) => (s == null ? null : s - 1)), 1000)
    return () => clearTimeout(tb)
  }, [left])
  useEffect(() => { if (left === 0) ding() }, [left])

  useEffect(() => {
    if (!voice || !speakable) return
    speechSynthesis.cancel()
    const text = step ? `Step ${n + 1}. ${step.text}` : `Get ready: ${recipe.ingredients.map((g) => g.item).join(', ')}.`
    speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }, [n, voice, speakable]) // eslint-disable-line react-hooks/exhaustive-deps

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  return (
    <div className="flex min-h-[55vh] flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={n + 1} aria-label={t("Progress")}>
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${((n + 1) / steps.length) * 100}%` }} />
        </div>
        {speakable && <button type="button" onClick={() => { setVoice((v) => !v); speechSynthesis.cancel() }} aria-pressed={voice} className={`chip ${voice ? 'chip-on' : 'chip-off'}`}><Icon.speaker className="h-4 w-4" /> {voice ? t("Reading aloud") : t("Read aloud")}</button>}
      </div>

      <div className="flex flex-1 items-start gap-3" aria-live="polite">
        <AiRobot body size={90} state={left ? 'thinking' : voice ? 'talking' : 'writing'} className="hidden shrink-0 text-brand-700 sm:block" />
        {step ? (
          <div>
            <div className="text-sm font-semibold text-brand-700">{t('Step {n} of {all}', { n: n + 1, all: steps.length })}</div>
            <p className="mt-1 text-2xl font-semibold leading-snug text-slate-900">{step.text}</p>
          </div>
        ) : (
          <div>
            <div className="text-sm font-semibold text-brand-700">{t('Get everything ready · for {n} people', { n: people })}</div>
            <ul className="mt-2 space-y-1 text-lg">
              {recipe.ingredients.map((g, i) => <li key={i}><b>{formatQty(scaleQty(g.qty, recipe.serves, people), g.unit)}</b> {g.item}</li>)}
            </ul>
          </div>
        )}
      </div>

      {step?.minutes ? (
        <div className="my-4 flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
          <Icon.clock className="h-6 w-6 text-brand-700" />
          {left == null ? (
            <button type="button" className="btn btn-primary" onClick={() => setLeft(step.minutes! * 60)}>{t('Start a {time} timer', { time: minutesLabel(step.minutes) })}</button>
          ) : (
            <>
              <span className={`font-mono text-3xl font-bold ${left === 0 ? 'animate-pulse text-spice-600' : 'text-slate-900'}`} role="timer">{left === 0 ? t("Time!") : mmss(left)}</span>
              <button type="button" className="btn btn-ghost ml-auto" onClick={() => setLeft(null)}>{t("Reset")}</button>
            </>
          )}
        </div>
      ) : <div className="my-4" />}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => (n < 0 ? onDone() : setN(n - 1))}><Icon.left /> {n < 0 ? t("Back to recipe") : t("Back")}</button>
        {n < steps.length - 1
          ? <button type="button" className="btn btn-primary" onClick={() => setN(n + 1)}>{n < 0 ? t("First step") : t("Next step")} <Icon.right /></button>
          : <button type="button" className="btn btn-spice" onClick={onDone}><Icon.check /> {t("Done. Enjoy!")}</button>}
      </div>
    </div>
  )
}

function ding() {
  try {
    navigator.vibrate?.([300, 150, 300])
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[0, 0.35, 0.7].forEach((tb) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.2, ctx.currentTime + tb); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + tb + 0.3)
      o.start(ctx.currentTime + tb); o.stop(ctx.currentTime + tb + 0.3)
    })
    setTimeout(() => ctx.close(), 1500)
  } catch { /* no sound available */ }
}
