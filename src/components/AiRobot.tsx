import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { canListen, canSpeak, listen, setVoicePref, speak, stopSpeaking, typedLength, voicePref } from '../lib/aiVoice'

/** The "Ask AI" robot. `body` draws the whole robot (head, arms, hands, legs) with gestures; without it, just the head.
 *  Its look follows what the assistant is doing:
 *  idle (sways, blinks and waves), listening (hand to its ear), thinking (hand to its head, eyes scan),
 *  writing (writes on a notepad) and talking (mouth moves and both hands gesture while the reply is read aloud).
 *  `still` draws it without movement. People who ask their device for less motion get a still robot. */
export type RobotState = 'idle' | 'listening' | 'thinking' | 'writing' | 'talking' | 'still'

const CSS = `
.cdmbot{display:inline-block;flex:none;overflow:visible}
.cdmbot.head .b-all{transform-box:fill-box;transform-origin:50% 100%}
.cdmbot.head .b-eyes,.cdmbot.head .b-mouth,.cdmbot.head .b-ant,.cdmbot.head .b-ear{transform-box:fill-box;transform-origin:50% 50%}
.cdmbot.head .b-wave{opacity:0}
.cdmbot.head.s-idle .b-all,.cdmbot.head.s-listening .b-all{animation:cdmb-float 3.2s ease-in-out infinite}
.cdmbot.head:not(.s-still) .b-eyes{animation:cdmb-blink 4.6s infinite}
.cdmbot.head.s-thinking .b-eyes{animation:cdmb-scan 1.3s ease-in-out infinite}
.cdmbot.head.s-thinking .b-ant{animation:cdmb-flash .5s steps(2) infinite}
.cdmbot.head.s-thinking .b-all{animation:cdmb-tilt 1.3s ease-in-out infinite}
.cdmbot.head.s-writing .b-eyes{animation:cdmb-read 1s ease-in-out infinite}
.cdmbot.head.s-writing .b-all{animation:cdmb-nod .5s ease-in-out infinite}
.cdmbot.head.s-talking .b-mouth{animation:cdmb-talk .22s ease-in-out infinite alternate}
.cdmbot.head.s-talking .b-all{animation:cdmb-nod .6s ease-in-out infinite}
.cdmbot.head.s-talking .b-wave{animation:cdmb-wave 1s ease-out infinite}
.cdmbot.head.s-talking .b-wave.w2{animation-delay:.33s}
.cdmbot.head.s-listening .b-ear{animation:cdmb-ear .8s ease-in-out infinite alternate}
.cdmbot.head.s-listening .b-wave{animation:cdmb-in 1s ease-in infinite}
.cdmbot.head.s-idle .b-ant{animation:cdmb-glow 2.4s ease-in-out infinite}
@keyframes cdmb-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6%)}}
@keyframes cdmb-tilt{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes cdmb-nod{0%,100%{transform:translateY(0)}50%{transform:translateY(-3%)}}
@keyframes cdmb-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes cdmb-scan{0%,100%{transform:translateX(-14%)}50%{transform:translateX(14%)}}
@keyframes cdmb-read{0%{transform:translate(-12%,10%)}100%{transform:translate(12%,10%)}}
@keyframes cdmb-talk{from{transform:scaleY(.35)}to{transform:scaleY(1.6)}}
@keyframes cdmb-flash{from{opacity:1}to{opacity:.25}}
@keyframes cdmb-glow{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes cdmb-ear{from{opacity:.5}to{opacity:1}}
@keyframes cdmb-wave{0%{opacity:.9;transform:scale(.7)}100%{opacity:0;transform:scale(1.25)}}
@keyframes cdmb-in{0%{opacity:0;transform:scale(1.25)}100%{opacity:.9;transform:scale(.8)}}
.cdmbot.head .b-wave{transform-box:fill-box;transform-origin:0 50%}
.cdmbot.head .b-wave.left{transform-origin:100% 50%}
.cdm-caret{display:inline-block;width:.5em;margin-left:1px;border-bottom:2px solid currentColor;animation:cdmb-flash .6s steps(2) infinite}
.cdm-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:currentColor;opacity:.6;animation:cdmb-dot 1s infinite}
.cdm-dots span:nth-child(2){animation-delay:.15s}.cdm-dots span:nth-child(3){animation-delay:.3s}
@keyframes cdmb-dot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-5px);opacity:1}}
@media (prefers-reduced-motion: reduce){.cdmbot *,.cdm-caret,.cdm-dots span{animation:none!important}}
.cdmbot.full{display:inline-block;flex:none;overflow:visible}
.cdmbot.full *{transform-box:view-box}
.cdmbot.full .b-wave{opacity:0}
.cdmbot.full .b-all{transform-origin:50px 128px}
.cdmbot.full .b-head{transform-origin:50px 56px}
.cdmbot.full .b-eyes{transform-box:fill-box;transform-origin:50% 50%}
.cdmbot.full .b-mouth{transform-box:fill-box;transform-origin:50% 50%}
.cdmbot.full .b-lua{transform-origin:31px 67px}.cdmbot.full .b-lfa{transform-origin:25px 82px}
.cdmbot.full .b-rua{transform-origin:69px 67px}.cdmbot.full .b-rfa{transform-origin:75px 82px}
.cdmbot.full .b-pad,.cdmbot.full .b-pen{opacity:0}
.cdmbot.full.s-idle .b-all{animation:cdmf-sway 4s ease-in-out infinite}
.cdmbot.full.s-idle .b-rua{animation:cdmf-wave-up 6s ease-in-out infinite}
.cdmbot.full.s-idle .b-rfa{animation:cdmf-wave-hand 6s ease-in-out infinite}
.cdmbot.full.s-idle .b-lua{animation:cdmf-swing 4s ease-in-out infinite}
.cdmbot.full:not(.s-still) .b-eyes{animation:cdmf-blink 4.6s infinite}
.cdmbot.full.s-idle .b-ant{animation:cdmf-glow 2.4s ease-in-out infinite}
.cdmbot.full.s-listening .b-lua{transform:rotate(95deg)}
.cdmbot.full.s-listening .b-lfa{transform:rotate(-248deg)}
.cdmbot.full.s-listening .b-head{animation:cdmf-tilt-l 1.6s ease-in-out infinite}
.cdmbot.full.s-listening .b-ear{animation:cdmf-ear .8s ease-in-out infinite alternate}
.cdmbot.full.s-listening .b-wave{animation:cdmf-in 1s ease-in infinite}
.cdmbot.full.s-thinking .b-rua{transform:rotate(-95deg)}
.cdmbot.full.s-thinking .b-rfa{animation:cdmf-scratch 1.2s ease-in-out infinite}
.cdmbot.full.s-thinking .b-lua{transform:rotate(-12deg)}
.cdmbot.full.s-thinking .b-lfa{transform:rotate(-100deg)}
.cdmbot.full.s-thinking .b-head{animation:cdmf-tilt-r 2s ease-in-out infinite}
.cdmbot.full.s-thinking .b-eyes{animation:cdmf-scan 1.3s ease-in-out infinite}
.cdmbot.full.s-thinking .b-ant{animation:cdmf-flash .5s steps(2) infinite}
.cdmbot.full.s-writing .b-pad,.cdmbot.full.s-writing .b-pen{opacity:1}
.cdmbot.full.s-writing .b-lua{transform:rotate(-10deg)}
.cdmbot.full.s-writing .b-lfa{transform:rotate(-80deg)}
.cdmbot.full.s-writing .b-rua{transform:rotate(22deg)}
.cdmbot.full.s-writing .b-rfa{animation:cdmf-write .45s ease-in-out infinite alternate}
.cdmbot.full.s-writing .b-head{transform:rotate(6deg) translateY(1px)}
.cdmbot.full.s-writing .b-eyes{animation:cdmf-read 1s ease-in-out infinite}
.cdmbot.full.s-talking .b-mouth{animation:cdmf-talk .22s ease-in-out infinite alternate}
.cdmbot.full.s-talking .b-lua{animation:cdmf-gest-l 1.4s ease-in-out infinite}
.cdmbot.full.s-talking .b-lfa{animation:cdmf-gest-lf 1.4s ease-in-out infinite}
.cdmbot.full.s-talking .b-rua{animation:cdmf-gest-r 1.4s ease-in-out infinite .35s}
.cdmbot.full.s-talking .b-rfa{animation:cdmf-gest-rf 1.4s ease-in-out infinite .35s}
.cdmbot.full.s-talking .b-head{animation:cdmf-nod .7s ease-in-out infinite}
.cdmbot.full.s-talking .b-wave{animation:cdmf-wv 1s ease-out infinite}
.cdmbot.full.s-talking .b-wave.w2{animation-delay:.33s}
.cdmbot.full .b-wave{transform-box:fill-box;transform-origin:0 50%}.cdmbot.full .b-wave.left{transform-origin:100% 50%}
@keyframes cdmf-sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}
@keyframes cdmf-swing{0%,100%{transform:rotate(4deg)}50%{transform:rotate(-4deg)}}
@keyframes cdmf-wave-up{0%,55%,100%{transform:rotate(0)}62%,92%{transform:rotate(-130deg)}}
@keyframes cdmf-wave-hand{0%,62%,92%,100%{transform:rotate(0)}68%,80%{transform:rotate(-35deg)}74%,86%{transform:rotate(15deg)}}
@keyframes cdmf-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes cdmf-glow{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes cdmf-tilt-l{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(-3deg)}}
@keyframes cdmf-tilt-r{0%,100%{transform:rotate(8deg)}50%{transform:rotate(4deg)}}
@keyframes cdmf-scan{0%,100%{transform:translateX(-14%)}50%{transform:translateX(14%)}}
@keyframes cdmf-flash{from{opacity:1}to{opacity:.25}}
@keyframes cdmf-ear{from{opacity:.5}to{opacity:1}}
@keyframes cdmf-in{0%{opacity:0;transform:scale(1.25)}100%{opacity:.9;transform:scale(.8)}}
@keyframes cdmf-scratch{0%,100%{transform:rotate(245deg)}50%{transform:rotate(232deg)}}
@keyframes cdmf-write{from{transform:rotate(118deg)}to{transform:rotate(132deg)}}
@keyframes cdmf-read{0%{transform:translate(-12%,12%)}100%{transform:translate(12%,12%)}}
@keyframes cdmf-talk{from{transform:scaleY(.35)}to{transform:scaleY(1.6)}}
@keyframes cdmf-nod{0%,100%{transform:rotate(0)}50%{transform:rotate(-3deg) translateY(-1px)}}
@keyframes cdmf-gest-l{0%,100%{transform:rotate(25deg)}50%{transform:rotate(60deg)}}
@keyframes cdmf-gest-lf{0%,100%{transform:rotate(-70deg)}50%{transform:rotate(-30deg)}}
@keyframes cdmf-gest-r{0%,100%{transform:rotate(-25deg)}50%{transform:rotate(-60deg)}}
@keyframes cdmf-gest-rf{0%,100%{transform:rotate(70deg)}50%{transform:rotate(30deg)}}
@keyframes cdmf-wv{0%{opacity:.9;transform:scale(.7)}100%{opacity:0;transform:scale(1.25)}}
@media (prefers-reduced-motion: reduce){.cdmbot.full *{animation:none!important}}
`
function useRobotStyles() {
  useEffect(() => {
    if (document.getElementById('cdm-robot-css')) return
    const s = document.createElement('style')
    s.id = 'cdm-robot-css'
    s.textContent = CSS
    document.head.appendChild(s)
  }, [])
}

