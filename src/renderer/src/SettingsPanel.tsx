import { useEffect, useState } from 'react'
import { Gauge, Music2, RotateCcw, Sparkles, Volume2 } from 'lucide-react'
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

/** Settings during play, drawn like the console's touch screen: a ten-step bar for each volume and the quality switch. */
export function QuickSettings() {
  const [s, setS] = useState(settings())
  useEffect(() => watchSettings(setS), [])
  const bar = (kind: 'music' | 'effects', Icon: typeof Music2) => <div className="quick-bar" role="slider" aria-label={kind === 'music' ? 'Music' : 'Effects'} aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.round(s[kind] * 10)}>
    <button type="button" className="quick-glyph" onClick={() => changeSettings({ [kind]: 0 })} aria-label="Mute"><Icon size={17}/></button>
    {Array.from({ length: 10 }, (_, k) => <button type="button" key={k} data-on={k < Math.round(s[kind] * 10)} onClick={() => changeSettings({ [kind]: (k + 1) / 10 })} aria-label={`${(k + 1) * 10}%`}/>)}
  </div>
  return <div className="quick-settings">
    {bar('music', Music2)}
    {bar('effects', Volume2)}
    <div className="quick-quality" role="radiogroup" aria-label="Quality">
      {(['balanced', 'high'] as const).map(q => <button type="button" key={q} role="radio" aria-checked={s.quality === q} onClick={() => changeSettings({ quality: q })}>{q === 'high' ? 'High' : 'Balanced'}</button>)}
    </div>
  </div>
}
