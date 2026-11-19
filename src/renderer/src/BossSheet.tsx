import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Crown, MapPin, Swords, Users } from 'lucide-react'
import type { GameNames } from '../../shared/api'
import { BOSSES, nextBoss, trainersOf, type Boss } from '../../shared/progression'
import { TYPES, TYPE_COLORS, bestAttackers } from '../../shared/pokemonTypes'
import { MonIcon } from './MonIcon'

/** A type as the games draw it, or a tinted chip when the ROM's label is missing. */
export function TypeLabel({ names, type }: { names: GameNames | null; type: number }) {
  const label = names?.typeLabels?.[type]
  return label ? <img className="type-label" src={label} alt={TYPES[type]} title={TYPES[type]}/>
    : <span className="type-label" style={{ '--type': TYPE_COLORS[type] } as CSSProperties}>{TYPES[type]}</span>
}

/** A boss's face from the ROM, or a symbol for the Elite Four and the Champion. */
function BossFace({ names, boss, size }: { names: GameNames | null; boss: Boss; size: number }) {
  const face = names?.faces?.[boss.name]
  return face ? <img className="boss-face" src={face} alt="" style={{ width: size, height: size }}/>
    : <span className="boss-face" style={{ width: size, height: size }}>{boss.members ? <Users size={size * .45}/> : <Crown size={size * .45}/>}</span>
}

/**
 * The current goal, unfolded from the objective: the leaders already beaten as a shelf of faces; the story route to
 * the next boss; and that boss's team in Normal mode with levels, types, held items and moves, the cap, and the types
 * that hit most of the team super-effectively (for the Elite Four, of each member's team). It moves on with each badge.
 */
export function BossSheet({ names, badges, caps, style, onClose }: { names: GameNames | null; badges: number; caps: boolean; style: CSSProperties; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState('')
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close.current() } }
    const outside = (e: PointerEvent) => { if (!sheet.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.run-objective')) close.current() }
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', outside, true)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', outside, true) }
  }, [])
  const boss = nextBoss(badges)
  const beaten = BOSSES.slice(0, Math.min(badges, 8))
  const teams = trainersOf(boss).map(name => ({ name, team: names?.teams?.[name] ?? [] }))
  const everyone = teams.flatMap(t => t.team)
  const typesOf = (species: number) => [...new Set(names?.types?.[species] ?? [])]
  const best = bestAttackers(everyone.map(m => typesOf(m.species)))
  const tint = boss.type !== null ? TYPE_COLORS[boss.type] : '#f2c66b'
  return <div className="boss-sheet" ref={sheet} role="dialog" aria-label={boss.name} style={{ ...style, '--type': tint } as CSSProperties}>
    {beaten.length > 0 && <ol className="boss-shelf" aria-label="Badges">
      {beaten.map(b => <li key={b.name} title={`${b.name} · ${b.badge}`} style={{ '--type': b.type !== null ? TYPE_COLORS[b.type] : '#f2c66b' } as CSSProperties}>
        <BossFace names={names} boss={b} size={26}/>
      </li>)}
    </ol>}
    {boss.path.length > 0 && <ol className="boss-path" aria-label="Route">
      {boss.path.map((place, i) => <li key={i}><i/>{place}</li>)}
      <li data-goal><MapPin size={13}/>{boss.place}</li>
    </ol>}
    <header className="boss-head" key={boss.name}>
      <BossFace names={names} boss={boss} size={64}/>
      <span><b>{boss.name}</b>{boss.path.length === 0 && <em>{boss.place}</em>}{boss.type !== null && <TypeLabel names={names} type={boss.type}/>}</span>
      {caps && boss.cap !== null && <strong title="Level cap">{boss.cap}</strong>}
    </header>
    {!boss.members && best.length > 0 && <div className="boss-bring" key={`bring-${boss.name}`}>
      <Swords size={15} aria-label="Strong against this team"/>
      {best.map(a => <span key={a.type} title={`Super-effective on ${a.hits} of ${everyone.length}`}>
        <TypeLabel names={names} type={a.type}/>
        <i className="boss-pips" aria-hidden>{everyone.map((_, k) => <b key={k} data-on={k < a.hits}/>)}</i>
      </span>)}
    </div>}
    <div className="boss-teams" key={`teams-${boss.name}`}>
      {teams.map(({ name, team }) => <section key={name} className="boss-team">
        {boss.members && <h3>{name}<Swords size={12} aria-label="Strong against this team"/>{bestAttackers(team.map(m => typesOf(m.species)), 2).map(a => <TypeLabel key={a.type} names={names} type={a.type}/>)}</h3>}
        <ul>
          {team.map((m, k) => <li key={k} tabIndex={0} data-open={open === `${name}-${k}`} style={{ '--type': TYPE_COLORS[typesOf(m.species)[0] ?? 0] } as CSSProperties}
            onPointerEnter={() => setOpen(`${name}-${k}`)} onPointerLeave={() => setOpen(o => o === `${name}-${k}` ? '' : o)}
            onFocus={() => setOpen(`${name}-${k}`)} onBlur={() => setOpen(o => o === `${name}-${k}` ? '' : o)} onClick={() => setOpen(`${name}-${k}`)}>
            <MonIcon names={names} species={m.species} size={40}/>
            <span className="boss-level">{m.level}</span>
            <span className="boss-types">{typesOf(m.species).map(t => <TypeLabel key={t} names={names} type={t}/>)}</span>
            <div className="boss-moves" role="tooltip">
              <b>{names?.species[m.species] ?? `#${m.species}`}</b>
              {m.item && <em>{m.item}</em>}
              {m.moves.map((move, n) => <span key={n} style={{ '--type': TYPE_COLORS[move.type] ?? '#888' } as CSSProperties}>{move.name}</span>)}
            </div>
          </li>)}
        </ul>
      </section>)}
    </div>
  </div>
}
