import { createRoot } from 'react-dom/client'

const mark = 'M14 22h68v16H61v36H45V38H30v36H14V22Z', side = 'M68 49h14v25H68z'
/** The mark with a single prismatic light sweep clipped to its shape. */
function SplashMark() {
  return <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
    <defs>
      <clipPath id="mark"><path d={mark}/><path d={side}/></clipPath>
      <linearGradient id="prism" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset=".3" stopColor="#ff8a7a"/><stop offset=".45" stopColor="#ffe29a"/>
        <stop offset=".55" stopColor="#9ff0c8"/><stop offset=".7" stopColor="#9db4ff"/><stop offset="1" stopColor="#fff" stopOpacity="0"/>
      </linearGradient>
    </defs>
    <path d={mark} fill="currentColor"/>
    <path d={side} fill="currentColor" opacity=".48"/>
    <g clipPath="url(#mark)"><rect className="sweep" x="20" y="0" width="56" height="96" fill="url(#prism)" transform="skewX(-18)"/></g>
  </svg>
}

createRoot(document.getElementById('root')!).render(<SplashMark/>)
const shownAt = performance.now()
let started = false
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
// Hold, then the mark lifts away while the window fades; no empty frame between them.
Object.assign(window, { play: async () => {
  if (started) return
  started = true
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await delay(Math.max(0, 2200 - (performance.now() - shownAt)))
    document.body.classList.add('leave')
    await delay(180)
    document.body.classList.add('gone')
    await delay(420)
  }
  document.title = 'done'
} })
