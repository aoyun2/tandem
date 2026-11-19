import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Crown, Swords, Users } from 'lucide-react'
import type { GameNames, TrainerMon } from '../../shared/api'
import { BOSSES, nextBoss, trainersOf, type Boss } from '../../shared/progression'
import { TYPES, TYPE_COLORS, bestAttackers, effectiveness } from '../../shared/pokemonTypes'
import { MonIcon } from './MonIcon'

/** A type as the games draw it, or a tinted chip when the ROM's label is missing. */
export function TypeLabel({ names, type }: { names: GameNames | null; type: number }) {
  const label = names?.typeLabels?.[type]
  return label ? <img className="type-label" src={label} alt={TYPES[type]} title={TYPES[type]}/>
    : <span className="type-label" style={{ '--type': TYPE_COLORS[type] } as CSSProperties}>{TYPES[type]}</span>
}

/** A boss's face from the ROM, drawn full bleed, or a symbol for the Elite Four and the Champion. */
export function BossFace({ names, boss, size }: { names: GameNames | null; boss: Boss; size: number }) {
  const face = names?.faces?.[boss.name]
  return face ? <img className="boss-face" src={face} alt="" style={{ width: size, height: size }}/>
    : <span className="boss-face" data-symbol style={{ width: size, height: size }}>{boss.members ? <Users size={size * .5}/> : <Crown size={size * .5}/>}</span>
}

const typesOf = (names: GameNames | null, species: number) => [...new Set(names?.types?.[species] ?? [])]

/** Stats in the order the summary screen shows them, by their index in the personal data. */
const STAT_ORDER: [number, string][] = [[0, 'HP'], [1, 'Atk'], [2, 'Def'], [4, 'SpA'], [5, 'SpD'], [3, 'Spe']]
const CATEGORY = ['Status', 'Physical', 'Special']

/**
 * One Pokémon of a boss's team as its summary would show it: icon, level, types and item; its stats at that level
 * from its base stats and the trainer's IVs (neutral nature, no effort values); the types it is weak to, resists and
 * cannot be hit by; and each move with its type, category, power and accuracy.
 */
function MonProfile({ names, mon }: { names: GameNames | null; mon: TrainerMon }) {
  const types = typesOf(names, mon.species), base = names?.base?.[mon.species], iv = mon.iv ?? 0, L = mon.level
  const stat = (i: number) => base ? Math.floor((2 * base[i] + iv) * L / 100) + (i === 0 ? L + 10 : 5) : null
  const against = TYPES.map((_, t) => ({ t, m: effectiveness(t, types) }))
  const groups: [string, number[]][] = [['×4', against.filter(a => a.m >= 4).map(a => a.t)], ['×2', against.filter(a => a.m === 2).map(a => a.t)],
    ['×½', against.filter(a => a.m > 0 && a.m < 1).map(a => a.t)], ['×0', against.filter(a => a.m === 0).map(a => a.t)]]
  return <div className="mon-profile" key={`${mon.species}-${mon.level}`} style={{ '--type': TYPE_COLORS[types[0] ?? 0] } as CSSProperties}>
    <header>
      <MonIcon names={names} species={mon.species} size={64}/>
      <span className="mon-name"><b>{names?.species[mon.species] ?? `#${mon.species}`}</b><em>Lv {mon.level}{mon.item ? ` · ${mon.item}` : ''}</em></span>
      <span className="mon-types">{types.map(t => <TypeLabel key={t} names={names} type={t}/>)}</span>
    </header>
    {base && <ul className="mon-stats">
      {STAT_ORDER.map(([i, name]) => <li key={name}><span>{name}</span><i style={{ '--share': Math.min(1, base[i] / 160) } as CSSProperties}/><b>{stat(i)}</b></li>)}
    </ul>}
    <div className="mon-matchups">
      {groups.filter(([, list]) => list.length).map(([mark, list]) => <div key={mark} data-mark={mark}><strong>{mark}</strong>{list.map(t => <TypeLabel key={t} names={names} type={t}/>)}</div>)}
    </div>
    <ol className="mon-moves">
      {mon.moves.map((move, n) => <li key={n}>
        <TypeLabel names={names} type={move.type}/>
        {names?.categoryIcons?.[move.category ?? 0] && <img className="type-label" src={names.categoryIcons[move.category ?? 0]} alt={CATEGORY[move.category ?? 0]} title={CATEGORY[move.category ?? 0]}/>}
        <b>{move.name}</b>
        <span title="Power">{move.power ? move.power : '—'}</span>
        <span title="Accuracy">{move.accuracy && move.accuracy <= 100 ? move.accuracy : '—'}</span>
      </li>)}
    </ol>
  </div>
}

