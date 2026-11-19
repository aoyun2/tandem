import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, copyFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { MessagePortMain } from 'electron'
import { LibretroCore, MEMORY } from './libretro'
import type { EmulatorConfig, FromEmulator, ToEmulator } from '../../shared/emulator'
import { findSaveBase, readBoxes, readParty, readTrainer, SAVE, stillAt } from '../../shared/gen5'
import { searchCopy, whereabouts } from '../../shared/zones'
import { narcFiles, romFile } from '../romtext'

/** Utility process: runs one game, streams frames over a MessagePort and keeps the cartridge save on disk. */

const SAVE_CHECK_MS = 2000
const options = {
  melonds_render_mode: 'software', melonds_threaded_renderer: 'enabled', melonds_console_mode: 'ds',
  melonds_boot_mode: 'direct', melonds_sysfile_mode: 'builtin', melonds_jit_enable: 'enabled',
  melonds_screen_layout1: 'top-bottom', melonds_screen_gap: '0', melonds_touch_mode: 'touch', melonds_show_cursor: 'disabled',
  melonds_audio_interpolation: 'cubic'
}

let stopSession: (() => void) | null = null
process.parentPort.on('message', event => {
  if (stopSession) { if ((event.data as ToEmulator)?.type === 'stop') stopSession(); return }
  const port = event.ports[0]
  try { stopSession = start(event.data as EmulatorConfig, port) }
  catch (error) { send(port, { type: 'error', message: error instanceof Error ? error.message : 'The emulator could not start.' }); port.close(); process.exit(1) }
})

function send(port: MessagePortMain, message: FromEmulator) { port.postMessage(message) }

/**
 * Black 2 / White 2 opening: runs uncapped, pressing A and Start on the game's own skip points,
 * until the touch screen shows the title art for 20 frames. Stops pressing once the title is up.
 */
function warmToTitle(core: LibretroCore) {
  let lit = 0
  for (let i = 1; i <= 2400; i++) {
    core.buttons = lit === 0 && i > 400 && i % 60 < 4 ? (1 << 8) | (i % 120 < 4 ? 1 << 3 : 0) : 0
    const { frame } = core.run()
    if (!frame) continue
    const half = frame.width * (frame.height / 2) * 4
    let sum = 0, count = 0
    for (let k = half; k < frame.pixels.length; k += 16) { sum += frame.pixels[k] + frame.pixels[k + 1] + frame.pixels[k + 2]; count++ }
    const level = sum / count / 3
    lit = i > 600 && level > 25 ? lit + 1 : 0
    if (lit >= 20) break
  }
  core.buttons = 0
}

