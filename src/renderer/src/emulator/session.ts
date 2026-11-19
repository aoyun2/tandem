import { loadKeys, loadPad } from '../input/bindings'
import { audio as sharedAudio } from '../sfx'
import { DS_BUTTONS, RETRO_BIT, DS_SCREEN, type DSButton, type FromEmulator, type ToEmulator } from '../../../shared/emulator'
import type { GameState } from '../../../shared/run'


export type SessionEvents = {
  frame(width: number, height: number, pixels: Uint8Array): void
  status(status: { state: 'starting' | 'running' | 'error' | 'stopped'; message?: string; save?: 'loaded' | 'new'; fps?: number; savedAt?: number; audio?: string }): void
  /** A reading of the game's state: trainer, party and boxes. */
  game?(state: GameState): void
}

/** Renderer side of a local emulator session: frames in, keyboard/gamepad/touch out, audio to an AudioWorklet. */
export class EmulatorSession {
  private port: MessagePort | null = null
  private keys = loadKeys()
  private pad = loadPad()
  private held = new Set<DSButton>()
  private touch: { x: number; y: number } | null = null
  private sent = ''
  private poll = 0
  private audio: AudioContext | null = null
  private sampleRate = 32768
  private map: ((clientX: number, clientY: number) => { x: number; y: number } | null) | null = null
  private fadeSeconds = 0
  private silent = true
  private inputEnabled = true
  private fadeUntil = 0
  private nextAt = 0
  private gain: GainNode | null = null
  private closed = false
  private volume = 1

  private touchSurface: HTMLElement | null = null
  private lastFrame: { width: number; height: number; pixels: Uint8Array } | null = null
  private lastStatus: Parameters<SessionEvents['status']>[0] = { state: 'starting' }
  private events: SessionEvents = { frame: (width, height, pixels) => { this.lastFrame = { width, height, pixels } }, status: () => {} }

  /** Connects the play view: frames, status and touch input. The latest frame is replayed immediately. */
  /** `map` turns a pointer position into touch-screen coordinates (null when it misses the touch screen); without it the surface's rect is the touch screen. */
  attach(touchSurface: HTMLElement, events: SessionEvents, map?: (clientX: number, clientY: number) => { x: number; y: number } | null) {
    this.map = map ?? null
    this.detach()
    this.events = events; this.touchSurface = touchSurface
    touchSurface.addEventListener('pointerdown', this.pointer)
    touchSurface.addEventListener('pointermove', this.pointer)
    touchSurface.addEventListener('pointerup', this.lift)
    touchSurface.addEventListener('pointercancel', this.lift)
    if (this.lastFrame) events.frame(this.lastFrame.width, this.lastFrame.height, this.lastFrame.pixels)
    events.status(this.lastStatus)
  }

  detach() {
    const surface = this.touchSurface
    if (surface) {
      surface.removeEventListener('pointerdown', this.pointer)
      surface.removeEventListener('pointermove', this.pointer)
      surface.removeEventListener('pointerup', this.lift)
      surface.removeEventListener('pointercancel', this.lift)
    }
    this.touchSurface = null
    this.events = { frame: (width, height, pixels) => { this.lastFrame = { width, height, pixels } }, status: () => {} }
  }

  async start(token: string, runId?: string) {
    this.status({ state: 'starting' })
    const portReady = new Promise<MessagePort>(resolve => {
      const receive = (event: MessageEvent) => {
        if (event.source !== window || event.data?.tandem !== 'emulator-port' || !event.ports[0]) return
        window.removeEventListener('message', receive)
        resolve(event.ports[0])
      }
      window.addEventListener('message', receive)
    })
    const result = await window.tandem!.startEmulator(token, runId)
    if (result.status === 'error') { this.status({ state: 'error', message: result.message }); return }
    const port = await portReady
    if (this.closed) { port.postMessage({ type: 'stop' } satisfies ToEmulator); port.close(); return }
    this.port = port
    port.onmessage = ({ data }: MessageEvent<FromEmulator>) => this.receive(data)
    port.start()
    window.addEventListener('keydown', this.keydown)
    window.addEventListener('keyup', this.keyup)
    window.addEventListener('blur', this.release)
    this.poll = requestAnimationFrame(this.pollPad)
  }