/**
 * The current goal, unfolded from the objective: the leaders already beaten; the story route to the next boss with
 * the places behind you lit; and, with scouting on, that boss's team in Normal mode, the types that hit most of it,
 * and the profile of the Pokémon pointed at. It moves on with each badge and each place reached.
 */
export function BossSheet({ names, badges, caps, scouting, done, style, side = 'right', onClose }: { names: GameNames | null; badges: number; caps: boolean; scouting: boolean; done: number; style: CSSProperties; side?: 'left' | 'right'; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null)
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
  const best = bestAttackers(everyone.map(m => typesOf(names, m.species)))
  const [shown, setShown] = useState('')
  const pick = shown || (teams[0] && teams[0].team.length ? `${teams[0].name}-${teams[0].team.length - 1}` : '')
  const picked = (() => { const [name, k] = pick.split(/-(?=\d+$)/); return teams.find(t => t.name === name)?.team[Number(k)] })()
  const tint = boss.type !== null ? TYPE_COLORS[boss.type] : '#f2c66b'
  return <div className="boss-sheet" data-side={side} ref={sheet} role="dialog" aria-label={boss.name} style={{ ...style, '--type': tint } as CSSProperties}>
    <header className="boss-head" key={boss.name}>
      <BossFace names={names} boss={boss} size={104}/>
      <span>
        {beaten.length > 0 && <ol className="boss-shelf" aria-label="Badges">{beaten.map(b => <li key={b.name} title={`${b.name} · ${b.badge}`}><BossFace names={names} boss={b} size={24}/></li>)}</ol>}
        <b>{boss.name}</b>
        {boss.type !== null && <TypeLabel names={names} type={boss.type}/>}
      </span>
      {caps && boss.cap !== null && <strong title="Level cap">{boss.cap}</strong>}
    </header>
    {boss.path.length > 0 && <ol className="boss-path" aria-label="Route">
      {boss.path.map((place, i) => <li key={i} data-done={i < done} data-next={i === done}><i/>{place}</li>)}
      <li data-goal data-next={done >= boss.path.length}><i/>{boss.place}</li>
    </ol>}
    {scouting && <>
      {!boss.members && best.length > 0 && <div className="boss-bring" key={`bring-${boss.name}`}>
        <Swords size={15} aria-label="Strong against this team"/>
        {best.map(a => <span key={a.type} title={`Super-effective on ${a.hits} of ${everyone.length}`}>
          <TypeLabel names={names} type={a.type}/>
          <i className="boss-pips" aria-hidden>{everyone.map((_, k) => <b key={k} data-on={k < a.hits}/>)}</i>
        </span>)}
      </div>}
      <div className="boss-teams" key={`teams-${boss.name}`}>
        {teams.map(({ name, team }) => <section key={name} className="boss-team">
          {boss.members && <h3>{name}<Swords size={12} aria-label="Strong against this team"/>{bestAttackers(team.map(m => typesOf(names, m.species)), 2).map(a => <TypeLabel key={a.type} names={names} type={a.type}/>)}</h3>}
          <ul>
            {team.map((m, k) => <li key={k} tabIndex={0} data-open={pick === `${name}-${k}`} style={{ '--type': TYPE_COLORS[typesOf(names, m.species)[0] ?? 0] } as CSSProperties}
              onPointerEnter={() => setShown(`${name}-${k}`)} onFocus={() => setShown(`${name}-${k}`)} onClick={() => setShown(`${name}-${k}`)}>
              <MonIcon names={names} species={m.species} size={48}/>
              <span className="boss-level">{m.level}</span>
            </li>)}
          </ul>
        </section>)}
      </div>
      {picked && <MonProfile names={names} mon={picked}/>}
    </>}
  </div>
}
