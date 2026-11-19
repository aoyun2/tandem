/**
 * Plays a Nintendo DS sequence (SSEQ) with its instrument bank (SBNK) and wave archives (SWAR) through Web Audio.
 * The sequencer runs the tracks' commands at 48 ticks per beat and schedules each note a little ahead as a sample
 * (PCM8, PCM16 or IMA-ADPCM), a pulse wave or noise, shaped by the instrument's envelope.
 */

export type TrackData = { seq: Uint8Array; bank: Uint8Array; waves: (Uint8Array | null)[]; volume: number }

const u16 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8
const u32 = (b: Uint8Array, o: number) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0
const s16 = (b: Uint8Array, o: number) => (u16(b, o) << 16) >> 16

type Region = { kind: number; wave: number; archive: number; base: number; attack: number; decay: number; sustain: number; release: number; pan: number }
type Instrument = { regions: { top: number; region: Region }[] }

function readRegion(b: Uint8Array, o: number, kind: number): Region {
  return { kind, wave: u16(b, o), archive: u16(b, o + 2), base: b[o + 4], attack: b[o + 5], decay: b[o + 6], sustain: b[o + 7], release: b[o + 8], pan: b[o + 9] }
}

/** The bank's instruments: a single region, a drum set over a key range, or a key split into up to eight regions. */
function readBank(bank: Uint8Array): (Instrument | null)[] {
  const count = u32(bank, 0x38), out: (Instrument | null)[] = []
  for (let i = 0; i < count; i++) {
    const kind = bank[0x3c + i * 4], at = u16(bank, 0x3d + i * 4)
    if (!kind) { out.push(null); continue }
    if (kind < 16) out.push({ regions: [{ top: 127, region: readRegion(bank, at, kind) }] })
    else if (kind === 16) {
      const low = bank[at], high = bank[at + 1], regions = []
      for (let n = low; n <= high; n++) { const o = at + 2 + (n - low) * 12; regions.push({ top: n, region: readRegion(bank, o + 2, u16(bank, o)) }) }
      out.push({ regions })
    } else if (kind === 17) {
      const tops = Array.from(bank.subarray(at, at + 8)).filter(t => t > 0), regions = []
      for (let r = 0; r < tops.length; r++) { const o = at + 8 + r * 12; regions.push({ top: tops[r], region: readRegion(bank, o + 2, u16(bank, o)) }) }
      out.push({ regions })
    } else out.push(null)
  }
  return out
}

const ADPCM_STEPS = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767]
const ADPCM_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8]

type Wave = { buffer: AudioBuffer; loop: boolean; loopStart: number }

/** One wave from an archive, decoded into an AudioBuffer at its own sample rate. */
function decodeWave(ctx: BaseAudioContext, archive: Uint8Array, index: number): Wave | null {
  if (index >= u32(archive, 0x38)) return null
  const at = u32(archive, 0x3c + index * 4), type = archive[at], loop = archive[at + 1] === 1, rate = u16(archive, at + 2)
  const loopWords = u16(archive, at + 6), lengthWords = u32(archive, at + 8), data = at + 12, bytes = (loopWords + lengthWords) * 4
  if (!rate || data + bytes > archive.length) return null
  let samples: Float32Array, loopStart: number
  if (type === 0) { samples = new Float32Array(bytes); for (let i = 0; i < bytes; i++) samples[i] = ((archive[data + i] << 24) >> 24) / 128; loopStart = loopWords * 4 }
  else if (type === 1) { samples = new Float32Array(bytes / 2); for (let i = 0; i < samples.length; i++) samples[i] = s16(archive, data + i * 2) / 32768; loopStart = loopWords * 2 }
  else {
    let predictor = s16(archive, data), step = Math.min(88, archive[data + 2])
    const count = (bytes - 4) * 2
    samples = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const byte = archive[data + 4 + (i >> 1)], nibble = i & 1 ? byte >> 4 : byte & 15
      const s = ADPCM_STEPS[step]
      let diff = s >> 3
      if (nibble & 1) diff += s >> 2
      if (nibble & 2) diff += s >> 1
      if (nibble & 4) diff += s
      predictor = Math.max(-32768, Math.min(32767, nibble & 8 ? predictor - diff : predictor + diff))
      step = Math.max(0, Math.min(88, step + ADPCM_INDEX[nibble & 7]))
      samples[i] = predictor / 32768
    }
    loopStart = Math.max(0, (loopWords - 1) * 8)
  }
  const buffer = ctx.createBuffer(1, Math.max(1, samples.length), rate)
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  return { buffer, loop, loopStart: loopStart / rate }
}

