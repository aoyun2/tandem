import { useEffect, useState } from 'react'
import { ArrowRight, Check, Plus, X } from 'lucide-react'
import { TandemMark } from './TandemMark'
import { NewRun } from './NewRun'
import type { LibraryRom, Profile, RomInfo } from '../../shared/api'
import type { Rules } from '../../shared/run'

type Step = 'profile' | 'game' | 'run'
const STEPS: Step[] = ['profile', 'game', 'run']
const art = (game: string) => new URL(`./art/${game === 'White 2' ? 'white2' : 'black2'}.png`, document.baseURI).href

function Avatar({ name }: { name: string }) {
  return <span className="onboarding-avatar">{(name || '?').slice(0, 1).toUpperCase()}</span>
}

/**
 * First launch: your name, then, welcomed by it, your game and your first run. Opened from your profile later, it
 * shows only your name.
 */
export function Onboarding({ profile, manage, rom, library, busy, error, onName, onAdd, onStartRun, onClose }: {
  profile: Profile; manage: boolean; rom: RomInfo | null; library: LibraryRom[]; busy: boolean; error: string
  onName: (name: string) => void; onAdd: () => void
  onStartRun: (rules: Rules) => Promise<unknown>; onClose: () => void
}) {
  const [step, setStep] = useState<Step>('profile')
  const [name, setName] = useState(profile.name)
  const next = () => { const i = STEPS.indexOf(step); if (manage || i === STEPS.length - 1) onClose(); else setStep(STEPS[i + 1]) }
  const ok = name.trim().length > 0
  return <div className="onboarding" role="dialog" aria-label={manage ? 'Your profile' : 'Welcome'} onKeyDown={e => { if (e.key === 'Escape' && manage) { e.preventDefault(); onClose() } }}>
    <div className="onboarding-card" data-step={step} key={step}>
      {manage && <button type="button" className="island-icon onboarding-close" onClick={onClose} aria-label="Close"><X size={16}/></button>}
      {!manage && <ol className="onboarding-steps" aria-hidden="true">{STEPS.map(s => <li key={s} data-on={STEPS.indexOf(s) <= STEPS.indexOf(step)}/>)}</ol>}

      {step !== 'profile' && <h1 className="onboarding-welcome">Welcome, {name.trim() || profile.name}</h1>}

      {step === 'profile' && <form className="onboarding-form" onSubmit={e => { e.preventDefault(); if (ok) { onName(name.trim()); next() } }}>
        {manage ? <Avatar name={name}/> : <TandemMark/>}
        <label><h1>What’s your name?</h1><input autoFocus value={name} maxLength={16} onChange={e => setName(e.target.value)} spellCheck={false} aria-label="Your name"/></label>
        <button className="island-play" data-confirm disabled={!ok}>{manage ? <><Check size={16}/>Save</> : <>Continue<ArrowRight size={16}/></>}</button>
      </form>}

      {step === 'game' && <>
        {rom ? <img className="onboarding-cover" src={art(rom.game)} alt={`Pokémon ${rom.game}`}/> : <span className="onboarding-slot"/>}
        {rom && <h2>Pokémon {rom.game}</h2>}
        {error && <p className="island-error" role="alert">{error}</p>}
        <div className="island-actions">
          {rom ? <button className="island-play" onClick={next}>Continue<ArrowRight size={16}/></button>
            : <button className="island-play" disabled={busy} onClick={onAdd}>{busy ? <span className="spinner"/> : <Plus size={16}/>}Add ROM</button>}
          {!rom && library.length === 0 && <button className="island-quiet" onClick={onClose}>Later</button>}
        </div>
      </>}

      {step === 'run' && rom && <NewRun game={rom.game} onStart={rules => { void onStartRun(rules).then(onClose) }} onCancel={onClose}/>}
      {step === 'run' && !rom && <button className="island-play" onClick={onClose}>Done</button>}
    </div>
  </div>
}
