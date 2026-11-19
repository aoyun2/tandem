import type { DSButton } from '../../../shared/emulator'

/** Keyboard code → DS button. */
export const defaultKeys: Record<string, DSButton> = { KeyQ: 'L', KeyE: 'R', KeyA: 'X', KeyS: 'Y', KeyZ: 'A', KeyX: 'B', KeyV: 'Select', Enter: 'Start', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }
/** DS button → standard-mapping gamepad button index. */
export const defaultPad: Record<DSButton, number> = { A: 0, B: 1, X: 2, Y: 3, L: 4, R: 5, Select: 8, Start: 9, Up: 12, Down: 13, Left: 14, Right: 15 }

const KEYS = 'keyboard-mappings', PAD = 'controller-mappings'

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

export const loadKeys = () => read<Record<string, DSButton>>(KEYS) ?? { ...defaultKeys }
export const loadPad = () => ({ ...defaultPad, ...read<Record<DSButton, number>>(PAD) })

/** Binds a key to a DS button; the button's previous key moves to whichever button the new key used to drive. */
export function bindKey(keys: Record<string, DSButton>, button: DSButton, code: string) {
  const next = { ...keys }
  const previous = Object.keys(next).find(k => next[k] === button)
  const displaced = next[code]
  if (previous) delete next[previous]
  if (displaced && displaced !== button && previous) next[previous] = displaced
  next[code] = button
  write(KEYS, next)
  return next
}

/** Binds a gamepad button to a DS button, swapping with the DS button that used it. */
export function bindPad(pad: Record<DSButton, number>, button: DSButton, index: number) {
  const next = { ...pad }
  const displaced = (Object.keys(next) as DSButton[]).find(b => next[b] === index && b !== button)
  if (displaced) next[displaced] = next[button]
  next[button] = index
  write(PAD, next)
  return next
}

export function keyLabel(code: string) {
  const named: Record<string, string> = { Enter: 'Enter', Space: 'Space', Backspace: 'Backspace', Tab: 'Tab', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
  return named[code] ?? code.replace(/^Key|^Digit|^Numpad/, m => m === 'Numpad' ? 'Num ' : '')
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'Left stick', 'Right stick', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home']
export const padLabel = (index: number) => PAD_NAMES[index] ?? `Button ${index + 1}`

/** Restores the default keyboard and controller bindings. */
export function resetBindings() {
  try { localStorage.removeItem(KEYS); localStorage.removeItem(PAD) } catch { /* storage unavailable */ }
  return { keys: { ...defaultKeys }, pad: { ...defaultPad } }
}

export function isDefault(keys: Record<string, DSButton>, pad: Record<DSButton, number>) {
  const same = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k])
  return same(keys, defaultKeys) && same(pad, defaultPad)
}
