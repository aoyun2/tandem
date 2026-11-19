import { watchSettings } from './settings'

/** Interface sound effects from Kenney (CC0) and Mixkit (Mixkit Sound Effects Free License); see docs/ASSETS.md. */

const FILES = {
  linkIgnite: 'link-ignite.ogg', linkEnergy: 'link-energy.ogg', linkConnecting: 'link-connecting.ogg',
  cartClick: 'cart-click.ogg', cartThump: 'cart-thump.ogg',
  bootPanel: 'boot-panel.ogg', bootSettle: 'boot-settle.mp3'
} as const
export type Sound = keyof typeof FILES

let shared: AudioContext | null = null
/** Each decoded sample with the gain that brings its loudest moment to a common level. */
const buffers = new Map<Sound, Promise<{ buffer: AudioBuffer; norm: number } | null>>()

export function audio() {
  if (!window.AudioContext) return null
  shared ??= new AudioContext({ latencyHint: 'interactive' })
  void shared.resume()
  return shared
}

/** Loudest 50 ms of a sample as RMS, and its peak. */
function measure(buffer: AudioBuffer) {
  const window = Math.max(1, Math.round(buffer.sampleRate * .05)), channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  let loudest = 0, peak = 0
  for (let start = 0; start < buffer.length; start += window >> 1) {
    let sum = 0, n = 0
    for (const data of channels) for (let i = start; i < Math.min(buffer.length, start + window); i++) { const v = data[i]; sum += v * v; n++; if (Math.abs(v) > peak) peak = Math.abs(v) }
    if (n) loudest = Math.max(loudest, Math.sqrt(sum / n))
  }
  return { loudest, peak }
}

/** Short-term level every sample is matched to before mixing, and the most a match may raise it. */
const MATCH_RMS = .2, MATCH_MAX = 4

function load(name: Sound) {
  let pending = buffers.get(name)
  if (!pending) {
    const ctx = audio()
    pending = ctx ? fetch(`./sfx/${FILES[name]}`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buffer => {
      const { loudest, peak } = measure(buffer)
      const norm = loudest > 0 ? Math.min(MATCH_MAX, MATCH_RMS / loudest, .9 / Math.max(peak, 1e-4)) : 1
      return { buffer, norm }
    }).catch(() => null) : Promise.resolve(null)
    buffers.set(name, pending)
  }
  return pending
}

/** Loads every sample so the first play is not delayed. */
export function preloadSounds() { for (const name of Object.keys(FILES) as Sound[]) void load(name) }

/**
 * A synthetic room: stereo noise with a short pre-delay, a few early reflections, and a tail whose highs die faster
 * than its lows.
 */
function roomImpulse(ctx: BaseAudioContext, seconds = 2.4, preDelay = .016) {
  const rate = ctx.sampleRate, length = Math.round(rate * seconds), impulse = ctx.createBuffer(2, length, rate)
  const reflections = [[.011, .5], [.019, .38], [.027, .3], [.041, .22], [.058, .16]]
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    let dark = 0
    for (let i = Math.round(preDelay * rate); i < length; i++) {
      const t = i / rate - preDelay, noise = Math.random() * 2 - 1
      // A one-pole low-pass whose cutoff falls over the tail, so the room darkens as it decays.
      const k = Math.exp(-2 * Math.PI * (7000 * Math.exp(-t * 2.2) + 400) / rate)
      dark = noise * (1 - k) + dark * k
      data[i] = (dark * .85 + noise * .15 * Math.exp(-t * 9)) * Math.exp(-t * 3.1) * (1 - Math.exp(-t * 400))
    }
    for (const [at, level] of reflections) { const i = Math.round((preDelay + at + channel * .0023) * rate); if (i < length) data[i] += level * (channel ? -1 : 1) }
  }
  return impulse
}

type Bus = { dry: AudioNode; space: AudioNode; body: AudioNode }
const buses = new WeakMap<BaseAudioContext, Bus>()

/**
 * The bus every interface sound plays through, so the samples share one tone, one space and one dynamic:
 * a tone EQ (rumble cut, a little weight, softened presence and air), a convolution room fed by a send,
 * a low-end body layer saturated into harmonics, then glue compression and a limiter. Game audio does not use it.
 */
