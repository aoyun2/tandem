import koffi from 'koffi'
import type { LibraryHandle, TypeObject } from 'koffi'

/** Minimal libretro frontend for a software-rendered core loaded through koffi. */

const EXPERIMENTAL = 0x10000
const ENV = {
  GET_CAN_DUPE: 3, SET_PERFORMANCE_LEVEL: 8, GET_SYSTEM_DIRECTORY: 9, SET_PIXEL_FORMAT: 10, SET_INPUT_DESCRIPTORS: 11,
  SET_HW_RENDER: 14, GET_VARIABLE: 15, SET_VARIABLES: 16, GET_VARIABLE_UPDATE: 17, SET_SUPPORT_NO_GAME: 18,
  GET_LOG_INTERFACE: 27, GET_SAVE_DIRECTORY: 31, SET_SYSTEM_AV_INFO: 32, SET_GEOMETRY: 37, GET_LANGUAGE: 39,
  GET_AUDIO_VIDEO_ENABLE: 47, GET_FASTFORWARDING: 49, GET_INPUT_BITMASKS: 51, GET_CORE_OPTIONS_VERSION: 52,
  GET_MESSAGE_INTERFACE_VERSION: 59, GET_INPUT_MAX_USERS: 61
} as const
export const MEMORY = { SAVE_RAM: 0, RTC: 1, SYSTEM_RAM: 2, VIDEO_RAM: 3 } as const
export const PIXEL = { RGB1555: 0, XRGB8888: 1, RGB565: 2 } as const
export const JOYPAD = { B: 0, Y: 1, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7, A: 8, X: 9, L: 10, R: 11, L2: 12, R2: 13, L3: 14, R3: 15 } as const
const DEVICE_JOYPAD = 1, DEVICE_POINTER = 6, ID_JOYPAD_MASK = 256

const GameInfo = koffi.struct('retro_game_info', { path: 'const char *', data: 'void *', size: 'size_t', meta: 'const char *' })
const Geometry = koffi.struct('retro_game_geometry', { base_width: 'unsigned int', base_height: 'unsigned int', max_width: 'unsigned int', max_height: 'unsigned int', aspect_ratio: 'float' })
const Timing = koffi.struct('retro_system_timing', { fps: 'double', sample_rate: 'double' })
const AvInfo = koffi.struct('retro_system_av_info', { geometry: Geometry, timing: Timing })
const SystemInfo = koffi.struct('retro_system_info', { library_name: 'const char *', library_version: 'const char *', valid_extensions: 'const char *', need_fullpath: 'bool', block_extract: 'bool' })
const Variable = koffi.struct('retro_variable', { key: 'const char *', value: 'const char *' })

const EnvironmentCallback = koffi.proto('bool retro_environment_t(unsigned int cmd, void *data)')
const VideoCallback = koffi.proto('void retro_video_refresh_t(const void *data, unsigned int width, unsigned int height, size_t pitch)')
const AudioCallback = koffi.proto('void retro_audio_sample_t(int16_t left, int16_t right)')
const AudioBatchCallback = koffi.proto('size_t retro_audio_sample_batch_t(const int16_t *data, size_t frames)')
const InputPollCallback = koffi.proto('void retro_input_poll_t()')
const InputStateCallback = koffi.proto('int16_t retro_input_state_t(unsigned int port, unsigned int device, unsigned int index, unsigned int id)')

/** Copies native memory; Electron forbids external ArrayBuffers over native pointers. */
const arrays = new Map<string, unknown>()
function arrayType(type: 'uint8_t' | 'int16_t', length: number) {
  const key = `${type}:${length}`
  let t = arrays.get(key)
  if (!t) { t = koffi.array(type, length, 'Typed'); arrays.set(key, t) }
  return t as TypeObject
}
export function readBytes(pointer: unknown, length: number) { return koffi.decode(pointer, arrayType('uint8_t', length)) as Uint8Array }

export type NativeMemory = { length: number; read(): Uint8Array; write(bytes: Uint8Array): void }

export type Frame = { width: number; height: number; pixels: Uint8Array }
export type CoreOptions = Record<string, string>
export type CoreOptionDefinition = { key: string; description: string; values: string[] }

export class LibretroCore {
  readonly options: CoreOptionDefinition[] = []
  readonly log: string[] = []
  pixelFormat: number = PIXEL.RGB1555
  av = { width: 0, height: 0, fps: 60, sampleRate: 44100 }
  buttons = 0
  pointer = { x: 0, y: 0, pressed: false }
  private lib: LibraryHandle
  private fn: Record<string, (...args: any[]) => any> = {}
  private callbacks: bigint[] = []
  private dirs: { system: string; save: string }
  private values: CoreOptions
  private strings: unknown[] = []
  private frame: Frame | null = null
  private audio: Int16Array[] = []
  private variablesChanged = false
  private loaded = false
  private gameData: Buffer | null = null

