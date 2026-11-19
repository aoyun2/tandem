import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, Award, CircleDot, Flag, HeartCrack, Skull, TriangleAlert, Trophy } from 'lucide-react'
import type { GameNames } from '../../shared/api'
import type { GameState, Run, RunEvent } from '../../shared/run'
import { play as playSound } from './sfx'
import { BOSSES, nextBoss, nextStep } from '../../shared/progression'
import { TYPES, TYPE_COLORS } from './pokemonTypes'
import { MonIcon } from './MonIcon'
import { BossFace, BossSheet, TypeLabel } from './BossSheet'

const speciesName = (names: GameNames | null, id: number) => names?.species[id] ?? `#${id}`
const placeName = (names: GameNames | null, id: number) => names?.places[id] || `Area ${id}`
/** A nickname, or the species when the Pokémon has none. */
const called = (names: GameNames | null, p: { nickname: string; species: number }) => p.nickname || speciesName(names, p.species)

/** One moment of the run as it happens: an icon and a short line, in the scene for a few seconds. */
function moment(event: RunEvent, names: GameNames | null): { icon: typeof Award; tone: string; title: string; detail?: string; species?: number; face?: string } | null {
  const species = 'species' in event && typeof event.species === 'number' ? event.species : undefined
  const face = event.kind === 'badge' ? names?.faces?.[BOSSES[event.badge - 1]?.name ?? ''] : undefined
  const shown = momentText(event, names)
  return shown && { ...shown, species, face }
}

function momentText(event: RunEvent, names: GameNames | null): { icon: typeof Award; tone: string; title: string; detail?: string } | null {
  switch (event.kind) {
    case 'caught': return event.extra
      ? { icon: TriangleAlert, tone: 'warn', title: `${called(names, event)} ${event.breach === 'dupe' ? 'is a dupe' : event.breach === 'legendary' ? 'is a banned legendary' : event.breach === 'type' ? 'is the wrong type' : 'is a second capture'}`, detail: placeName(names, event.location) }
      : { icon: CircleDot, tone: 'catch', title: called(names, event), detail: `${placeName(names, event.location)} · Lv ${event.level}` }
    case 'died': return { icon: Skull, tone: 'death', title: `${called(names, event)} has fallen`, detail: event.level ? `Lv ${event.level}` : undefined }
    case 'revived': return { icon: HeartCrack, tone: 'warn', title: `${called(names, event)} was revived`, detail: 'It stays fallen in this run' }
    case 'badge': return { icon: Award, tone: 'badge', title: BOSSES[event.badge - 1]?.badge ?? `Badge ${event.badge}` }
    case 'over-cap': return { icon: TriangleAlert, tone: event.strict ? 'death' : 'warn', title: `${called(names, event)} Lv ${event.level}`, detail: event.strict ? `Breaks the cap of ${event.cap}` : `Above the cap of ${event.cap}` }
    case 'same-type': return { icon: TriangleAlert, tone: 'warn', title: `Two ${TYPES[event.type] ?? ''} types in the team` }
    case 'ended': return event.result === 'lost' ? { icon: Skull, tone: 'death', title: 'The run is over' }
      : event.result === 'won' ? { icon: Trophy, tone: 'badge', title: 'Hall of Fame' } : { icon: Flag, tone: 'warn', title: 'Run given up' }
    default: return null
  }
}

/** The wild Pokémon of a place from the ROM, each species once, in the order its table lists them. */
export function wildAt(names: GameNames | null, place: number) {
  const seen: number[] = []
  for (const [species] of names?.wild?.[String(place)] ?? []) if (!seen.includes(species)) seen.push(species)
  return seen
}

/** Whether the dupes clause already rules a species out: the same species, or a member of the same line, was caught. */
function ruledOut(run: Run, names: GameNames | null, species: number) {
  const rule = run.rules.dupes
  if (rule === 'off') return false
  const line = (s: number) => names?.lines?.[s] ?? s
  return Object.values(run.pokemon).some(p => rule === 'species' ? p.species === species : line(p.species) === line(species))
}

/** Wild Pokémon as a row of icons; those the dupes clause rules out are greyed. */
function WildRow({ run, names, species, size = 28, max = 6 }: { run: Run; names: GameNames | null; species: number[]; size?: number; max?: number }) {
  if (!species.length) return null
  return <i className="run-wild" aria-label="Wild Pokémon here">
    {species.slice(0, max).map(sp => <span key={sp} data-out={ruledOut(run, names, sp)} title={`${speciesName(names, sp)}${ruledOut(run, names, sp) ? ' · already caught a dupe' : ''}`}><MonIcon names={names} species={sp} size={size}/></span>)}
  </i>
}

/**
 * The run in the cockpit, beside your screens. Left: where you are, with what can be caught there (greyed when the
 * dupes clause rules it out) or what you caught there; then the team as it stands, with each member's health and
 * level. Right: the main task, which is catching your encounter here while the area is open, else the next place on
 * the story route with what lives there, else the boss; it unfolds into the goal and folds back into this card.
 */