export function soundBus(ctx: BaseAudioContext): Bus {
  let bus = buses.get(ctx)
  if (bus) return bus
  const filter = (type: BiquadFilterType, frequency: number, gain = 0, q = .7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.gain.value = gain; f.Q.value = q; return f }
  const chain = (...nodes: AudioNode[]) => { for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]); return nodes }

  const glue = ctx.createDynamicsCompressor()
  glue.threshold.value = -20; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = .012; glue.release.value = .28
  const makeup = ctx.createGain(); makeup.gain.value = 1.5
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .002; limiter.release.value = .12
  const out = ctx.createGain(); out.gain.value = .9
  watchSettings(s => { out.gain.value = s.effects })
  chain(glue, makeup, limiter, out, ctx.destination)

  // Dry: shared tone.
  const dry = ctx.createGain()
  chain(dry, filter('highpass', 38, 0, .6), filter('lowshelf', 110, 2.5), filter('peaking', 3200, -2.5, .9), filter('highshelf', 9000, -3), glue)

  // Space: a send into the room, with its lows and highs trimmed so it reads as distance rather than mud or hiss.
  const space = ctx.createGain()
  const room = ctx.createConvolver(); room.normalize = true; room.buffer = roomImpulse(ctx)
  const roomLevel = ctx.createGain(); roomLevel.gain.value = .55
  chain(space, filter('highpass', 220), room, filter('lowpass', 6500), roomLevel, glue)

  // Body: the low end of the sound, driven into soft saturation for weight that small speakers can still carry.
  const body = ctx.createGain()
  const shaper = ctx.createWaveShaper()
  const curve = new Float32Array(1024); for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(x * 2.6) / Math.tanh(2.6) }
  shaper.curve = curve; shaper.oversample = '2x'
  const bodyLevel = ctx.createGain(); bodyLevel.gain.value = .5
  chain(body, filter('lowpass', 150, 0, .8), shaper, filter('lowpass', 420), bodyLevel, glue)

  bus = { dry, space, body }
  buses.set(ctx, bus)
  return bus
}

type PlayOptions = {
  delay?: number; gain?: number; rate?: number; lowpass?: number; highpass?: number; loop?: boolean; fadeIn?: number
  /** Send into the shared room, 0–1. */
  space?: number
  /** Low-end weight, 0–1. */
  body?: number
  /** Left (−1) to right (1). */
  pan?: number
}

/** Plays a sample `delay` seconds from now through the shared bus. Returns a function that fades it out and stops it. */
export function play(name: Sound, options: PlayOptions = {}) {
  const ctx = audio()
  if (!ctx) return () => {}
  let stopped = false, stopNow = () => {}
  void load(name).then(sample => {
    if (!sample || stopped) return
    const at = ctx.currentTime + (options.delay ?? 0)
    const source = ctx.createBufferSource(); source.buffer = sample.buffer; source.loop = options.loop ?? false
    source.playbackRate.value = options.rate ?? 1
    let node: AudioNode = source
    for (const [type, frequency] of [['lowpass', options.lowpass], ['highpass', options.highpass]] as const) {
      if (!frequency) continue
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency
      node.connect(filter); node = filter
    }
    const gain = ctx.createGain()
    const level = (options.gain ?? 1) * sample.norm
    if (options.fadeIn) { gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(level, at + options.fadeIn) } else gain.gain.value = level
    const panner = ctx.createStereoPanner(); panner.pan.value = options.pan ?? 0
    node.connect(gain).connect(panner)
    const bus = soundBus(ctx)
    panner.connect(bus.dry)
    const send = (target: AudioNode, amount: number) => { if (amount <= 0) return; const g = ctx.createGain(); g.gain.value = amount; panner.connect(g).connect(target) }
    send(bus.space, options.space ?? .25); send(bus.body, options.body ?? 0)
    source.start(at)
    stopNow = () => { const now = ctx.currentTime; gain.gain.cancelScheduledValues(now); gain.gain.setTargetAtTime(0, now, .08); source.stop(now + .4) }
  })
  return () => { stopped = true; stopNow() }
}

/** Cartridge: the seated click and a soft thump, close and a little left of centre where the slot is. */
export function cartridgeSound(_travel: number, seat: number) {
  play('cartClick', { delay: seat, gain: .35, lowpass: 5000, space: .18, pan: -.1 })
  play('cartThump', { delay: seat, gain: .5, rate: .8, lowpass: 1500, space: .3, body: .55, pan: -.1 })
}

