import { useEffect, useRef } from 'react'
import { musicAnalyser } from './NowPlaying'

const PRISM = ['#ff8a7a', '#ffe29a', '#9ff0c8', '#9db4ff']
const POINTS = 144

/**
 * Follows the music's spectrum: `count` bands from low to high, rising fast and settling slowly, then smoothed across
 * lightly across neighbours (wrapping round when `ring`) so each band keeps its own movement, plus a slower afterglow
 * of the same and the bass on its own.
 */
function spectrum(count: number, ring: boolean) {
  const bins = new Uint8Array(128), level = new Float32Array(count), glow = new Float32Array(count), tmp = new Float32Array(count)
  let bass = 0
  const update = (live: boolean) => {
    const a = musicAnalyser()
    if (a && live) a.getByteFrequencyData(bins); else bins.fill(0)
    const half = ring ? count / 2 : count
    for (let i = 0; i < count; i++) {
      const h = ring ? (i < half ? i : count - 1 - i) : i
      const bin = Math.min(122, Math.floor(Math.pow(h / half, 1.35) * 118) + 1)
      const target = Math.pow(bins[bin] / 255, 1.25)
      level[i] += (target - level[i]) * (target > level[i] ? .75 : .24)
    }
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 0; i < count; i++) {
        const prev = ring ? level[(i + count - 1) % count] : level[Math.max(0, i - 1)], next = ring ? level[(i + 1) % count] : level[Math.min(count - 1, i + 1)]
        tmp[i] = (prev + 4 * level[i] + next) / 6
      }
      level.set(tmp)
    }
    for (let i = 0; i < count; i++) glow[i] = Math.max(level[i], glow[i] - .006)
    const low = (bins[1] + bins[2] + bins[3] + bins[4]) / 4 / 255
    bass += (low - bass) * (low > bass ? .3 : .08)
    return { level, glow, bass, energy: level.reduce((s, v) => s + v, 0) / count }
  }
  return update
}

const prismConic = (c: CanvasRenderingContext2D, turn: number, x: number, y: number) => {
  const g = c.createConicGradient(turn, x, y)
  PRISM.concat(PRISM[0]).forEach((col, i) => g.addColorStop(i / PRISM.length, col))
  return g
}

/**
 * The music as a radial spectrum behind the console. Each angle is a frequency band, mirrored so the lows sit at the
 * top and bottom, smoothed into one fluid edge. The band between the console's circle and that edge is filled with the
 * turning prism, brightest at the edge, which carries a thin line with a soft bloom; a slower afterglow trails behind
 * it, and the whole ring breathes a little with the bass. At rest it is a faint circle.
 */
export function MusicRing({ shown }: { shown: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!, c = el.getContext('2d')!, read = spectrum(POINTS, true)
    let frame = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const size = Math.round(el.clientWidth * devicePixelRatio)
      if (!size) return
      if (el.width !== size) { el.width = el.height = size }
      const { level, glow, bass, energy } = read(shown)
      const r = size / 2, k = devicePixelRatio, inner = r * .72 * (1 + bass * .025), reach = r * .24, turn = now / 12000
      const edge = (values: Float32Array, scale = 1) => {
        const point = (i: number) => { const t = i / POINTS * Math.PI * 2 - Math.PI / 2, rr = inner + reach * scale * values[(i + POINTS) % POINTS]; return [r + Math.cos(t) * rr, r + Math.sin(t) * rr] }
        let [px, py] = point(0), [qx, qy] = point(1)
        c.moveTo((px + qx) / 2, (py + qy) / 2)
        for (let i = 1; i <= POINTS; i++) { [px, py] = point(i); [qx, qy] = point(i + 1); c.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2) }
        c.closePath()
      }
      c.clearRect(0, 0, size, size)
      const prism = prismConic(c, turn, r, r), lit = Math.min(1, energy * 2.5)
      c.save()
      // Afterglow: where the edge was a moment ago, faint and wide.
      c.globalCompositeOperation = 'lighter'
      c.beginPath(); edge(glow, 1.04)
      c.strokeStyle = prism; c.globalAlpha = .1 + .2 * lit; c.lineWidth = k * 6; c.filter = `blur(${Math.round(k * 6)}px)`; c.stroke()
      c.filter = 'none'
      // The band, brightest towards the edge.
      c.globalCompositeOperation = 'source-over'
      c.beginPath(); edge(level); c.moveTo(r + inner, r); c.arc(r, r, inner, 0, Math.PI * 2, true)
      c.globalAlpha = .12 + .4 * lit; c.fillStyle = prism; c.fill('evenodd')
      const shade = c.createRadialGradient(r, r, inner, r, r, inner + reach * .9)
      shade.addColorStop(0, 'rgba(8,9,11,.85)'); shade.addColorStop(1, 'rgba(8,9,11,0)')
      c.globalCompositeOperation = 'destination-out'; c.globalAlpha = .8; c.fillStyle = shade; c.fill('evenodd')
      // The edge: bloom, then a thin bright line.
      c.globalCompositeOperation = 'lighter'
      c.beginPath(); edge(level)
      c.strokeStyle = prism; c.globalAlpha = .25 + .35 * lit; c.lineWidth = k * 7; c.filter = `blur(${Math.round(k * 5)}px)`; c.stroke()
      c.filter = 'none'; c.globalAlpha = .55 + .4 * lit; c.lineWidth = k * 1.8; c.stroke()
      // The console's circle, a hairline.
      c.globalAlpha = .18; c.lineWidth = k; c.strokeStyle = '#ffffff'
      c.beginPath(); c.arc(r, r, inner, 0, Math.PI * 2); c.stroke()
      c.restore()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [shown])
  return <canvas ref={canvas} className="music-ring" data-shown={shown} aria-hidden="true"/>
}

/** The same spectrum in miniature, filling the now-playing strip behind it: a smooth prism ridge, lows on the left, highs on the right. */
export function MiniSpectrum({ live }: { live: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!, c = el.getContext('2d')!, read = spectrum(40, false)
    let frame = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const w = Math.round(el.clientWidth * devicePixelRatio), h = Math.round(el.clientHeight * devicePixelRatio)
      if (!w || !h) return
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h }
      const { level, energy } = read(live), n = level.length, k = devicePixelRatio
      c.clearRect(0, 0, w, h)
      const g = c.createLinearGradient(0, 0, w, 0)
      PRISM.forEach((col, i) => g.addColorStop((i / (PRISM.length - 1) + now / 20000) % 1, col))
      c.beginPath(); c.moveTo(0, h)
      for (let i = 0; i < n; i++) {
        const x = i / (n - 1) * w, y = h - (1.5 * k + level[i] * (h - 3 * k)), nx = (i + 1) / (n - 1) * w, ny = h - (1.5 * k + (level[Math.min(n - 1, i + 1)]) * (h - 3 * k))
        if (i === 0) c.lineTo(x, y)
        c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
      }
      c.lineTo(w, h); c.closePath()
      c.globalAlpha = .25 + .45 * Math.min(1, energy * 3); c.fillStyle = g; c.fill()
      c.globalAlpha = .9; c.strokeStyle = g; c.lineWidth = 1.4 * k; c.stroke()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [live])
  return <canvas ref={canvas} className="mini-spectrum" aria-hidden="true"/>
}
