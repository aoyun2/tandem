import { Settings, User, Users } from 'lucide-react'
import type { RunMode } from './Island'
import { TandemMark } from './TandemMark'

/** The main menu beside the console: the choices slide out from behind it as panels turned towards the centre. */
export function MainMenu({ stage, onPick, onSettings }: { stage: 'menu' | 'open'; onPick: (mode: RunMode) => void; onSettings: () => void }) {
  const items = [
    { id: 'solo', icon: User, name: 'Solo', act: () => onPick('solo') },
    { id: 'soul-link', icon: Users, name: 'Soul Link', act: () => onPick('soul-link') },
    { id: 'settings', icon: Settings, name: 'Settings', act: onSettings }
  ]
  return <div className="main-menu" data-stage={stage}>
    <h1 className="main-menu-title" aria-hidden={stage !== 'menu'}><TandemMark/><span>Tandem</span></h1>
    <nav className="main-menu-items" aria-label="Main menu" aria-hidden={stage !== 'menu'}>
      {items.map(({ id, icon: Icon, name, act }, i) => <button key={id} className="main-menu-item" data-confirm style={{ '--i': i } as React.CSSProperties} tabIndex={stage === 'menu' ? 0 : -1} onClick={act}>
        <span className="main-menu-face"><Icon size={30} strokeWidth={1.6}/><span>{name}</span></span>
      </button>)}
    </nav>
  </div>
}