/** Envelope times in seconds from the DS's 0–127 rates: 127 is instant, lower is slower. */
const attackTime = (v: number) => v >= 127 ? .001 : Math.pow((127 - v) / 127, 2.4) * 2.2
const fallTime = (v: number) => v >= 127 ? .005 : .01 + Math.pow((127 - v) / 127, 2.6) * 8
const level = (v: number) => Math.pow(v / 127, 2)

type TrackState = {
  pc: number; wait: number; stack: number[]; loops: { at: number; left: number }[]; done: boolean
  program: number; volume: number; expression: number; pan: number; transpose: number; bend: number; bendRange: number
  noteWait: boolean; attack: number; decay: number; sustain: number; release: number
}

const newTrack = (pc: number): TrackState => ({ pc, wait: 0, stack: [], loops: [], done: false, program: 0, volume: 127, expression: 127, pan: 64, transpose: 0, bend: 0, bendRange: 2, noteWait: true, attack: 255, decay: 255, sustain: 255, release: 255 })

export class SequencePlayer {
  private out: GainNode
  private instruments: (Instrument | null)[]
  private waves = new Map<string, Wave | null>()
  private tracks: TrackState[] = []
  private data: number
  private tempo = 120
  private time = 0
  private timer = 0
  private vars = new Int16Array(32)
  private noise: AudioBuffer | null = null
  private pulses = new Map<number, PeriodicWave>()
  private voices = new Set<AudioScheduledSourceNode>()
  stopped = false
  private target: number

  constructor(private ctx: AudioContext, private track: TrackData, destination: AudioNode) {
    this.out = ctx.createGain(); this.target = level(track.volume) * .9; this.out.gain.value = 0
    this.out.connect(destination)
    this.instruments = readBank(track.bank)
    this.data = u32(track.seq, 0x18)
    this.tracks = [newTrack(0)]
  }

  /** Starts playing, rising from silence over `fadeIn` seconds. */
  start(fadeIn = .3) {
    const now = this.ctx.currentTime
    this.out.gain.setValueAtTime(0, now); this.out.gain.linearRampToValueAtTime(this.target, now + Math.max(.01, fadeIn))
    this.time = now + .1
    const pump = () => { if (!this.stopped) { this.run(this.ctx.currentTime + .25); this.timer = window.setTimeout(pump, 40) } }
    pump()
  }

  /** Fades out over `seconds` and stops. */
  stop(seconds = .6) {
    this.stopped = true; clearTimeout(this.timer)
    const now = this.ctx.currentTime
    this.out.gain.cancelScheduledValues(now); this.out.gain.setValueAtTime(this.out.gain.value, now); this.out.gain.linearRampToValueAtTime(0, now + seconds)
    window.setTimeout(() => { for (const v of this.voices) try { v.stop() } catch { /* already stopped */ } this.out.disconnect() }, seconds * 1000 + 200)
  }

  private wave(archive: number, index: number) {
    const key = `${archive}:${index}`
    if (!this.waves.has(key)) { const arc = this.track.waves[archive]; this.waves.set(key, arc ? decodeWave(this.ctx, arc, index) : null) }
    return this.waves.get(key)!
  }

  private region(program: number, note: number) {
    const inst = this.instruments[program]
    return inst?.regions.find(r => note <= r.top)?.region ?? null
  }

  /** Runs the tracks forward, tick by tick, until the scheduled time reaches `until`. */
  private run(until: number) {
    let guard = 0
    while (this.time < until && this.tracks.some(t => !t.done) && guard++ < 20000) {
      for (let i = 0; i < this.tracks.length; i++) {
        const t = this.tracks[i]
        if (t.done) continue
        if (t.wait > 0) t.wait--
        let steps = 0
        while (!t.done && t.wait === 0 && steps++ < 500) this.step(t)
      }
      this.time += 60 / (this.tempo * 48)
    }
  }

  private varlen(t: TrackState) {
    const s = this.track.seq
    let v = 0, b
    do { b = s[this.data + t.pc++]; v = (v << 7) | (b & 0x7f) } while (b & 0x80)
    return v
  }

