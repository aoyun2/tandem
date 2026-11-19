import { useEffect, useRef } from 'react'
import { musicAnalyser } from './NowPlaying'

const PRISM = ['#ff8a7a', '#ffe29a', '#9ff0c8', '#9db4ff']
const POINTS = 72

/**
 * The music as a radial spectrum behind the console. Each angle is a frequency band, mirrored so the lows sit at the
 * top and bottom; it rises fast and settles slowly, neighbouring bands are smoothed into one fluid edge, and the band
 * between the console's circle and that edge is filled with the turning prism and outlined by a thin bright line. The
 * whole ring breathes a little with the bass. At rest it is a faint circle.
 */
export function MusicRing({ shown }: { shown: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!, c = el.getContext('2d')!
    const bins = new Uint8Array(128), level = new Float32Array(POINTS), smooth = new Float32Array(POINTS)
    let frame = 0, bass = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const size = Math.round(el.clientWidth * devicePixelRatio)
      if (!size) return
      if (el.width !== size) { el.width = el.height = size }
      const a = musicAnalyser()
      if (a && shown) a.getByteFrequencyData(bins); else bins.fill(0)
      const half = POINTS / 2
      for (let i = 0; i < POINTS; i++) {
        const h = i < half ? i : POINTS - 1 - i, bin = Math.min(110, Math.floor(Math.pow(h / half, 1.5) * 100) + 1)
        const target = Math.pow(bins[bin] / 255, 1.5)
        level[i] += (target - level[i]) * (target > level[i] ? .55 : .14)
      }
      // Two passes of neighbour averaging turn the bands into one fluid edge.
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < POINTS; i++) smooth[i] = (level[(i + POINTS - 1) % POINTS] + 2 * level[i] + level[(i + 1) % POINTS]) / 4
      level.set(smooth)
      const low = (bins[1] + bins[2] + bins[3] + bins[4]) / 4 / 255
      bass += (low - bass) * (low > bass ? .3 : .08)
      const r = size / 2, k = devicePixelRatio, inner = r * .72 * (1 + bass * .025), reach = r * .24, turn = now / 12000
      const point = (i: number) => { const t = i / POINTS * Math.PI * 2 - Math.PI / 2, rr = inner + reach * level[(i + POINTS) % POINTS]; return [r + Math.cos(t) * rr, r + Math.sin(t) * rr] }
      const edge = () => {
        let [px, py] = point(0), [qx, qy] = point(1)
        c.moveTo((px + qx) / 2, (py + qy) / 2)
        for (let i = 1; i <= POINTS; i++) { [px, py] = point(i); [qx, qy] = point(i + 1); c.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2) }
        c.closePath()
      }
      c.clearRect(0, 0, size, size)
      const prism = c.createConicGradient(turn, r, r)
      PRISM.concat(PRISM[0]).forEach((col, i) => prism.addColorStop(i / PRISM.length, col))
      const energy = level.reduce((s, v) => s + v, 0) / POINTS
      c.save()
      // The filled band, fading outward.
      c.beginPath(); edge(); c.moveTo(r + inner, r); c.arc(r, r, inner, 0, Math.PI * 2, true)
      c.globalAlpha = .1 + .45 * Math.min(1, energy * 2.5); c.fillStyle = prism; c.fill('evenodd')
      const fade = c.createRadialGradient(r, r, inner, r, r, inner + reach)
      fade.addColorStop(0, 'rgba(10,11,13,0)'); fade.addColorStop(1, 'rgba(10,11,13,.7)')
      c.globalCompositeOperation = 'destination-out'; c.globalAlpha = .6; c.fillStyle = fade; c.fill('evenodd')
      // The edge: a thin bright line with a soft glow.
      c.globalCompositeOperation = 'lighter'
      c.beginPath(); edge()
      c.globalAlpha = .45 + .45 * Math.min(1, energy * 3); c.strokeStyle = prism; c.lineWidth = k * 2; c.shadowColor = '#d8e0ff'; c.shadowBlur = k * 10; c.stroke()
      c.globalAlpha = .2; c.lineWidth = k * 1; c.strokeStyle = '#ffffff'; c.shadowBlur = 0
      c.beginPath(); c.arc(r, r, inner, 0, Math.PI * 2); c.stroke()
      c.restore()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [shown])
  return <canvas ref={canvas} className="music-ring" data-shown={shown} aria-hidden="true"/>
}
