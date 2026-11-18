import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askFood, openRecipe, type AiMsg } from '../lib/api'
import { iso } from '../lib/planner'
import { AiRobot, MicIcon, robotState, SpeakerIcon, StopIcon, ThinkingDots, TypedText, useAiVoice, type RobotState } from './AiRobot'
import { Icon } from './ui'
import { t } from '../i18n'

/** Ask AI in CDM Food: changes the plan on request and answers food questions, with the animated robot. */
type Msg = AiMsg & { recipe?: { food_id: string; name: string } | null }
let memory: Msg[] = []

const STATUS: Record<RobotState, string> = {
  idle: 'Plans and changes your meals', still: 'Plans and changes your meals',
  listening: 'Listening…', thinking: 'Working on it…', writing: 'Writing…', talking: 'Speaking…',
}
export const AI_STARTERS = [
  /*i18n*/ 'Fill this week with healthy meals from my country',
  /*i18n*/ 'Make my week suitable for diabetes',
  /*i18n*/ 'I want cheaper meals this week',
  /*i18n*/ 'Swap Wednesday dinner for something lighter',
  /*i18n*/ 'Add more protein to my breakfasts',
  /*i18n*/ "How do I cook today's dinner?",
]

export default function AskFood({ open, onOpen, onClose, weekStart, onChanged, onUpgrade, prompt }: {
  open: boolean; onOpen: () => void; onClose: () => void; weekStart: string; onChanged: () => void; onUpgrade: () => void; prompt?: string
}) {
  const [msgs, setMsgs] = useState<Msg[]>(memory)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [limited, setLimited] = useState(false)
  const [left, setLeft] = useState('')
  const [typing, setTyping] = useState<number | null>(null)
  const v = useAiVoice()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const state = robotState({ listening: v.listening, busy, speaking: v.speaking !== null, typing: typing !== null })

  useEffect(() => { memory = msgs }, [msgs])
  useEffect(() => { if (open) { inputRef.current?.focus(); if (prompt) setText(prompt) } else { v.hush(); v.stopListening() } }, [open, prompt]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy, typing])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function ask(q?: string, spoken = false) {
    const question = (q ?? text).trim()
    if (!question || busy) return
    setErr(''); setLimited(false)
    v.hush()
    const next: Msg[] = [...msgs, { role: 'user', content: question }]
    setMsgs(next); setText(''); setBusy(true)
    try {
      const r = await askFood(next.map(({ role, content }) => ({ role, content })), weekStart, iso(new Date()))
      const at = next.length
      setMsgs([...next, { role: 'assistant', content: r.reply, recipe: r.recipe ?? null }])
      if (r.recipe) { const rc = r.recipe; setTimeout(() => { onClose(); openRecipe({ id: rc.food_id, name: rc.name }) }, 1800) }
      setTyping(at)
      if (v.voiceOn || spoken) v.say(r.reply, at)
      if (r.changed) onChanged()
      if (r.daily_limit) setLeft(`${Math.max(0, r.daily_limit - (r.used_today ?? 0))} questions left today`)
    } catch (e) {
      const ex = e as Error & { limited?: boolean }
      setErr(ex.message); setLimited(!!ex.limited)
      setMsgs(msgs); setText(question)
    } finally { setBusy(false) }
  }

  function askByVoice() {
    if (v.listening) { v.stopListening(); return }
    setErr('')
    v.startListening((tb) => setText(tb), (tb) => { if (tb.trim()) ask(tb, true) }, setErr)
  }
  const lastReply = msgs.map((m) => m.role).lastIndexOf('assistant')

  return (
    <>
      <button type="button" onClick={open ? onClose : onOpen} aria-expanded={open} aria-controls="cdm-food-ai"
        className="no-print fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-brand-700 py-2 pl-2 pr-4 text-sm font-semibold text-white shadow-lg hover:bg-brand-800 md:bottom-5">
        {open ? <span className="m-1.5"><Icon.x /></span> : <AiRobot size={30} state={busy ? 'thinking' : 'idle'} className="text-white" />}
        {open ? t("Close") : t("Ask AI")}
      </button>
      {open && createPortal(
        <section id="cdm-food-ai" role="dialog" aria-label={t("Ask AI, the CDM Food assistant")}
          className="no-print fixed bottom-36 right-3 z-50 flex max-h-[min(660px,calc(100vh-10rem))] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl md:bottom-20">
          <header className="flex items-center justify-between gap-2 bg-brand-700 px-4 py-1.5 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <AiRobot body size={96} state={state} className="text-white" />
              <div className="min-w-0">
                <div className="font-semibold">{t("Ask AI")}</div>
                <div className="truncate text-xs opacity-90" aria-live="polite">{STATUS[state]}</div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 text-sm">
              {v.speakable && (
                <button type="button" onClick={v.toggleVoice} aria-pressed={v.voiceOn} title={v.voiceOn ? t("Voice on: replies are read aloud") : t("Voice off: tap to hear replies")}
                  aria-label={v.voiceOn ? t("Turn voice off") : t("Turn voice on")} className={`rounded-lg border border-white/50 px-2 py-1 hover:bg-white/10 ${v.voiceOn ? 'bg-white/20' : ''}`}>
                  <SpeakerIcon off={!v.voiceOn} />
                </button>
              )}
              {msgs.length > 0 && <button type="button" onClick={() => { v.hush(); setTyping(null); setMsgs([]); setErr('') }} className="rounded-lg border border-white/50 px-2 py-1 hover:bg-white/10">{t("New chat")}</button>}
            </div>
          </header>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm" aria-live="polite">
            {msgs.length === 0 && (
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <AiRobot size={52} state={v.listening ? 'listening' : 'idle'} className="text-brand-700" />
                  <p className="text-slate-600">{t("Hi! Tell me how you want to eat and I will change your plan. For example:")}</p>
                </div>
                <div className="flex flex-col gap-2">
                  {AI_STARTERS.map((s) => <button key={s} type="button" onClick={() => ask(t(s))} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-slate-700 hover:border-brand-600 hover:bg-brand-50">{t(s)}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => m.role === 'user' ? (
              <div key={i} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-brand-700 px-3 py-2 text-white">{m.content}</div></div>
            ) : (
              <div key={i} className="flex items-end gap-2">
                <AiRobot size={30} className="text-brand-700" state={i !== lastReply ? 'still' : v.speaking === i ? 'talking' : typing === i ? 'writing' : 'still'} />
                <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-slate-800">
                  {typing === i ? <TypedText text={m.content} onDone={() => setTyping((tb) => (tb === i ? null : tb))} /> : <><span className="sr-only">{t("Ask AI:")} </span>{m.content}</>}
                  {m.recipe && typing !== i && (
                    <button type="button" onClick={() => { onClose(); openRecipe({ id: m.recipe!.food_id, name: m.recipe!.name }) }} className="btn btn-primary mt-2 w-full py-1.5 text-xs"><Icon.pot className="h-4 w-4" /> {t("Open recipe:")} {m.recipe.name}</button>
                  )}
                  {v.speakable && typing !== i && (
                    <button type="button" onClick={() => (v.speaking === i ? v.hush() : v.say(m.content, i))} className="mt-1 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                      {v.speaking === i ? <><StopIcon /> {t("Stop")}</> : <><SpeakerIcon size={14} /> {t("Listen")}</>}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-end gap-2">
                <AiRobot size={30} state="thinking" className="text-brand-700" />
                <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2.5 text-slate-500"><ThinkingDots /><span className="sr-only">{t("Working")}</span></div>
              </div>
            )}
            {err && (
              <div role="alert" className="text-red-700">
                {err}
                {limited && <button type="button" onClick={onUpgrade} className="btn btn-spice mt-2 w-full"><Icon.star /> {t("Go Premium")}</button>}
              </div>
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask() }} className="border-t border-slate-200 p-3">
            <div className="flex items-end gap-2">
              <label htmlFor="cdm-food-q" className="sr-only">{t("Your question")}</label>
              <textarea id="cdm-food-q" ref={inputRef} rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
                placeholder={v.listening ? t("Listening… speak now") : t("Ask or tell me what to change…")} className="input min-h-[2.75rem] flex-1 resize-none" />
              {v.listenable && (
                <button type="button" onClick={askByVoice} aria-pressed={v.listening} disabled={busy} aria-label={v.listening ? t("Stop listening") : t("Ask by voice")} title={t("Ask by voice (uses your browser's speech service)")}
                  className={`rounded-xl border p-2.5 disabled:opacity-50 ${v.listening ? 'animate-pulse border-red-300 bg-red-50 text-red-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><MicIcon /></button>
              )}
              <button className="rounded-xl bg-brand-700 p-2.5 text-white hover:bg-brand-800 disabled:opacity-50" disabled={busy || !text.trim()} aria-label={t("Send")}><Icon.right /></button>
            </div>
            <p className="mt-2 text-xs text-slate-400">{t("AI can make mistakes and is not medical advice.")}{left && ` ${left}.`}</p>
          </form>
        </section>,
        document.body,
      )}
    </>
  )
}