export function RunScene({ run, game, names, front, partner = null }: { run: Run; game: GameState | null; names: GameNames | null; front: DOMRect; partner?: DOMRect | null }) {
  // In Soul Link the partner's screens stand to the right: the task moves into the left column rather than cover them.
  const stack = !!partner && partner.left < front.right + 300 && partner.bottom > front.top && partner.top < front.top + 120
  const party = (game?.party ?? []).filter(p => !p.egg)
  const boss = nextBoss(run.badges)
  const [open, setOpen] = useState(false)
  const here = game?.where?.place ?? 0, area = here ? run.areas[String(here)] : undefined
  const been = new Set((run.visited ?? []).map(i => names?.places[i]).filter(Boolean))
  const step = nextStep(boss, place => been.has(place))
  const placeIndex = (name: string) => names?.places.indexOf(name) ?? -1
  const hereWild = here ? wildAt(names, here) : []
  const kind = here > 0 && hereWild.length > 0 && !area ? 'catch' : step.place ? 'go' : 'boss'
  const taskSpecies = kind === 'catch' ? hereWild : kind === 'go' ? wildAt(names, placeIndex(step.place!)) : []
  const stops = [...boss.path, boss.place].map((name, k) => {
    const index = placeIndex(name), caught = index > 0 ? run.areas[String(index)] : undefined
    return { name, done: k < step.done, next: k === step.done, here: index === here, caught: caught?.species, wild: index > 0 ? wildAt(names, index) : [] }
  })
  const tint = (species: number) => TYPE_COLORS[names?.types?.[species]?.[0] ?? 0]
  const card = <button className="run-objective" data-kind={kind} data-open={open} onClick={() => setOpen(true)} aria-label={kind === 'boss' ? boss.name : kind === 'go' ? step.place! : placeName(names, here)}
    style={{ ...(stack ? {} : { left: front.right + 18, top: front.top + 8 }), '--type': boss.type !== null ? TYPE_COLORS[boss.type] : '#f2c66b' } as CSSProperties}>
    <BossFace names={names} boss={boss} size={68}/>
    <span>
      <b>{kind === 'catch' ? <><CircleDot size={15}/>{placeName(names, here)}</> : kind === 'go' ? <><ArrowRight size={15}/>{step.place}</> : boss.name}</b>
      <WildRow run={run} names={names} species={taskSpecies}/>
      {boss.path.length > 0 && <i className="run-steps" aria-hidden>{stops.map((stop, k) => <u key={k} data-on={stop.done} data-next={stop.next}/>)}</i>}
    </span>
    {kind === 'boss' && boss.type !== null && <TypeLabel names={names} type={boss.type}/>}
    {run.rules.levelCaps && boss.cap !== null && <strong title="Level cap">{boss.cap}</strong>}
  </button>
  const sheet = open && <BossSheet names={names} badges={run.badges} caps={!!run.rules.levelCaps} scouting={run.rules.scouting !== false} stops={stops} ruledOut={sp => ruledOut(run, names, sp)}
    style={stack ? { right: `calc(100% - ${front.left - 18}px)`, top: front.top + 8 } : { left: front.right + 18, top: front.top + 8 }} side={stack ? 'left' : 'right'} onClose={() => setOpen(false)}/>
  return <>
    <div className="run-left" data-stack={stack} style={{ right: `calc(100% - ${front.left - 18}px)`, top: front.top + 8 }}>
    {here > 0 && <div className="run-place" key={here} role="status" data-caught={!!area}>
      <b>{placeName(names, here)}</b>
      {area?.species !== undefined
        ? <span className="run-place-catch" title={speciesName(names, area.species)}><MonIcon names={names} species={area.species} size={36} fainted={area.pid !== undefined && run.pokemon[String(area.pid)]?.status === 'dead'}/></span>
        : <WildRow run={run} names={names} species={hereWild} size={32} max={8}/>}
    </div>}
    {stack && card}
    <ol className="run-team" aria-label="Team">
      {party.map(p => {
        const dead = run.pokemon[String(p.pid)]?.status === 'dead' || p.hp === 0
        const share = p.hp !== null && p.maxHp ? p.hp / p.maxHp : 1
        return <li key={p.pid} data-dead={dead} data-icon={!!names?.icons?.[p.species]} style={{ '--type': tint(p.species), '--hp': share } as CSSProperties}>
          <MonIcon names={names} species={p.species} size={40} hp={share} fainted={dead}/>
          <b>{called(names, p)}</b>{p.level !== null && <span>{p.level}</span>}
          {dead ? <Skull size={13}/> : <i data-low={share < .25} data-mid={share < .5}/>}
        </li>
      })}
    </ol>
    </div>
    {!stack && card}
    {sheet}
  </>
}

/** Moments queue at the top of the cockpit and each shows for four seconds. */
export function RunMoments({ events, names }: { events: RunEvent[]; names: GameNames | null }) {
  const [queue, setQueue] = useState<RunEvent[]>([])
  const seen = useRef(events.length)
  useEffect(() => {
    if (events.length > seen.current) setQueue(q => [...q, ...events.slice(seen.current)])
    seen.current = events.length
  }, [events])
  const current = queue[0], shown = current ? moment(current, names) : null
  useEffect(() => {
    if (!current) return
    if (!shown) { setQueue(q => q.slice(1)); return }
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) playSound(current.kind === 'died' || current.kind === 'ended' ? 'bootPanel' : 'bootSettle', { gain: current.kind === 'died' ? .5 : .3, rate: current.kind === 'died' ? .6 : 1.1, space: .5, body: current.kind === 'died' ? .6 : 0 })
    const t = setTimeout(() => setQueue(q => q.slice(1)), 4000)
    return () => clearTimeout(t)
  }, [current])
  if (!shown) return null
  const Icon = shown.icon
  return <div className="run-moment" data-tone={shown.tone} key={current!.at + current!.kind} role="status">
    {shown.face ? <img className="run-face" src={shown.face} alt=""/> : shown.species && names?.icons?.[shown.species] ? <MonIcon names={names} species={shown.species} size={48} fainted={current!.kind === 'died'}/> : <Icon size={20}/>}<span><b>{shown.title}</b>{shown.detail && <em>{shown.detail}</em>}</span>
  </div>
}
