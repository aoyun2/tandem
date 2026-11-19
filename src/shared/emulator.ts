/** Messages between the renderer and the emulator utility process. */

export const DS_BUTTONS = ['A', 'B', 'X', 'Y', 'L', 'R', 'Start', 'Select', 'Up', 'Down', 'Left', 'Right'] as const
export type DSButton = typeof DS_BUTTONS[number]

/** libretro joypad bit for each DS button. */
export const RETRO_BIT: Record<DSButton, number> = {
  B: 0, Y: 1, Select: 2, Start: 3, Up: 4, Down: 5, Left: 6, Right: 7, A: 8, X: 9, L: 10, R: 11
}

export type EmulatorConfig = {
  core: string
  rom: string
  save: string
  systemDir: string
  saveDir: string
  /** Fast-forward through the opening to the title screen before real-time play. */
  warmToTitle: boolean
  /** Show one frame, then hold until the renderer unpauses, so play and its music start from that frame. */
  hold: boolean
}

export type ToEmulator =
  | { type: 'input'; buttons: number; touch: { x: number; y: number } | null }
  | { type: 'pause'; paused: boolean }
  | { type: 'stop' }

export type FromEmulator =
  | { type: 'ready'; width: number; height: number; fps: number; sampleRate: number; save: 'loaded' | 'new' }
  | { type: 'frame'; width: number; height: number; pixels: ArrayBuffer; audio: ArrayBuffer | null }
  | { type: 'saved'; bytes: number; at: number }
  | { type: 'stats'; fps: number; frameMs: number }
  | { type: 'game'; state: import('./run').GameState }
  | { type: 'error'; message: string }
  | { type: 'stopped' }

/** DS screen size in pixels. */
export const DS_SCREEN = { width: 256, height: 192 } as const