  private step(t: TrackState) {
    const s = this.track.seq, at = () => this.data + t.pc
    const byte = () => s[this.data + t.pc++]
    const u24 = () => { const v = s[at()] | s[at() + 1] << 8 | s[at() + 2] << 16; t.pc += 3; return v }
    const cmd = byte()
    if (cmd === undefined) { t.done = true; return }
    if (cmd < 0x80) {
      const velocity = byte(), length = this.varlen(t)
      this.note(t, cmd, velocity, length)
      if (t.noteWait) t.wait = length
      return
    }
    switch (cmd) {
      case 0x80: t.wait = this.varlen(t); return
      case 0x81: t.program = this.varlen(t); return
      case 0x93: { const n = byte(), o = u24(); if (!this.tracks[n] || n === 0) this.tracks[n] = newTrack(o); else this.tracks[n] = newTrack(o); return }
      case 0x94: t.pc = u24(); return
      case 0x95: { const o = u24(); t.stack.push(t.pc); t.pc = o; return }
      case 0xa0: { const sub = byte(); if (sub < 0x80) byte(); t.pc += 4; if (sub >= 0x80 && sub !== 0x80) t.pc += 0; return }
      case 0xa1: { const sub = byte(); if (sub < 0x80) byte(); byte(); return }
      case 0xa2: return
      case 0xfd: { const r = t.stack.pop(); if (r === undefined) t.done = true; else t.pc = r; return }
      case 0xfe: t.pc += 2; return
      case 0xff: t.done = true; return
      case 0xe0: case 0xe3: t.pc += 2; return
      case 0xe1: this.tempo = Math.max(1, u16(s, at())); t.pc += 2; return
      case 0xd4: t.loops.push({ at: t.pc + 1, left: s[at()] }); t.pc++; return
      case 0xfc: { const l = t.loops[t.loops.length - 1]; if (!l) return; if (l.left === 0) { t.pc = l.at; return } if (--l.left > 0) t.pc = l.at; else t.loops.pop(); return }
    }
    if (cmd >= 0xb0 && cmd <= 0xbd) { const v = byte(), value = s16(s, at()); t.pc += 2; if (cmd === 0xb0) this.vars[v & 31] = value; else if (cmd === 0xb1) this.vars[v & 31] += value; return }
    if (cmd >= 0xc0 && cmd <= 0xd7) {
      const v = byte()
      switch (cmd) {
        case 0xc0: t.pan = v; break
        case 0xc1: t.volume = v; break
        case 0xc3: t.transpose = (v << 24) >> 24; break
        case 0xc4: t.bend = (v << 24) >> 24; break
        case 0xc5: t.bendRange = v; break
        case 0xc7: t.noteWait = v !== 0; break
        case 0xd0: t.attack = v; break
        case 0xd1: t.decay = v; break
        case 0xd2: t.sustain = v; break
        case 0xd3: t.release = v; break
        case 0xd5: t.expression = v; break
      }
      return
    }
    // An unknown command ends the track rather than misreading what follows.
    t.done = true
  }

  private note(t: TrackState, key: number, velocity: number, length: number) {
    const note = Math.max(0, Math.min(127, key + t.transpose))
    const r = this.region(t.program, note)
    if (!r) return
    const ctx = this.ctx, start = this.time, seconds = length * 60 / (this.tempo * 48)
    const attack = attackTime(t.attack !== 255 ? t.attack : r.attack), decay = fallTime(t.decay !== 255 ? t.decay : r.decay)
    const sustain = level(t.sustain !== 255 ? t.sustain : r.sustain), release = fallTime(t.release !== 255 ? t.release : r.release) * .5
    const peak = level(velocity) * level(t.volume) * level(t.expression) * .5
    const pitch = note - r.base + t.bend * t.bendRange / 128
    let source: AudioScheduledSourceNode
    if (r.kind === 1) {
      const w = this.wave(r.archive, r.wave)
      if (!w) return
      const b = ctx.createBufferSource(); b.buffer = w.buffer
      if (w.loop) { b.loop = true; b.loopStart = w.loopStart; b.loopEnd = w.buffer.duration }
      b.playbackRate.value = Math.pow(2, pitch / 12)
      source = b
    } else if (r.kind === 2) {
      const o = ctx.createOscillator(), duty = Math.min(7, r.wave + 1) / 8
      let wave = this.pulses.get(duty)
      if (!wave) { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) im[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * duty); wave = ctx.createPeriodicWave(re, im); this.pulses.set(duty, wave) }
      o.setPeriodicWave(wave); o.frequency.value = 440 * Math.pow(2, (note - 69) / 12)
      source = o
    } else if (r.kind === 3) {
      if (!this.noise) { const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = n }
      const b = ctx.createBufferSource(); b.buffer = this.noise; b.loop = true; source = b
    } else return
    const gain = ctx.createGain(), panner = ctx.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, ((t.pan - 64) + (r.pan - 64)) / 64))
    const g = gain.gain, end = start + Math.max(seconds, .02)
    g.setValueAtTime(0, start); g.linearRampToValueAtTime(peak, start + attack)
    g.setTargetAtTime(peak * Math.max(sustain, .0001), start + attack, decay / 4)
    g.cancelScheduledValues(end); g.setTargetAtTime(0, end, release / 4)
    source.connect(gain).connect(panner).connect(this.out)
    source.start(start); source.stop(end + release + .05)
    this.voices.add(source); source.onended = () => { this.voices.delete(source); gain.disconnect() }
  }
}