/** The robot face. Its head takes the text colour (`currentColor`), so set the colour with a class. */
export function AiRobot({ state = 'idle', size = 40, body = false, className = '', title }: { state?: RobotState; size?: number; body?: boolean; className?: string; title?: string }) {
  useRobotStyles()
  const a11y = { role: title ? 'img' : undefined, 'aria-hidden': title ? undefined : true, 'aria-label': title }
  if (body) return (
    <svg className={`cdmbot full s-${state} ${className}`} width={Math.round((size * 100) / 140)} height={size} viewBox="0 0 100 140" {...a11y}>
      <g className="b-wave left" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 28q-3 6 0 12" /></g>
      <g className="b-wave w2 left" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 25q-4 9 0 18" /></g>
      <g className="b-wave" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M86 28q3 6 0 12" /></g>
      <g className="b-wave w2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M91 25q4 9 0 18" /></g>
      <g className="b-all">
        <rect x="37" y="98" width="10" height="24" rx="5" fill="currentColor" />
        <rect x="53" y="98" width="10" height="24" rx="5" fill="currentColor" />
        <rect x="33" y="119" width="16" height="8" rx="4" fill="#0f172a" />
        <rect x="51" y="119" width="16" height="8" rx="4" fill="#0f172a" />
        <g className="b-lua">
          <line x1="31" y1="67" x2="25" y2="82" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
          <g className="b-lfa">
            <line x1="25" y1="82" x2="24" y2="95" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
            <circle cx="24" cy="97" r="4.5" fill="#22d3ee" stroke="currentColor" strokeWidth="2" />
          </g>
        </g>
        <rect x="45" y="52" width="10" height="9" rx="3" fill="currentColor" />
        <rect x="28" y="59" width="44" height="42" rx="13" fill="currentColor" />
        <rect x="37" y="68" width="26" height="20" rx="6" fill="#0f172a" stroke="#7dd3fc" strokeOpacity=".7" strokeWidth="1.5" />
        <circle className="b-heart" cx="50" cy="78" r="4" fill="#f472b6" />
        <g className="b-pad"><rect x="34" y="80" width="24" height="17" rx="2" fill="#fff" stroke="#94a3b8" strokeWidth="1.5" /><line x1="38" y1="85" x2="54" y2="85" stroke="#cbd5e1" strokeWidth="1.5" /><line x1="38" y1="89" x2="54" y2="89" stroke="#cbd5e1" strokeWidth="1.5" /><line x1="38" y1="93" x2="48" y2="93" stroke="#cbd5e1" strokeWidth="1.5" /></g>
        <g className="b-rua">
          <line x1="69" y1="67" x2="75" y2="82" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
          <g className="b-rfa">
            <line x1="75" y1="82" x2="76" y2="95" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
            <line className="b-pen" x1="76" y1="97" x2="76" y2="106" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="76" cy="97" r="4.5" fill="#22d3ee" stroke="currentColor" strokeWidth="2" />
          </g>
        </g>
        <g className="b-head">
          <line x1="50" y1="4" x2="50" y2="13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle className="b-ant" cx="50" cy="4" r="4" fill="#22d3ee" stroke="currentColor" strokeWidth="2" />
          <rect className="b-ear" x="20" y="25" width="6" height="13" rx="3" fill="#22d3ee" stroke="currentColor" strokeWidth="2" />
          <rect className="b-ear" x="74" y="25" width="6" height="13" rx="3" fill="#22d3ee" stroke="currentColor" strokeWidth="2" />
          <rect x="25" y="12" width="50" height="42" rx="15" fill="currentColor" />
          <rect x="31" y="18" width="38" height="29" rx="10" fill="#0f172a" stroke="#7dd3fc" strokeOpacity=".7" strokeWidth="2" />
          <g className="b-eyes" fill="#5eead4"><rect x="38" y="24" width="7" height="10" rx="3.5" /><rect x="55" y="24" width="7" height="10" rx="3.5" /></g>
          <rect className="b-mouth" x="45" y="38" width="10" height="3" rx="1.5" fill="#5eead4" />
          <circle cx="35.5" cy="38" r="2" fill="#f472b6" opacity=".55" /><circle cx="64.5" cy="38" r="2" fill="#f472b6" opacity=".55" />
        </g>
      </g>
    </svg>
  )
  return (
    <svg className={`cdmbot head s-${state} ${className}`} width={size} height={size} viewBox="0 0 64 64" {...a11y}>
      <g className="b-wave left" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 30q-3 6 0 12" /></g>
      <g className="b-wave w2 left" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 27q-4 9 0 18" /></g>
      <g className="b-wave" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M58 30q3 6 0 12" /></g>
      <g className="b-wave w2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M63 27q4 9 0 18" /></g>
      <g className="b-all">
        <line x1="32" y1="8" x2="32" y2="17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle className="b-ant" cx="32" cy="7" r="4" fill="#22d3ee" stroke="currentColor" strokeWidth="2" />
        <rect className="b-ear" x="5" y="30" width="6" height="13" rx="3" fill="#22d3ee" stroke="currentColor" strokeWidth="2" />
        <rect className="b-ear" x="53" y="30" width="6" height="13" rx="3" fill="#22d3ee" stroke="currentColor" strokeWidth="2" />
        <rect x="9" y="17" width="46" height="40" rx="14" fill="currentColor" />
        <rect x="15" y="23" width="34" height="27" rx="9" fill="#0f172a" stroke="#7dd3fc" strokeOpacity=".7" strokeWidth="2" />
        <g className="b-eyes" fill="#5eead4">
          <rect x="21" y="29" width="7" height="9" rx="3.5" />
          <rect x="36" y="29" width="7" height="9" rx="3.5" />
        </g>
        <rect className="b-mouth" x="27" y="42" width="10" height="3" rx="1.5" fill="#5eead4" />
        <circle cx="19.5" cy="42" r="2" fill="#f472b6" opacity=".55" />
        <circle cx="44.5" cy="42" r="2" fill="#f472b6" opacity=".55" />
      </g>
    </svg>
  )
}

