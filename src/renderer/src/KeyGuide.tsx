import { useEffect, useState, type CSSProperties } from 'react'
import { loadKeys } from './input/bindings'
import { playStripSound } from './display/bootAudio'

const ROWS: string[][] = [
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Enter'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Space']
]
const ARROWS = [['', 'ArrowUp', ''], ['ArrowLeft', 'ArrowDown', 'ArrowRight']]
const DS: Record<string, string> = { Select: 'SEL', Start: 'STA', Up: '▲', Down: '▼', Left: '◀', Right: '▶' }
const cap = (code: string) => ({ Enter: '⏎', ShiftLeft: '⇧', Space: '␣', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' } as Record<string, string>)[code] ?? code.replace(/^Key/, '')

/**
 * A small keyboard under your screens: mapped keys are lit and carry the DS button they drive.
 * Always shown; it powers on after the screens, and keys light while held.
 */
export function KeyGuide() {
  const [keys] = useState<Record<string, string>>(loadKeys)
  const [held, setHeld] = useState<Set<string>>(new Set())
  useEffect(() => matchMedia('(prefers-reduced-motion: reduce)').matches ? undefined : playStripSound(), [])
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (keys[e.code]) setHeld(old => new Set(old).add(e.code))
    }
    const up = (e: KeyboardEvent) => {
      setHeld(old => { const next = new Set(old); next.delete(e.code); return next })
    }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [keys])
  // Keys light in a sweep from left to right as the strip powers on: the column sets the delay.
  const key = (column: number) => (code: string, i: number) => {
    if (!code) return <span key={i} className="kb-gap"/>
    const action = keys[code]
    return <span key={code} style={{ '--i': column + i } as CSSProperties} className={`kb-key ${action ? 'mapped' : ''} ${held.has(code) ? 'held' : ''} ${code === 'Space' ? 'space' : code === 'ShiftLeft' || code === 'Enter' ? 'wide' : ''}`}>
      {action ? <><b>{DS[action] ?? action}</b><i>{cap(code)}</i></> : <i>{cap(code)}</i>}
    </span>
  }
  return <div className="key-guide-strip" data-visible role="img" aria-label={`Keyboard controls: ${Object.entries(keys).map(([code, action]) => `${cap(code)} ${action}`).join(', ')}`}>
    <div className="kb-main">{ROWS.map((row, r) => <div key={r} className={`kb-row r${r}`}>{row.map(key(r))}</div>)}</div>
    <div className="kb-arrows">{ARROWS.map((row, r) => <div key={r} className="kb-row">{row.map(key(11 + r))}</div>)}</div>
  </div>
}
