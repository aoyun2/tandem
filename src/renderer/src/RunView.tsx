import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Award, CircleDot, Flag, HeartCrack, Skull, TriangleAlert, Trophy } from 'lucide-react'
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

/**
 * The run in the cockpit, beside your screens: where you are and the team as it stands, with each member's health and
 * level, tinted by its primary type; and the main task, the next place on the way to the next boss or the boss
 * itself, with the cap to stay under, which unfolds into the goal. It follows the game live.
 */
export function RunScene({ run, game, names, front, partner = null }: { run: Run; game: GameState | null; names: GameNames | null; front: DOMRect; partner?: DOMRect | null }) {
  // In Soul Link the partner's screens stand to the right: the task moves into the left column rather than cover them.
  const stack = !!partner && partner.left < front.right + 300 && partner.bottom > front.top && partner.top < front.top + 120
  const party = (game?.party ?? []).filter(p => !p.egg)
  const boss = nextBoss(run.badges)
  const [bosses, setBosses] = useState(false)
  const here = game?.where?.place ?? 0, area = here ? run.areas[String(here)] : undefined
  const been = new Set((run.visited ?? []).map(i => names?.places[i]).filter(Boolean))
  const step = nextStep(boss, place => been.has(place))
  const tint = (species: number) => TYPE_COLORS[names?.types?.[species]?.[0] ?? 0]
  const task = <>
    {!bosses && <button className="run-objective" data-step={step.place ? 'place' : 'boss'} onClick={() => setBosses(true)} aria-label={step.place ?? boss.name} style={{ ...(stack ? {} : { left: front.right + 18, top: front.top + 8 }), '--type': boss.type !== null ? TYPE_COLORS[boss.type] : '#f2c66b' } as CSSProperties}>
      <BossFace names={names} boss={boss} size={68}/>
      <span>
        <b>{step.place ?? boss.name}</b>
        {boss.path.length > 0 && <i className="run-steps" aria-hidden>{[...boss.path, boss.place].map((_, k) => <u key={k} data-on={k < step.done} data-next={k === step.done}/>)}</i>}
      </span>
      {!step.place && boss.type !== null && <TypeLabel names={names} type={boss.type}/>}
      {run.rules.levelCaps && boss.cap !== null && <strong title="Level cap">{boss.cap}</strong>}
    </button>}
    {bosses && <BossSheet names={names} badges={run.badges} caps={!!run.rules.levelCaps} scouting={run.rules.scouting !== false} done={step.done} style={stack ? { right: `calc(100% - ${front.left - 18}px)`, top: front.top + 8 } : { left: front.right + 18, top: front.top + 8 }} side={stack ? 'left' : 'right'} onClose={() => setBosses(false)}/>}
  </>
  return <>
    <div className="run-left" data-stack={stack} style={{ right: `calc(100% - ${front.left - 18}px)`, top: front.top + 8 }}>
    {here > 0 && <div className="run-place" key={here} role="status" data-caught={!!area}>
      <b>{placeName(names, here)}</b>
      {area?.species !== undefined && <span className="run-place-catch" title={speciesName(names, area.species)}><MonIcon names={names} species={area.species} size={32} fainted={area.pid !== undefined && run.pokemon[String(area.pid)]?.status === 'dead'}/></span>}
    </div>}
    {stack && !bosses && task}
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
    {(!stack || bosses) && task}
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
