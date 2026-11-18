// Voice and typing helpers for "Ask AI": the robot reads replies aloud with the browser's own voice
// (speechSynthesis, nothing is sent anywhere) and can take a spoken question (speech recognition, where
// the browser offers it). The typing effect is worked out here too, so it can be unit tested.

/** How many characters of a reply to show after `elapsed` ms: short replies type quickly and long ones
 *  never take more than about 6 seconds. */
export function typedLength(total: number, elapsed: number): number {
  if (total <= 0) return 0
  const duration = Math.min(6000, Math.max(700, total * 18))
  if (elapsed >= duration) return total
  return Math.max(0, Math.min(total, Math.floor((elapsed / duration) * total)))
}

/** Text as it should be spoken: no Markdown symbols or web links, and naira amounts read as words. */
export function speechText(raw: string): string {
  return String(raw ?? '')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/ > /g, ', then ')
    .replace(/[#*_`|>~]+/g, ' ')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/([^.!?:;,\s])[ \t]*\n+/g, '$1. ')
    .replace(/₦\s?([\d,]+(?:\.\d+)?)/g, '$1 naira')
    .replace(/\$\s?([\d,]+(?:\.\d+)?)/g, '$1 dollars')
    .replace(/£\s?([\d,]+(?:\.\d+)?)/g, '$1 pounds')
    .replace(/€\s?([\d,]+(?:\.\d+)?)/g, '$1 euros')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

/** Some browsers stop reading after about 15 seconds, so long replies are read in sentence-sized pieces. */
export function speechChunks(raw: string, max = 220): string[] {
  const text = speechText(raw)
  if (!text) return []
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const s0 of sentences) {
    let s = s0
    while (s.length > max) {
      const cut = s.lastIndexOf(' ', max) > 40 ? s.lastIndexOf(' ', max) : max
      if (cur) { out.push(cur.trim()); cur = '' }
      out.push(s.slice(0, cut).trim())
      s = s.slice(cut)
    }
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = '' }
    cur += s
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter(Boolean)
}

const hasWindow = () => typeof window !== 'undefined'

export const canSpeak = (): boolean =>
  hasWindow() && 'speechSynthesis' in window && typeof (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance !== 'undefined'

const PREF = 'cdm-ai-voice'
export function voicePref(): boolean {
  try { return hasWindow() && window.localStorage.getItem(PREF) === 'on' } catch { return false }
}
export function setVoicePref(on: boolean): void {
  try { window.localStorage.setItem(PREF, on ? 'on' : 'off') } catch { /* private window: the choice lasts for this visit */ }
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const base = lang.split('-')[0].toLowerCase()
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.toLowerCase().startsWith(base))
}

let run = 0
/** Reads `text` aloud. onStart runs when the voice starts, onEnd when it finishes or is stopped. */
export function speak(text: string, on: { onStart?: () => void; onEnd?: () => void } = {}): void {
  if (!canSpeak()) { on.onEnd?.(); return }
  const synth = window.speechSynthesis
  synth.cancel()
  const id = ++run
  const parts = speechChunks(text)
  if (!parts.length) { on.onEnd?.(); return }
  const lang = document.documentElement.lang || navigator.language || 'en'
  const voice = pickVoice(lang)
  let started = false
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p)
    u.lang = voice?.lang ?? lang
    if (voice) u.voice = voice
    u.rate = 1.03
    u.onstart = () => { if (!started && id === run) { started = true; on.onStart?.() } }
    const done = () => { if (id === run) { run++; on.onEnd?.() } }
    if (i === parts.length - 1) { u.onend = done }
    u.onerror = done
    synth.speak(u)
  })
}

export function stopSpeaking(): void {
  run++
  if (canSpeak()) window.speechSynthesis.cancel()
}

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null
  start: () => void; stop: () => void; abort: () => void
}
const recognitionClass = (): (new () => Recognition) | undefined => {
  if (!hasWindow()) return undefined
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
export const canListen = (): boolean => !!recognitionClass()

/** Listens for one spoken question. onText gets the words so far; onEnd gets the final words ('' if none). */
export function listen(on: { onText: (t: string) => void; onEnd: (finalText: string) => void; onError?: (msg: string) => void }): () => void {
  const R = recognitionClass()
  if (!R) { on.onError?.('Voice typing is not available in this browser.'); on.onEnd(''); return () => {} }
  const rec = new R()
  rec.lang = document.documentElement.lang || navigator.language || 'en-NG'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  let text = ''
  rec.onresult = (e) => {
    text = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').replace(/\s+/g, ' ').trim()
    on.onText(text)
  }
  rec.onerror = (e) => {
    const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? 'Allow the microphone for this site to ask by voice.'
      : e.error === 'no-speech' ? 'I did not hear anything. Tap the microphone and try again.' : ''
    if (msg) on.onError?.(msg)
  }
  rec.onend = () => on.onEnd(text)
  try { rec.start() } catch { on.onEnd('') }
  return () => { try { rec.stop() } catch { /* already stopped */ } }
}