  constructor(dll: string, dirs: { system: string; save: string }, values: CoreOptions = {}) {
    this.dirs = dirs; this.values = values
    this.lib = koffi.load(dll)
    const declare = (signature: string) => { const name = /(\w+)\s*\(/.exec(signature)![1]; this.fn[name] = this.lib.func(signature) }
    for (const signature of [
      'void retro_set_environment(retro_environment_t *cb)', 'void retro_set_video_refresh(retro_video_refresh_t *cb)',
      'void retro_set_audio_sample(retro_audio_sample_t *cb)', 'void retro_set_audio_sample_batch(retro_audio_sample_batch_t *cb)',
      'void retro_set_input_poll(retro_input_poll_t *cb)', 'void retro_set_input_state(retro_input_state_t *cb)',
      'void retro_init()', 'void retro_deinit()', 'unsigned int retro_api_version()',
      'void retro_get_system_info(_Out_ retro_system_info *info)', 'void retro_get_system_av_info(_Out_ retro_system_av_info *info)',
      'void retro_set_controller_port_device(unsigned int port, unsigned int device)', 'void retro_reset()', 'void retro_run()',
      'size_t retro_serialize_size()', 'bool retro_serialize(void *data, size_t size)', 'bool retro_unserialize(const void *data, size_t size)',
      'bool retro_load_game(const retro_game_info *game)', 'void retro_unload_game()',
      'void *retro_get_memory_data(unsigned int id)', 'size_t retro_get_memory_size(unsigned int id)'
    ]) declare(signature)
    const register = (fn: Function, type: TypeObject) => { const cb = koffi.register(fn, koffi.pointer(type)); this.callbacks.push(cb); return cb }
    this.fn.retro_set_environment(register((cmd: number, data: unknown) => this.environment(cmd, data), EnvironmentCallback))
    this.fn.retro_set_video_refresh(register((data: unknown, width: number, height: number, pitch: number) => this.video(data, width, height, pitch), VideoCallback))
    this.fn.retro_set_audio_sample(register((l: number, r: number) => { this.audio.push(Int16Array.of(l, r)) }, AudioCallback))
    this.fn.retro_set_audio_sample_batch(register((data: unknown, frames: number) => {
      if (data && frames) this.audio.push(koffi.decode(data, arrayType('int16_t', Number(frames) * 2)) as Int16Array)
      return frames
    }, AudioBatchCallback))
    this.fn.retro_set_input_poll(register(() => {}, InputPollCallback))
    this.fn.retro_set_input_state(register((port: number, device: number, _index: number, id: number) => this.input(port, device, id), InputStateCallback))
    this.fn.retro_init()
  }

  systemInfo() {
    const info: Record<string, unknown> = {}
    this.fn.retro_get_system_info(info)
    return info as { library_name: string; library_version: string; valid_extensions: string; need_fullpath: boolean }
  }

  /** Loads a game from memory. The path is passed for cores that derive save names from it. */
  load(path: string, data: Buffer) {
    this.gameData = data
    if (!this.fn.retro_load_game({ path, data: this.gameData, size: data.length, meta: null })) throw new Error('The emulator core rejected this game.')
    this.loaded = true
    const av: { geometry: { base_width: number; base_height: number }; timing: { fps: number; sample_rate: number } } = { geometry: { base_width: 0, base_height: 0 }, timing: { fps: 0, sample_rate: 0 } }
    this.fn.retro_get_system_av_info(av)
    this.av = { width: av.geometry.base_width, height: av.geometry.base_height, fps: av.timing.fps, sampleRate: av.timing.sample_rate }
    this.fn.retro_set_controller_port_device(0, DEVICE_JOYPAD)
  }

  setOption(key: string, value: string) { this.values[key] = value; this.variablesChanged = true }

  /** Runs one emulated frame and returns its video (null when the core duplicated the previous frame) and audio. */
  run(): { frame: Frame | null; audio: Int16Array[] } {
    this.frame = null; this.audio = []
    this.fn.retro_run()
    return { frame: this.frame, audio: this.audio }
  }

  memory(id: number): NativeMemory | null {
    const size = Number(this.fn.retro_get_memory_size(id))
    const data = this.fn.retro_get_memory_data(id)
    if (!size || !data) return null
    return {
      length: size,
      read: () => readBytes(data, size),
      write: bytes => koffi.encode(data, arrayType('uint8_t', Math.min(size, bytes.length)), bytes.subarray(0, size))
    }
  }

  serialize(): Uint8Array {
    const size = Number(this.fn.retro_serialize_size())
    const out = Buffer.alloc(size)
    if (!this.fn.retro_serialize(out, size)) throw new Error('The core could not create a save state.')
    return out
  }

  unserialize(state: Uint8Array) { if (!this.fn.retro_unserialize(state, state.length)) throw new Error('The core rejected this save state.') }

  reset() { this.fn.retro_reset() }

  close() {
    if (this.loaded) this.fn.retro_unload_game()
    this.loaded = false
    this.fn.retro_deinit()
    for (const cb of this.callbacks) koffi.unregister(cb)
    this.callbacks = []
    this.lib.unload()
  }

  private cString(value: string) {
    const bytes = Buffer.from(value + '\0', 'utf8')
    const memory = koffi.alloc('char', bytes.length)
    koffi.encode(memory, 'char', bytes.toString('latin1'), bytes.length)
    this.strings.push(memory)
    return memory
  }

  private environment(raw: number, data: unknown): boolean {
    const cmd = raw & ~EXPERIMENTAL
    switch (cmd) {
      case ENV.GET_CAN_DUPE: koffi.encode(data, 'bool', true); return true
      case ENV.SET_PERFORMANCE_LEVEL: return true
      case ENV.GET_SYSTEM_DIRECTORY: koffi.encode(data, 'void *', this.cString(this.dirs.system)); return true
      case ENV.GET_SAVE_DIRECTORY: koffi.encode(data, 'void *', this.cString(this.dirs.save)); return true
      case ENV.SET_PIXEL_FORMAT: {
        const format = koffi.decode(data, 'int') as number
        if (format !== PIXEL.XRGB8888 && format !== PIXEL.RGB565) return false
        this.pixelFormat = format; return true
      }
      case ENV.SET_INPUT_DESCRIPTORS: return true
      case ENV.SET_HW_RENDER: return false
      case ENV.GET_CORE_OPTIONS_VERSION: koffi.encode(data, 'unsigned int', 0); return true
      case ENV.SET_VARIABLES: {
        for (let offset = 0; ; offset += 16) {
          const entry = koffi.decode(data, offset, Variable) as { key: string | null; value: string | null }
          if (!entry.key) break
          const [description, list = ''] = (entry.value ?? '').split('; ')
          this.options.push({ key: entry.key, description, values: list.split('|') })
        }
        return true
      }
      case ENV.GET_VARIABLE: {
        const entry = koffi.decode(data, Variable) as { key: string | null }
        const value = entry.key ? this.values[entry.key] : undefined
        if (value === undefined) return false
        koffi.encode(data, 8, 'void *', this.cString(value)); return true
      }
      case ENV.GET_VARIABLE_UPDATE: koffi.encode(data, 'bool', this.variablesChanged); this.variablesChanged = false; return true
      case ENV.SET_SUPPORT_NO_GAME: return true
      case ENV.SET_SYSTEM_AV_INFO: case ENV.SET_GEOMETRY: {
        const av = koffi.decode(data, cmd === ENV.SET_GEOMETRY ? Geometry : AvInfo) as Record<string, any>
        const geometry = cmd === ENV.SET_GEOMETRY ? av : av.geometry
        this.av.width = geometry.base_width; this.av.height = geometry.base_height
        if (cmd === ENV.SET_SYSTEM_AV_INFO) { this.av.fps = av.timing.fps; this.av.sampleRate = av.timing.sample_rate }
        return true
      }
      case ENV.GET_LANGUAGE: koffi.encode(data, 'unsigned int', 0); return true
      case ENV.GET_AUDIO_VIDEO_ENABLE: if (data) koffi.encode(data, 'int', 3); return true
      case ENV.GET_FASTFORWARDING: if (data) koffi.encode(data, 'bool', false); return true
      case ENV.GET_INPUT_BITMASKS: return true
      case ENV.GET_INPUT_MAX_USERS: if (data) koffi.encode(data, 'unsigned int', 1); return true
      default: this.log.push(`env ${raw}`); return false
    }
  }

  private video(data: unknown, width: number, height: number, pitch: number) {
    if (!data) return
    const bytesPerPixel = this.pixelFormat === PIXEL.XRGB8888 ? 4 : 2
    const source = readBytes(data, Number(pitch) * height)
    const pixels = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      const row = y * Number(pitch)
      if (bytesPerPixel === 4) {
        for (let x = 0; x < width; x++) {
          const s = row + x * 4, d = (y * width + x) * 4
          pixels[d] = source[s + 2]; pixels[d + 1] = source[s + 1]; pixels[d + 2] = source[s]; pixels[d + 3] = 255
        }
      } else {
        for (let x = 0; x < width; x++) {
          const v = source[row + x * 2] | (source[row + x * 2 + 1] << 8), d = (y * width + x) * 4
          pixels[d] = ((v >> 11) & 31) * 255 / 31; pixels[d + 1] = ((v >> 5) & 63) * 255 / 63; pixels[d + 2] = (v & 31) * 255 / 31; pixels[d + 3] = 255
        }
      }
    }
    this.frame = { width, height, pixels }
  }

  private input(port: number, device: number, id: number): number {
    if (port !== 0) return 0
    if (device === DEVICE_JOYPAD) return id === ID_JOYPAD_MASK ? this.buttons : (this.buttons >> id) & 1
    if (device === DEVICE_POINTER) {
      if (id === 0) return this.pointer.x
      if (id === 1) return this.pointer.y
      if (id === 2) return this.pointer.pressed ? 1 : 0
    }
    return 0
  }
}
