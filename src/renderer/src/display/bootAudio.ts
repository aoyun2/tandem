import { BACKLIGHT_AT } from './bootShader'
import { play } from '../sfx'

/**
 * Power-on sound: each screen locks on with a clunk and a latch click, placed where that screen stands and set further
 * back in the room the further away it is.
 */
export function playBootSound(screens: { delay: number; gain: number; pan?: number; distance?: number }[]) {
  const stops: (() => void)[] = []
  const jitter = () => .94 + Math.random() * .12
  for (const screen of screens) {
    const at = screen.delay + BACKLIGHT_AT
    const pan = screen.pan ?? 0, far = screen.distance ?? 0
    stops.push(play('bootPanel', { delay: at, gain: .55 * screen.gain, rate: jitter() * .9, lowpass: 4500 - far * 2000, space: .3 + far * .3, body: .45 * (1 - far), pan }))
    stops.push(play('cartClick', { delay: at + .006, gain: .3 * screen.gain, rate: jitter(), lowpass: 6000 - far * 2500, space: .2 + far * .3, pan }))
  }
  return () => { for (const stop of stops) stop() }
}

/** The key strip powering on: a click over a lower clunk, timed to its backlight's first flicker and the moment it holds. */
export function playStripSound() {
  const stops = [
    play('bootSettle', { delay: .27, gain: .45, space: .5 }),
    play('bootPanel', { delay: .38, gain: .4, rate: .7, lowpass: 2500, space: .45, body: .6 })
  ]
  return () => { for (const stop of stops) stop() }
}