  /** Disables game input (spectating); held buttons and touches are released. */
  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled
    if (!enabled) { this.held.clear(); this.padButtons = new Set(); this.touch = null; this.sent = ''; this.send() }
  }

  /** Holds game audio at silence until fadeIn. A session starts silent. */
  silence() {
    this.silent = true
    if (this.gain && this.audio) { this.gain.gain.cancelScheduledValues(this.audio.currentTime); this.gain.gain.setValueAtTime(0, this.audio.currentTime) }
  }

  setVolume(volume: number) {
    this.volume = volume
    if (!this.silent && this.gain && this.audio && this.audio.currentTime >= this.fadeUntil) this.gain.gain.setTargetAtTime(volume, this.audio.currentTime, .05)
  }

  /** Starts a held game running, with its sound fading in from silence over `seconds`. */
  begin(seconds = .25) {
    this.port?.postMessage({ type: 'pause', paused: false } satisfies ToEmulator)
    this.nextAt = 0
    this.fadeIn(seconds)
  }

  /** Fades game audio in from silence over `seconds`. */
  fadeIn(seconds: number) {
    this.silent = false
    this.fadeSeconds = seconds
    if (!this.audio || !this.gain) return
    const now = this.audio.currentTime
    this.gain.gain.cancelScheduledValues(now); this.gain.gain.setValueAtTime(0, now)
    this.gain.gain.setTargetAtTime(this.volume, now + .15, seconds / 3.5)
    this.fadeUntil = now + seconds
  }

  stop() {
    if (this.closed) return
    this.closed = true
    cancelAnimationFrame(this.poll)
    window.removeEventListener('keydown', this.keydown)
    window.removeEventListener('keyup', this.keyup)
    window.removeEventListener('blur', this.release)
    this.detach()
    this.port?.postMessage({ type: 'stop' } satisfies ToEmulator)
    this.gain?.disconnect()
  }

  private status(next: Parameters<SessionEvents['status']>[0]) {
    this.lastStatus = { ...this.lastStatus, ...next }
    this.events.status(this.lastStatus)
  }

  private async receive(message: FromEmulator) {
    switch (message.type) {
      case 'ready':
        this.status({ state: 'running', save: message.save })
        await this.openAudio(message.sampleRate)
        break
      case 'frame':
        this.lastFrame = { width: message.width, height: message.height, pixels: new Uint8Array(message.pixels) }
        this.events.frame(message.width, message.height, new Uint8Array(message.pixels))
        if (message.audio) this.queueAudio(message.audio)
        break
      case 'saved': this.status({ state: 'running', savedAt: message.at }); break
      case 'stats': this.status({ state: 'running', fps: message.fps }); break
      case 'game': this.events.game?.(message.state); break
      case 'error': this.status({ state: 'error', message: message.message }); break
      case 'stopped': this.status({ state: 'stopped' }); this.port?.close(); this.port = null; break
    }
  }

  private async openAudio(sampleRate: number) {
    if (this.closed) return
    try {
      // Shares the interface sound context: opening a second output can drop sounds already scheduled.
      const audio = sharedAudio()
      if (!audio) throw new Error('no audio')
      this.audio = audio
      this.sampleRate = sampleRate
      this.gain = audio.createGain(); this.gain.gain.value = this.fadeSeconds || this.silent ? 0 : this.volume
      this.gain.connect(audio.destination)
      if (this.fadeSeconds) this.fadeIn(this.fadeSeconds)
      await audio.resume()
      this.status({ state: 'running', audio: audio.state })
    } catch { this.audio = null; this.status({ state: 'running', audio: 'failed' }) }
  }

  /** Queues one frame of interleaved int16 stereo back to back, about 60 ms ahead; drops audio if the queue runs long. */
  private queueAudio(data: ArrayBuffer) {
    const audio = this.audio, gain = this.gain
    if (!audio || !gain || audio.state !== 'running') return
    const samples = new Int16Array(data), frames = samples.length >> 1
    if (!frames) return
    const buffer = audio.createBuffer(2, frames, this.sampleRate)
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1)
    for (let i = 0; i < frames; i++) { left[i] = samples[i * 2] / 32768; right[i] = samples[i * 2 + 1] / 32768 }
    const now = audio.currentTime
    if (this.nextAt < now + .02 || this.nextAt > now + .25) this.nextAt = now + .06
    const source = audio.createBufferSource(); source.buffer = buffer; source.connect(gain)
    source.start(this.nextAt)
    this.nextAt += buffer.duration
  }

  private editable(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false
    if (target instanceof HTMLInputElement) return !['range', 'checkbox', 'radio', 'button'].includes(target.type)
    return target.isContentEditable || /^(SELECT|TEXTAREA)$/.test(target.tagName)
  }

  private keydown = (event: KeyboardEvent) => {
    const button = this.keys[event.code]
    if (!button || !this.inputEnabled || this.editable(event.target)) return
    event.preventDefault()
    this.held.add(button); this.send()
  }

  private keyup = (event: KeyboardEvent) => {
    const button = this.keys[event.code]
    if (!button) return
    this.held.delete(button); this.send()
  }

  private release = () => { this.held.clear(); this.touch = null; this.send() }

  private pointer = (event: PointerEvent) => {
    if (!this.inputEnabled || (event.type === 'pointermove' && !(event.buttons & 1))) return
    if (!this.touchSurface) return
    if (this.map) {
      const point = this.map(event.clientX, event.clientY)
      if (!point) { if (event.type === 'pointerdown') return; this.touch = null; this.send(); return }
      if (event.type === 'pointerdown') this.touchSurface.setPointerCapture(event.pointerId)
      this.touch = point; this.send(); return
    }
    if (event.type === 'pointerdown') this.touchSurface.setPointerCapture(event.pointerId)
    const rect = this.touchSurface.getBoundingClientRect()
    this.touch = {
      x: Math.min(DS_SCREEN.width - 1, Math.max(0, (event.clientX - rect.left) / rect.width * DS_SCREEN.width)),
      y: Math.min(DS_SCREEN.height - 1, Math.max(0, (event.clientY - rect.top) / rect.height * DS_SCREEN.height))
    }
    this.send()
  }

  private lift = () => { this.touch = null; this.send() }

  private padButtons = new Set<DSButton>()
  private pollPad = () => {
    this.poll = requestAnimationFrame(this.pollPad)
    const pad = Array.from(navigator.getGamepads()).find(p => p && (p.mapping === 'standard' || p.buttons.length >= 12))
    const next = new Set<DSButton>()
    if (pad && this.inputEnabled) {
      for (const button of DS_BUTTONS) if (pad.buttons[this.pad[button]]?.pressed) next.add(button)
      const [x = 0, y = 0] = pad.axes
      if (x < -.5) next.add('Left'); if (x > .5) next.add('Right'); if (y < -.5) next.add('Up'); if (y > .5) next.add('Down')
    }
    const changed = next.size !== this.padButtons.size || [...next].some(b => !this.padButtons.has(b))
    this.padButtons = next
    if (changed) this.send()
  }

  private send() {
    if (!this.port) return
    let buttons = 0
    if (this.inputEnabled) for (const button of [...this.held, ...this.padButtons]) buttons |= 1 << RETRO_BIT[button]
    const touch = this.touch && { x: Math.round(this.touch.x), y: Math.round(this.touch.y) }
    const key = `${buttons}:${touch ? `${touch.x},${touch.y}` : '-'}`
    if (key === this.sent) return
    this.sent = key
    this.port.postMessage({ type: 'input', buttons, touch } satisfies ToEmulator)
  }
}
