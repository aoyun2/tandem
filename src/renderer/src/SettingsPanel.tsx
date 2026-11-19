import { useEffect, useState } from 'react'
import { ChevronRight, Gamepad2, Gauge, Keyboard, Music2, RotateCcw, Sparkles, Volume2 } from 'lucide-react'
import { changeSettings, settings, watchSettings, type Settings } from './settings'
import { bindKey, keyLabel, loadKeys, resetBindings } from './input/bindings'
import { BUTTONS } from './input/buttons'
import { DsGlyph } from './ControlsOverlay'
import type { DSButton } from '../../shared/emulator'

const IGNORED = new Set(['Escape', 'Tab', 'MetaLeft', 'MetaRight'])

/** One volume as an icon and a slider. */
function Volume({ icon: Icon, label, value, onChange }: { icon: typeof Music2; label: string; value: number; onChange: (v: number) => void }) {
  return <label className="settings-volume" title={label}>
    <Icon size={18}/><input type="range" min={0} max={1} step={.01} value={value} aria-label={label} onChange={e => onChange(Number(e.target.value))} style={{ '--level': value } as React.CSSProperties}/>
  </label>
}

/**
 * Settings: music and effects volume, graphics quality, and the keyboard controls as the DS button beside its key;
 * clicking a key waits for the next one.
 */
export function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => watchSettings(setS), [])
  const [keys, setKeys] = useState(loadKeys)
  const [capture, setCapture] = useState<DSButton | null>(null)
  useEffect(() => {
    if (!capture) return
    const key = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.code === 'Escape') { setCapture(null); return }
      if (IGNORED.has(e.code)) return
      setKeys(k => bindKey(k, capture, e.code)); setCapture(null)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [capture])
  if (!s) return null
  const keyOf = (b: DSButton) => Object.keys(keys).find(k => keys[k] === b)
  return <div className="settings-panel">
    <section aria-label="Audio">
      <Volume icon={Music2} label="Music" value={s.music} onChange={music => changeSettings({ music })}/>
      <Volume icon={Volume2} label="Effects" value={s.effects} onChange={effects => changeSettings({ effects })}/>
    </section>
    <section aria-label="Graphics" className="settings-quality" role="radiogroup">
      {([['balanced', Gauge, 'Balanced'], ['high', Sparkles, 'High']] as const).map(([id, Icon, name]) =>
        <button key={id} role="radio" aria-checked={s.quality === id} onClick={() => changeSettings({ quality: id })}><Icon size={18}/>{name}</button>)}
    </section>
    <section aria-label="Controls" className="settings-keys">
      {BUTTONS.map(b => <button key={b} data-capture={capture === b} onClick={() => setCapture(capture === b ? null : b)} aria-label={`${b}: ${keyOf(b) ? keyLabel(keyOf(b)!) : 'none'}`}>
        <DsGlyph button={b}/><kbd>{capture === b ? '…' : keyOf(b) ? keyLabel(keyOf(b)!) : ''}</kbd>
      </button>)}
      <button className="settings-reset" onClick={() => { resetBindings(); setKeys(loadKeys()) }} title="Default keys" aria-label="Default keys"><RotateCcw size={16}/></button>
    </section>
  </div>
}

/** A volume as a slim slider; the glyph mutes it. */
function StepBar({ value, icon: Icon, label, onChange }: { value: number; icon: typeof Music2; label: string; onChange: (v: number) => void }) {
  return <div className="volume" style={{ '--value': value } as React.CSSProperties}>
    <button type="button" className="volume-glyph" onClick={() => onChange(value ? 0 : .6)} aria-label={value ? `Mute ${label.toLowerCase()}` : `Unmute ${label.toLowerCase()}`} title={value ? 'Mute' : 'Unmute'}><Icon size={16}/></button>
    <input type="range" min={0} max={1} step={.05} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label} title={`${Math.round(value * 100)}%`}/>
  </div>
}

