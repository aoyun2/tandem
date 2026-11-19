import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { bindKey, bindPad, isDefault, keyLabel, loadKeys, loadPad, padLabel, resetBindings } from './input/bindings'
import { BUTTONS, buttonEvents, buttonState } from './input/buttons'
import type { DSButton } from '../../shared/emulator'

const NAMES: Record<DSButton, string> = { A: 'A', B: 'B', X: 'X', Y: 'Y', L: 'L', R: 'R', Start: 'Start', Select: 'Select', Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right' }
const IGNORED = new Set(['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'F1'])
const ROW = 38, GUTTER = 36

/** The DS button itself, drawn the way it looks on the console: face buttons, the d-pad with one arm lit, shoulder tabs, Start and Select. */
export function DsGlyph({ button }: { button: DSButton }) {
  if (['A', 'B', 'X', 'Y'].includes(button)) return <svg className="ds-glyph" viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="12" className="ds-cap"/><text x="14" y="18.5" textAnchor="middle">{button}</text></svg>
  if (['Up', 'Down', 'Left', 'Right'].includes(button)) {
    const arm = { Up: 'M11 3h6v8h-6z', Down: 'M11 17h6v8h-6z', Left: 'M3 11h8v6H3z', Right: 'M17 11h8v6h-8z' }[button as 'Up']
    return <svg className="ds-glyph" viewBox="0 0 28 28" aria-hidden="true"><path className="ds-cap" d="M11 3h6v8h8v6h-8v8h-6v-8H3v-6h8z"/><path className="ds-lit" d={arm}/></svg>
  }
  if (button === 'L' || button === 'R') return <svg className="ds-glyph wide" viewBox="0 0 40 24" aria-hidden="true">
    <path className="ds-cap" d={button === 'L' ? 'M4 20V10c0-4 4-7 9-7h23v17z' : 'M36 20V10c0-4-4-7-9-7H4v17z'}/><text x="20" y="16.5" textAnchor="middle">{button}</text></svg>
  return <svg className="ds-glyph wide" viewBox="0 0 52 24" aria-hidden="true"><rect className="ds-cap" x="4" y="7" width="14" height="10" rx="5"/><text x="21" y="15.5" className="ds-word">{button.toUpperCase()}</text></svg>
}

type Point = { x: number; y: number }
export type ButtonAnchors = { points: Partial<Record<DSButton, Point>>; left: number; right: number; width: number; height: number }
type Callout = { button: DSButton; side: -1 | 1; anchor: Point; y: number }

/** Labels in two columns beside the console, each kept near its button's height without overlapping its neighbours. */
function callouts(anchors: Partial<Record<DSButton, Point>>, centre: number, height: number): Callout[] {
  const out: Callout[] = []
  for (const side of [-1, 1] as const) {
    const column = BUTTONS.flatMap(button => { const a = anchors[button]; return a && (a.x < centre ? -1 : 1) === side ? [{ button, side, anchor: a, y: a.y }] : [] }).sort((a, b) => a.anchor.y - b.anchor.y)
    for (let i = 1; i < column.length; i++) column[i].y = Math.max(column[i].y, column[i - 1].y + ROW)
    const overflow = (column.at(-1)?.y ?? 0) - (height - ROW)
    if (overflow > 0) for (const c of column) c.y -= overflow
    for (let i = column.length - 2; i >= 0; i--) column[i].y = Math.min(column[i].y, column[i + 1].y - ROW)
    out.push(...column)
  }
  return out
}

/**
 * Controls on the Home console. Each button has a keycap beside the console on a leader line; click a button or its
 * keycap, then press the key or controller button that should drive it. The scene lights buttons from `buttonState`.
 */
export function ControlsOverlay({ anchors }: { anchors: ButtonAnchors | null }) {
  const [keys, setKeys] = useState(loadKeys), [pad, setPad] = useState(loadPad)
  const keysRef = useRef(keys); keysRef.current = keys
  const padRef = useRef(pad); padRef.current = pad
  const [capture, setCapture] = useState<DSButton | ''>(''), [hover, setHover] = useState<DSButton | ''>('')
  const captureRef = useRef(capture); captureRef.current = capture
  const [padName, setPadName] = useState('')
  useEffect(() => { buttonState.capture = capture }, [capture])
  useEffect(() => { buttonState.hover = hover }, [hover])
  useEffect(() => () => { buttonState.capture = ''; buttonState.hover = ''; buttonState.pressed.clear() }, [])

  // Hover and clicks on the console itself.
  useEffect(() => {
    const onHover = (e: Event) => setHover((e as CustomEvent<DSButton | ''>).detail)
    const onPick = (e: Event) => { const b = (e as CustomEvent<DSButton | ''>).detail; setCapture(b && captureRef.current !== b ? b : '') }
    buttonEvents.addEventListener('hover', onHover); buttonEvents.addEventListener('pick', onPick)
    return () => { buttonEvents.removeEventListener('hover', onHover); buttonEvents.removeEventListener('pick', onPick) }
  }, [])

  useEffect(() => {
    let previous = new Set<number>(), bound = ''
    const heldKeys = new Set<string>()
    const timer = setInterval(() => {
      const gamepad = Array.from(navigator.getGamepads()).find(p => p && !/microphone|\bmic\b|audio|speaker|headset/i.test(p.id) && (p.mapping === 'standard' || (p.buttons.length >= 12 && p.axes.length >= 2)))
      setPadName(gamepad?.id.replace(/\s*\(.*\)\s*$/, '') ?? '')
      const down = gamepad ? gamepad.buttons.flatMap((b, i) => b.pressed ? [i] : []) : []
      const fresh = down.find(i => !previous.has(i))
      if (captureRef.current && fresh !== undefined) { setPad(bindPad(padRef.current, captureRef.current, fresh)); setCapture('') }
      previous = new Set(down)
      buttonState.pressed = new Set([...BUTTONS.filter(b => down.includes(padRef.current[b])), ...[...heldKeys].map(code => keysRef.current[code]).filter(Boolean)])
    }, 50)
    const keydown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && captureRef.current) { e.preventDefault(); setCapture(''); return }
      if (captureRef.current && !IGNORED.has(e.code) && !e.repeat) { e.preventDefault(); bound = e.code; setKeys(bindKey(keysRef.current, captureRef.current, e.code)); setCapture(''); return }
      heldKeys.add(e.code)
    }
    // A bound key must not also activate whichever control has focus (Space activates on release).
    const keyup = (e: KeyboardEvent) => { heldKeys.delete(e.code); if (bound === e.code) { e.preventDefault(); bound = '' } }
    const blur = () => heldKeys.clear()
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur)
    return () => { clearInterval(timer); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur) }
  }, [])

  const keyFor = (button: DSButton) => Object.keys(keys).find(code => keys[code] === button)
  const labels = anchors ? callouts(anchors.points, (anchors.left + anchors.right) / 2, anchors.height) : []
  return <div className="controls-overlay" data-ready={!!anchors}>
    <header className="controls-header">
      <span className="pad-state" data-connected={!!padName}>{padName || 'No controller connected'}</span>
      <button className="island-chip reset-bindings" disabled={isDefault(keys, pad)} onClick={() => { const next = resetBindings(); setKeys(next.keys); setPad(next.pad); setCapture('') }}><RotateCcw size={14} strokeWidth={1.75}/>Reset to defaults</button>
    </header>
    {anchors && <svg className="callout-lines" width={anchors.width} height={anchors.height} aria-hidden="true">
      {labels.map(c => {
        const x = c.side < 0 ? anchors.left - GUTTER : anchors.right + GUTTER, elbow = c.side < 0 ? anchors.left - GUTTER / 3 : anchors.right + GUTTER / 3
        return <polyline key={c.button} data-active={capture === c.button || hover === c.button} points={`${c.anchor.x},${c.anchor.y} ${elbow},${c.y} ${x},${c.y}`}/>
      })}
    </svg>}
    {anchors && labels.map(c => {
      const key = keyFor(c.button), active = capture === c.button
      return <button key={c.button} className="callout" data-side={c.side < 0 ? 'left' : 'right'} data-capture={active} data-hover={hover === c.button}
        style={{ top: c.y, ...(c.side < 0 ? { right: anchors.width - anchors.left + GUTTER } : { left: anchors.right + GUTTER }) }}
        onPointerEnter={() => setHover(c.button)} onPointerLeave={() => setHover('')} onClick={() => setCapture(active ? '' : c.button)} onPointerUp={e => e.currentTarget.blur()}
        aria-label={`${NAMES[c.button]}: ${key ? keyLabel(key) : 'no key'}${padName ? `, controller ${padLabel(pad[c.button])}` : ''}. Click to change.`}>
        <DsGlyph button={c.button}/>
        {active ? <kbd aria-hidden="true">…</kbd> : <>
          <kbd>{key ? keyLabel(key) : '—'}</kbd>
          {padName && <span className="callout-pad">{padLabel(pad[c.button])}</span>}
        </>}
      </button>
    })}
  </div>
}
