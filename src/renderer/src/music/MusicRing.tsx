import { useEffect, useRef } from 'react'
import { musicAnalyser } from './NowPlaying'

const PRISM = ['#ff8a7a', '#ffe29a', '#9ff0c8', '#9db4ff']
const POINTS = 144

/**
 * Follows the music's spectrum: `count` bands from low to high, rising fast and settling slowly, then smoothed across
 * lightly across neighbours (wrapping round when `ring`) so each band keeps its own movement, then `taper` more passes
 * that round each peak into its neighbours, plus a slower afterglow
 * of the same and the bass on its own.
 */
function spectrum(count: number, ring: boolean, taper = 0) {
  const bins = new Uint8Array(128), level = new Float32Array(count), glow = new Float32Array(count), tmp = new Float32Array(count)
  let bass = 0
  const update = (live: boolean) => {
    const a = musicAnalyser()
    if (a && live) a.getByteFrequencyData(bins); else bins.fill(0)
    const half = ring ? count / 2 : count
    for (let i = 0; i < count; i++) {
      const h = ring ? (i < half ? i : count - 1 - i) : i
      // The music's energy sits under about 8 kHz (the first 48 bins at 48 kHz): the points spread over that range,
      // with a gentle lift towards the highs, which are naturally quieter.
      const x = h / half, bin = Math.min(48, Math.floor(Math.pow(x, 1.15) * 47) + 1)
      const target = Math.min(1, Math.pow(bins[bin] / 255, 1.25) * (1 + .55 * x))
      level[i] += (target - level[i]) * (target > level[i] ? .75 : .24)
    }
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 0; i < count; i++) {
        const prev = ring ? level[(i + count - 1) % count] : level[Math.max(0, i - 1)], next = ring ? level[(i + 1) % count] : level[Math.min(count - 1, i + 1)]
        tmp[i] = (prev + 4 * level[i] + next) / 6
      }
      level.set(tmp)
    }
    // Extra passes taper each peak into its neighbours.
    for (let pass = 0; pass < taper; pass++) {
      for (let i = 0; i < count; i++) {
        const prev = ring ? level[(i + count - 1) % count] : level[Math.max(0, i - 1)], next = ring ? level[(i + 1) % count] : level[Math.min(count - 1, i + 1)]
        tmp[i] = (prev + 2 * level[i] + next) / 4
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

/** Each layer of the ring, back to front: its colour, how many frames behind the live spectrum it is, its reach, and
 * how far round it is turned (radians) so the outlines separate. */
const LAYERS = [
  { colour: PRISM[3], delay: 18, reach: 1.55, turn: -.09 },
  { colour: PRISM[2], delay: 12, reach: 1.36, turn: .06 },
  { colour: PRISM[1], delay: 6, reach: 1.17, turn: -.03 },
  { colour: PRISM[0], delay: 0, reach: 1, turn: 0 }
]
const HISTORY = 20

/**
 * The music as stacked spectrum contours behind the console. Each angle is a frequency band, mirrored left and right
 * so the lows sit at the top and bottom. Four smooth outlines in the prism's colours are layered back to front, each
 * a few frames behind the one in front and reaching a little further, so the shape has depth and its motion trails;
 * each is a soft filled band with a bright edge. The console's circle sits inside, and the whole ring breathes a
 * little with the bass. At rest only the circle shows.
 */
export function MusicRing({ shown }: { shown: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!, c = el.getContext('2d')!, read = spectrum(POINTS, true, 1)
    const history = Array.from({ length: HISTORY }, () => new Float32Array(POINTS))
    let frame = 0, head = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const size = Math.round(el.clientWidth * devicePixelRatio)
      if (!size) return
      if (el.width !== size) { el.width = el.height = size }
      const { level, bass, energy } = read(shown)
      head = (head + 1) % HISTORY; history[head].set(level)
      const r = size / 2, k = devicePixelRatio, inner = r * .66 * (1 + bass * .03), reach = r * .17
      const contour = (values: Float32Array, scale: number, turn = 0) => {
        const point = (i: number) => { const t = i / POINTS * Math.PI * 2 - Math.PI / 2 + turn, rr = inner + reach * scale * values[(i + POINTS) % POINTS]; return [r + Math.cos(t) * rr, r + Math.sin(t) * rr] }
        let [px, py] = point(0), [qx, qy] = point(1)
        c.moveTo((px + qx) / 2, (py + qy) / 2)
        for (let i = 1; i <= POINTS; i++) { [px, py] = point(i); [qx, qy] = point(i + 1); c.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2) }
        c.closePath()
      }
      c.clearRect(0, 0, size, size)
      const lit = Math.min(1, energy * 3)
      c.save()
      for (const layer of LAYERS) {
        const values = history[(head - layer.delay + HISTORY * 2) % HISTORY]
        // A soft filled band from the circle out to this layer's outline.
        c.globalCompositeOperation = 'source-over'
        c.beginPath(); contour(values, layer.reach, layer.turn); c.moveTo(r + inner, r); c.arc(r, r, inner, 0, Math.PI * 2, true)
        c.fillStyle = layer.colour; c.globalAlpha = .1 + .18 * lit; c.fill('evenodd')
        // Its edge, bright, with a little glow.
        c.globalCompositeOperation = 'lighter'
        c.beginPath(); contour(values, layer.reach, layer.turn)
        c.strokeStyle = layer.colour; c.lineWidth = k * (layer.delay ? 1.4 : 2); c.globalAlpha = (layer.delay ? .45 : .8) * (.35 + .65 * lit)
        c.shadowColor = layer.colour; c.shadowBlur = k * 8; c.stroke(); c.shadowBlur = 0
      }
      // The console's circle: a dark disc so the layers read as rising from it, and a hairline edge.
      c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 1
      c.beginPath(); c.arc(r, r, inner - k, 0, Math.PI * 2); c.fill()
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = .22; c.strokeStyle = '#f4efe6'; c.lineWidth = k
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
      // The prism in order across the strip, drifting slowly as the ring turns: two cycles, shifted by up to one.
      const shift = (now / 24000) % 1, g = c.createLinearGradient(-shift * w, 0, (2 - shift) * w, 0)
      const cycle = [...PRISM, ...PRISM, PRISM[0]]
      cycle.forEach((col, i) => g.addColorStop(i / (cycle.length - 1), col))
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
