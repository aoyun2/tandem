import { useEffect, useRef } from 'react'
import { musicAnalyser } from './NowPlaying'

const PRISM = ['#ff8a7a', '#ffe29a', '#9ff0c8', '#9db4ff']

/**
 * The music as a ring behind the console: bars around a circle rise with the spectrum, coloured with the splash
 * screen's pearlescent prism, which turns slowly. It rests as a faint circle when nothing plays.
 */
export function MusicRing({ shown }: { shown: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!, c = el.getContext('2d')!
    const bins = new Uint8Array(128), bars = 96, level = new Float32Array(bars)
    let frame = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const size = el.clientWidth * devicePixelRatio
      if (!size) return
      if (el.width !== size) { el.width = el.height = size }
      const a = musicAnalyser()
      if (a && shown) a.getByteFrequencyData(bins); else bins.fill(0)
      const r = size / 2, inner = r * .78, reach = r * .2, turn = now / 9000
      c.clearRect(0, 0, size, size)
      const prism = c.createConicGradient(turn, r, r)
      PRISM.concat(PRISM[0]).forEach((col, i) => prism.addColorStop(i / PRISM.length, col))
      // The resting circle, faint.
      c.globalAlpha = .18; c.strokeStyle = prism; c.lineWidth = devicePixelRatio * 1.5
      c.beginPath(); c.arc(r, r, inner, 0, Math.PI * 2); c.stroke()
      c.globalAlpha = .9; c.lineCap = 'round'; c.lineWidth = Math.max(2, size / 260)
      c.shadowColor = '#c9d6ff'; c.shadowBlur = size / 90
      for (let b = 0; b < bars; b++) {
        // Mirror the spectrum round the circle so low notes sit at the top and bottom.
        const half = b < bars / 2 ? b : bars - 1 - b, bin = Math.min(127, Math.floor(Math.pow(half / (bars / 2), 1.6) * 90) + 1)
        const target = Math.pow(bins[bin] / 255, 1.4)
        level[b] += (target - level[b]) * (target > level[b] ? .45 : .12)
        if (level[b] < .01) continue
        const angle = b / bars * Math.PI * 2 - Math.PI / 2, x = Math.cos(angle), y = Math.sin(angle)
        c.strokeStyle = prism
        c.beginPath(); c.moveTo(r + x * inner, r + y * inner); c.lineTo(r + x * (inner + reach * level[b]), r + y * (inner + reach * level[b])); c.stroke()
      }
      c.shadowBlur = 0; c.globalAlpha = 1
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [shown])
  return <canvas ref={canvas} className="music-ring" data-shown={shown} aria-hidden="true"/>
}
