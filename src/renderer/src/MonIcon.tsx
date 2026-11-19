import type { CSSProperties } from 'react'
import type { GameNames } from '../../shared/api'

/** A species' party icon from the ROM, bobbing between its two frames: slower at low health, still once fainted. */
export function MonIcon({ names, species, size = 32, hp = 1, fainted = false }: { names: GameNames | null; species: number; size?: number; hp?: number; fainted?: boolean }) {
  const icon = names?.icons?.[species]
  if (!icon) return null
  const pace = fainted ? 'still' : hp < .25 ? 'low' : hp < .5 ? 'mid' : 'high'
  return <span className="mon-icon" data-pace={pace} aria-hidden style={{ '--icon': `url(${icon})`, '--size': `${size}px` } as CSSProperties}/>
}
