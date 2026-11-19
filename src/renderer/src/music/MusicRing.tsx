import { useEffect, useRef } from 'react'
import { musicAnalyser } from './NowPlaying'

const PRISM = ['#ff8a7a', '#ffe29a', '#9ff0c8', '#9db4ff']

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

/** The four glows: their colour, the part of the spectrum (of 8 bands) that drives each, and where each drifts. */
const GLOWS = [
  { colour: PRISM[0], bands: [0, 1], orbit: .0, speed: .00011 },
  { colour: PRISM[1], bands: [2, 3], orbit: 1.6, speed: -.00008 },
  { colour: PRISM[2], bands: [4, 5], orbit: 3.1, speed: .00009 },
  { colour: PRISM[3], bands: [6, 7], orbit: 4.7, speed: -.00012 }
]
const AMBIENT = 160

/**
 * The music as ambient light behind the console: four soft glows in the prism's colours drifting slowly round it. The
 * bass swells the coral glow, the low middle the gold, the middle the mint and the highs the blue; the whole light
 * brightens with the overall loudness and pulses with the bass. It is drawn small and scaled up blurred, so it reads as
 * light rather than shape. At rest a faint warm glow remains.
 */
export function MusicRing({ shown }: { shown: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!, c = el.getContext('2d')!, read = spectrum(8, false)
    el.width = el.height = AMBIENT
    const held = new Float32Array(GLOWS.length)
    let frame = 0
    const draw = (now: number) => {
      if (!shown) { c.clearRect(0, 0, AMBIENT, AMBIENT); return }
      frame = requestAnimationFrame(draw)
      const { level, bass, energy } = read(true)
      const r = AMBIENT / 2
      c.clearRect(0, 0, AMBIENT, AMBIENT)
      c.globalCompositeOperation = 'lighter'
      GLOWS.forEach((g, n) => {
        const drive = g.bands.reduce((sum, b) => sum + level[b], 0) / g.bands.length
        held[n] += (drive - held[n]) * (drive > held[n] ? .25 : .04)
        const angle = g.orbit + now * g.speed, spread = r * (.22 + .12 * held[n])
        const x = r + Math.cos(angle) * spread, y = r + Math.sin(angle) * spread * .8
        const radius = r * (.42 + .38 * held[n] + .1 * bass)
        const glow = c.createRadialGradient(x, y, 0, x, y, radius)
        glow.addColorStop(0, g.colour); glow.addColorStop(1, 'rgba(0,0,0,0)')
        c.globalAlpha = Math.min(1, .1 + .75 * held[n] + .25 * energy)
        c.fillStyle = glow; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill()
      })
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [shown])
  return <canvas ref={canvas} className="music-ring music-ambient" data-shown={shown} aria-hidden="true"/>
}

/** The same spectrum in miniature, filling the now-playing strip behind it: a smooth prism ridge, lows on the left, highs on the right. */
export function MiniSpectrum({ live }: { live: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!, c = el.getContext('2d')!, read = spectrum(40, false)
    let frame = 0
    const draw = (now: number) => {
      if (!live) { c.clearRect(0, 0, el.width, el.height); return }
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
      c.globalAlpha = .3 + .35 * Math.min(1, energy * 3); c.fillStyle = g; c.fill()
      c.globalAlpha = 1; c.strokeStyle = g; c.lineWidth = 2 * k; c.stroke()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [live])
  return <canvas ref={canvas} className="mini-spectrum" aria-hidden="true"/>
}