/** Three bouncing dots while the assistant thinks. */
export function ThinkingDots() {
  useRobotStyles()
  return <span className="cdm-dots" aria-hidden="true"><span /><span /><span /></span>
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Writes a new reply onto the screen letter by letter. Screen readers get the whole reply at once.
 *  Tap the text to show it all straight away. `render` lets an app format the text (for example Markdown). */
export function TypedText({ text, onDone, render }: { text: string; onDone?: () => void; render?: (t: string) => ReactNode }) {
  useRobotStyles()
  const [n, setN] = useState(() => (reducedMotion() ? text.length : 0))
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    if (reducedMotion()) { setN(text.length); doneRef.current?.(); return }
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const k = typedLength(text.length, performance.now() - start)
      setN(k)
      if (k < text.length) raf = requestAnimationFrame(tick)
      else doneRef.current?.()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text])
  const shown = text.slice(0, n)
  const typing = n < text.length
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" onClick={() => { if (typing) { setN(text.length); doneRef.current?.() } }}>
        {render ? render(shown) : shown}
        {typing && <span className="cdm-caret" />}
      </span>
    </>
  )
}

/** Voice for the chat: reading replies aloud and asking by voice. */
export function useAiVoice() {
  const [voiceOn, setVoiceOn] = useState(voicePref)
  const [speaking, setSpeaking] = useState<number | null>(null)
  const [listening, setListening] = useState(false)
  const stopListen = useRef<() => void>(() => {})
  const speakable = canSpeak()
  const listenable = canListen()

  const say = useCallback((text: string, key: number) => {
    speak(text, { onStart: () => setSpeaking(key), onEnd: () => setSpeaking((s) => (s === key ? null : s)) })
    setSpeaking(key)
  }, [])
  const hush = useCallback(() => { stopSpeaking(); setSpeaking(null) }, [])
  const toggleVoice = useCallback(() => {
    setVoiceOn((v) => { setVoicePref(!v); if (v) { stopSpeaking(); setSpeaking(null) } return !v })
  }, [])
  /** Starts listening; `onText` gets the words as they are heard, `onFinal` the finished question. */
  const startListening = useCallback((onText: (t: string) => void, onFinal: (t: string) => void, onError?: (m: string) => void) => {
    stopSpeaking(); setSpeaking(null)
    setListening(true)
    stopListen.current = listen({ onText, onError, onEnd: (t) => { setListening(false); onFinal(t) } })
  }, [])
  const stopListening = useCallback(() => { stopListen.current() }, [])
  useEffect(() => () => { stopListen.current(); stopSpeaking() }, [])
  return { voiceOn, toggleVoice, speaking, say, hush, listening, startListening, stopListening, speakable, listenable }
}

/** What the robot should be doing, from the chat's state. */
export function robotState(s: { listening?: boolean; busy?: boolean; speaking?: boolean; typing?: boolean }): RobotState {
  if (s.listening) return 'listening'
  if (s.busy) return 'thinking'
  if (s.speaking) return 'talking'
  if (s.typing) return 'writing'
  return 'idle'
}

export function SpeakerIcon({ off = false, size = 16 }: { off?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4z" />
      {off ? <><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></> : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></>}
    </svg>
  )
}

export function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="17" x2="12" y2="22" />
    </svg>
  )
}

export function StopIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
}