/** Link ignition: a low explosion carrying a heavy punch, out to the right where the cable runs, in a wide space. */
export function igniteSound() {
  play('linkIgnite', { gain: .9, lowpass: 2400, space: .6, body: .7, pan: .25 })
  play('linkEnergy', { gain: .5, rate: .75, lowpass: 1600, space: .55, pan: .35 })
}

/** Low engine hum that swells while a connection is being established; returns its stop function. */
export function connectingSound() {
  return play('linkConnecting', { gain: .22, rate: .7, lowpass: 700, loop: true, fadeIn: 1.4, space: .4, body: .25, pan: .3 })
}

/**
 * A soft two-note tone, synthesized: each note a sine with a faint octave above, a fast attack and a short ring,
 * through the shared bus and its room.
 */
export function chime(notes: number[] = [1318.5, 1975.5], gap = .075, gain = .16) {
  const ctx = audio()
  if (!ctx) return
  const bus = soundBus(ctx), start = ctx.currentTime + .01
  notes.forEach((frequency, i) => {
    const at = start + i * gap, level = ctx.createGain(), send = ctx.createGain()
    level.gain.setValueAtTime(0, at); level.gain.linearRampToValueAtTime(gain, at + .004); level.gain.exponentialRampToValueAtTime(.0005, at + .45)
    send.gain.value = .45
    for (const [ratio, amount] of [[1, 1], [2, .08]] as const) {
      const osc = ctx.createOscillator(), partial = ctx.createGain()
      osc.type = 'sine'; osc.frequency.value = frequency * ratio; partial.gain.value = amount
      osc.connect(partial).connect(level); osc.start(at); osc.stop(at + 1)
    }
    level.connect(bus.dry); level.connect(send).connect(bus.space)
  })
}

/** A confirming action (choosing a game, a mode, Play): the press, brighter, with a short rising tone. */
export function confirmSound() {
  play('cartClick', { gain: .3, rate: 1.4, lowpass: 6000, space: .1 })
  play('cartThump', { gain: .14, rate: 1.7, lowpass: 900, body: .3, space: .06 })
  chime([1046.5, 1568], .05, .045)
}

/**
 * Tactile feedback for the interface: a faint tick when the pointer reaches a menu panel, a soft press on the menu
 * panels, a quiet key tick while typing; controls marked data-confirm get the confirm sound and the prism ring. Installed once; returns its removal.
 */
export function installInterfaceSounds(root: Document = document) {
  const control = (target: EventTarget | null) => target instanceof Element ? target.closest('button:not(:disabled), [role=radio], [role=option], select, input[type=checkbox], a[href]') : null
  let hovered: Element | null = null, lastTick = 0
  const press = (e: PointerEvent) => {
    const c = control(e.target)
    if (e.button !== 0 || !c) return
    const confirm = c.closest('[data-confirm]')
    if (confirm instanceof HTMLElement) {
      confirmSound()
      // The splash's prism runs round the control once.
      confirm.dataset.confirmed = ''; window.setTimeout(() => { delete confirm.dataset.confirmed }, 700)
      return
    }
    // Small buttons stay silent on click; the main navigation gets a soft press.
    if (c.closest('.main-menu-item')) play('cartClick', { gain: .12, rate: 1.25 + Math.random() * .06, lowpass: 3600, space: .04 })
  }
  const over = (e: PointerEvent) => {
    const c = control(e.target)
    if (c === hovered) return
    hovered = c
    const now = performance.now()
    // The title bar is quiet on hover.
    // Only the menu's large panels tick on hover.
    if (!c || !c.closest('.main-menu-item') || now - lastTick < 45) return
    lastTick = now
    play('cartClick', { gain: .06, rate: 1.9, lowpass: 6000, space: .04 })
  }
  const key = (e: KeyboardEvent) => {
    if (e.repeat || !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) || e.key.length > 1 && e.key !== 'Backspace') return
    play('cartClick', { gain: .035, rate: 1.45 + Math.random() * .2, lowpass: 3600, space: .02 })
  }
  root.addEventListener('pointerdown', press, true); root.addEventListener('pointerover', over, true); root.addEventListener('keydown', key, true)
  return () => { root.removeEventListener('pointerdown', press, true); root.removeEventListener('pointerover', over, true); root.removeEventListener('keydown', key, true) }
}
