import { useEffect, useRef } from 'react'
import { musicAnalyser } from './NowPlaying'

const PRISM = ['#ff8a7a', '#ffe29a', '#9ff0c8', '#9db4ff']
const POINTS = 160

type Spark = { a: number; r: number; v: number; life: number; size: number }

/**
 * The music as a ring of light behind the console, drawn like the link cable: a white-hot core along a closed line
 * that swells with the spectrum, a pearlescent prism halo around it that turns slowly, and sparks thrown outward from
 * the loudest points. It rests as a faint glowing circle when nothing plays.
 */
export function MusicRing({ shown }: { shown: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!, c = el.getContext('2d')!
    const bins = new Uint8Array(128), level = new Float32Array(POINTS), sparks: Spark[] = []
    let frame = 0, last = performance.now()
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const dt = Math.min(.05, (now - last) / 1000); last = now
      const size = Math.round(el.clientWidth * devicePixelRatio)
      if (!size) return
      if (el.width !== size) { el.width = el.height = size }
      const a = musicAnalyser()
      if (a && shown) a.getByteFrequencyData(bins); else bins.fill(0)
      const r = size / 2, inner = r * .74, reach = r * .17, turn = now / 9000, k = devicePixelRatio
      c.clearRect(0, 0, size, size)
      // The spectrum mirrored round the circle, low notes at the top and bottom, smoothed between neighbours.
      let loudest = 0
      for (let i = 0; i < POINTS; i++) {
        const half = i < POINTS / 2 ? i : POINTS - 1 - i, bin = Math.min(127, Math.floor(Math.pow(half / (POINTS / 2), 1.6) * 90) + 1)
        const target = Math.pow(bins[bin] / 255, 1.35)
        level[i] += (target - level[i]) * (target > level[i] ? .4 : .1)
        loudest = Math.max(loudest, level[i])
      }
      const radius = (i: number) => {
        const p = (i + POINTS) % POINTS, n = (i + 1 + POINTS) % POINTS, b = (i - 1 + POINTS) % POINTS
        return inner + reach * (level[p] * .5 + (level[n] + level[b]) * .25) + Math.sin(now / 700 + i * .4) * k * .6
      }
      const path = () => {
        c.beginPath()
        for (let i = 0; i <= POINTS; i++) {
          const t = i / POINTS * Math.PI * 2 - Math.PI / 2, rr = radius(i)
          const x = r + Math.cos(t) * rr, y = r + Math.sin(t) * rr
          if (i) c.lineTo(x, y); else c.moveTo(x, y)
        }
        c.closePath()
      }
      const prism = c.createConicGradient(turn, r, r)
      PRISM.concat(PRISM[0]).forEach((col, i) => prism.addColorStop(i / PRISM.length, col))
      const energy = .35 + .65 * loudest
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round'
      // Halo: the prism, wide and soft.
      path(); c.strokeStyle = prism; c.globalAlpha = .22 * energy + .06; c.lineWidth = k * 14; c.shadowColor = '#c9d6ff'; c.shadowBlur = k * 26; c.stroke()
      // Sheath: the prism, narrower and brighter.
      path(); c.globalAlpha = .55 * energy + .12; c.lineWidth = k * 4.5; c.shadowBlur = k * 10; c.stroke()
      // Core: white-hot, thin.
      path(); c.strokeStyle = '#fffaf0'; c.globalAlpha = .5 * energy + .25; c.lineWidth = k * 1.6; c.shadowColor = '#ffffff'; c.shadowBlur = k * 6; c.stroke()
      // Sparks from the loudest points, drifting outward and fading.
      for (let i = 0; i < POINTS; i += 4) if (level[i] > .45 && Math.random() < level[i] * .18) sparks.push({ a: i / POINTS * Math.PI * 2 - Math.PI / 2, r: radius(i), v: (40 + Math.random() * 90) * k, life: 1, size: (1 + Math.random() * 1.6) * k })
      c.shadowBlur = k * 8
      for (let s = sparks.length - 1; s >= 0; s--) {
        const p = sparks[s]
        p.r += p.v * dt; p.life -= dt * 1.6; p.a += dt * .15
        if (p.life <= 0) { sparks.splice(s, 1); continue }
        const x = r + Math.cos(p.a) * p.r, y = r + Math.sin(p.a) * p.r
        c.globalAlpha = p.life * .9; c.fillStyle = PRISM[Math.floor((p.a / (Math.PI * 2) + turn) * 4 + 40) % 4]; c.shadowColor = c.fillStyle
        c.beginPath(); c.arc(x, y, p.size * (0.6 + p.life * .6), 0, Math.PI * 2); c.fill()
      }
      if (sparks.length > 220) sparks.splice(0, sparks.length - 220)
      c.restore()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [shown])
  return <canvas ref={canvas} className="music-ring" data-shown={shown} aria-hidden="true"/>
}