function start(config: EmulatorConfig, port: MessagePortMain) {
  mkdirSync(config.systemDir, { recursive: true })
  mkdirSync(dirname(config.save), { recursive: true })
  const core = new LibretroCore(config.core, { system: config.systemDir, save: config.saveDir }, { ...options })
  const romBytes = readFileSync(config.rom)
  core.load(config.rom, romBytes)
  let zones: Uint8Array | null = null
  try { const table = romFile(romBytes, 'a/0/1/2'); zones = table ? narcFiles(table)[0] ?? null : null } catch { zones = null }

  const sram = core.memory(MEMORY.SAVE_RAM)
  let saveState: 'loaded' | 'new' = 'new'
  if (sram && existsSync(config.save)) {
    copyFileSync(config.save, `${config.save}.1`)
    const stored = readFileSync(config.save)
    sram.write(stored.subarray(0, sram.length))
    saveState = 'loaded'
  }
  const digest = (bytes: Uint8Array) => createHash('sha1').update(bytes).digest('hex')
  let lastSave = sram ? digest(sram.read()) : ''
  const flush = () => {
    if (!sram) return
    const bytes = sram.read(), now = digest(bytes)
    if (now === lastSave) return
    const temp = `${config.save}.tmp`
    writeFileSync(temp, bytes)
    renameSync(temp, config.save)
    lastSave = now
    send(port, { type: 'saved', bytes: sram.length, at: Date.now() })
  }

  // A test may start from a saved emulator state instead of the title; the app never sets it.
  const testState = process.env.TANDEM_TEST_STATE
  if (testState && existsSync(testState)) core.unserialize(readFileSync(testState))
  else if (config.warmToTitle) warmToTitle(core)
  send(port, { type: 'ready', width: core.av.width, height: core.av.height, fps: core.av.fps, sampleRate: core.av.sampleRate, save: saveState })

  // The game's state, read from its in-memory save data once a second and sent when it changes.
  let base = -1, lastGame = '', gameAt = 0, zoneAt = -1, searchedAt = 0
  const readGame = () => {
    const now = Date.now()
    const ram = core.memory(MEMORY.SYSTEM_RAM)?.read()
    if (!ram) return
    if (!stillAt(ram, base)) base = findSaveBase(ram)
    if (base < 0) return
    const trainer = readTrainer(ram, base), party = readParty(ram, base + SAVE.party) ?? [], boxes = readBoxes(ram, base)
    let where = zones ? whereabouts(ram, zones, zoneAt) : null
    // The pointer's copy can be missing for a moment while the game changes zone; then the one copy in RAM is searched for.
    if (!where && zones && now - searchedAt > 3000) { searchedAt = now; const at = searchCopy(ram, zones); if (at >= 0) where = whereabouts(ram, zones, at) }
    if (where) zoneAt = where.at
    const state = { trainer: { name: trainer.name, id: trainer.id, badges: trainer.badges, money: trainer.money }, party, boxes, where: where && { zone: where.zone, place: where.place } }
    const key = JSON.stringify(state)
    if (key !== lastGame) { lastGame = key; send(port, { type: 'game', state }) }
  }

  const interval = 1000 / core.av.fps
  let paused = config.hold, held = false, stopped = false, next = performance.now(), lastCheck = next
  let counted = 0, statsAt = next, busy = 0
  const stop = () => {
    if (stopped) return
    stopped = true
    try { flush() } finally {
      core.close()
      send(port, { type: 'stopped' })
      port.close()
      process.exit(0)
    }
  }

  port.on('message', ({ data }: { data: ToEmulator }) => {
    if (data.type === 'input') {
      core.buttons = data.buttons
      if (data.touch) {
        core.pointer = { x: Math.round(data.touch.x / 256 * 65534 - 32767), y: Math.round((192 + data.touch.y) / 384 * 65534 - 32767), pressed: true }
      } else core.pointer = { ...core.pointer, pressed: false }
    } else if (data.type === 'pause') { paused = data.paused; next = performance.now() }
    else if (data.type === 'stop') stop()
  })
  port.on('close', stop)
  port.start()
  process.on('exit', () => { if (!stopped) try { flush() } catch { /* process is ending */ } })

  const tick = () => {
    if (stopped) return
    const now = performance.now()
    if (paused) {
      // While held, the first frame is sent once so the screens have a picture; its sound is dropped.
      if (!held) { held = true; const { frame } = core.run(); if (frame) send(port, { type: 'frame', width: frame.width, height: frame.height, pixels: frame.pixels.buffer as ArrayBuffer, audio: null }) }
      next = now; setTimeout(tick, 50); return
    }
    if (now >= next) {
      const began = performance.now()
      const { frame, audio } = core.run()
      busy += performance.now() - began
      counted++
      let samples: ArrayBuffer | null = null
      if (audio.length) {
        const total = audio.reduce((n, chunk) => n + chunk.length, 0)
        const joined = new Int16Array(total); let at = 0
        for (const chunk of audio) { joined.set(chunk, at); at += chunk.length }
        samples = joined.buffer
      }
      if (frame) send(port, { type: 'frame', width: frame.width, height: frame.height, pixels: frame.pixels.buffer as ArrayBuffer, audio: samples })
      next += interval
      if (now - next > interval * 4) next = now + interval
      if (now - lastCheck > SAVE_CHECK_MS) { lastCheck = now; flush() }
      if (now - gameAt > 1000) { gameAt = now; try { readGame() } catch { /* a reading that fails is skipped */ } }
      if (now - statsAt > 1000) { send(port, { type: 'stats', fps: counted * 1000 / (now - statsAt), frameMs: busy / Math.max(1, counted) }); counted = 0; busy = 0; statsAt = now }
    }
    const wait = next - performance.now()
    if (wait > 2) setTimeout(tick, wait - 1.5)
    else setImmediate(tick)
  }
  tick()
  return stop
}