/** Standard or Sharp: how many pixels the 3D scenes draw each frame, as two tiles. */
function Detail({ quality }: { quality: Settings['quality'] }) {
  return <ul className="rule-tiles detail-tiles" role="radiogroup" aria-label="Detail">
    <li data-on={quality === 'balanced'} title="Up to 2.2 million pixels a frame: smoother on laptops and integrated graphics">
      <button type="button" role="radio" aria-checked={quality === 'balanced'} onClick={() => changeSettings({ quality: 'balanced' })}><Gauge size={18}/><b>Standard</b></button>
    </li>
    <li data-on={quality === 'high'} title="Up to 4 million pixels a frame: sharper on large and high-density screens">
      <button type="button" role="radio" aria-checked={quality === 'high'} onClick={() => changeSettings({ quality: 'high' })}><Sparkles size={18}/><b>Sharp</b></button>
    </li>
  </ul>
}

/** Settings during play: the two volumes and the detail, in the console's own style. */
export function QuickSettings() {
  const [s, setS] = useState(settings())
  useEffect(() => watchSettings(setS), [])
  return <div className="quick-settings">
    <StepBar value={s.music} icon={Music2} label="Music" onChange={v => changeSettings({ music: v })}/>
    <StepBar value={s.effects} icon={Volume2} label="Effects" onChange={v => changeSettings({ effects: v })}/>
    <Detail quality={s.quality}/>
  </div>
}

/**
 * The Settings page as one panel of rows, each with a short fact on hover: music and effects volume; how many pixels
 * the 3D scenes draw each frame; and the keyboard and the controller, which open the console's controls view to bind
 * them.
 */
export function SettingsPage({ onControls }: { onControls: () => void }) {
  const [s, setS] = useState(settings())
  useEffect(() => watchSettings(setS), [])
  const padNow = () => [...(navigator.getGamepads?.() ?? [])].find(Boolean)?.id ?? ''
  const [pad, setPad] = useState(padNow)
  useEffect(() => {
    const update = () => setPad(padNow())
    window.addEventListener('gamepadconnected', update); window.addEventListener('gamepaddisconnected', update)
    return () => { window.removeEventListener('gamepadconnected', update); window.removeEventListener('gamepaddisconnected', update) }
  }, [])
  return <>
    <div className="page-heading"><h1>Settings</h1></div>
    <section className="glass roadmap settings-list">
      <div className="roadmap-row settings-line" title="The menu music, from your game's soundtrack"><span className="stage-icon"><Music2 size={20} strokeWidth={1.7}/></span><h2>Music</h2><StepBar value={s.music} icon={Music2} label="Music" onChange={v => changeSettings({ music: v })}/></div>
      <div className="roadmap-row settings-line" title="Interface sounds: hovers, clicks and confirmations"><span className="stage-icon"><Volume2 size={20} strokeWidth={1.7}/></span><h2>Effects</h2><StepBar value={s.effects} icon={Volume2} label="Effects" onChange={v => changeSettings({ effects: v })}/></div>
      <div className="roadmap-row settings-line" title="How sharply the 3D scenes are drawn"><span className="stage-icon"><Gauge size={20} strokeWidth={1.7}/></span><h2>Detail</h2><Detail quality={s.quality}/></div>
      <button type="button" className="roadmap-row settings-line settings-open" onClick={onControls} title="Bind each DS button to a key"><span className="stage-icon"><Keyboard size={20} strokeWidth={1.7}/></span><h2>Keyboard</h2><ChevronRight size={18}/></button>
      <button type="button" className="roadmap-row settings-line settings-open" onClick={onControls} disabled={!pad} title={pad || 'Connect a controller to bind its buttons'}><span className="stage-icon"><Gamepad2 size={20} strokeWidth={1.7}/></span><h2>Controller</h2>{pad ? <em>{pad.replace(/\s*\(.*\)$/, '')}</em> : null}<ChevronRight size={18}/></button>
    </section>
  </>
}
