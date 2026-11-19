import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, Award, CircleDot, Flag, HeartCrack, Skull, Swords, TriangleAlert, Trophy } from 'lucide-react'
import type { GameNames } from '../../shared/api'
import type { GameState, Run, RunEvent } from '../../shared/run'
import { play as playSound } from './sfx'
import { BOSSES, nextBoss, nextStep, trainersOf } from '../../shared/progression'
import { TYPES, TYPE_COLORS, bestAttackers } from './pokemonTypes'
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
 * The run in the cockpit, beside your screens. Left: where you are, with your catch there; next up, a list fading out
 * step by step: catching your encounter here while the area is open (what lives there, greyed when the dupes clause
 * rules it out), the places still ahead on the story route with what lives in each, then the boss; then the team as it
 * stands. Right: the guide, the next boss with its type, the cap and the types that hit its team hardest, which
 * unfolds into its team and each Pokémon's profile and folds back into this card.
 */
export function RunScene({ run, game, names, front, partner = null }: { run: Run; game: GameState | null; names: GameNames | null; front: DOMRect; partner?: DOMRect | null }) {
  // Placement: the column on the left of your screens, the guide on their right; in Soul Link the guide sits under the
  // partner's screens and unfolds sideways there into a wide two-column panel.
  const room = front.left - 30, columnWidth = Math.min(190, Math.max(150, room))
  const columnFits = room >= 150
  const WIDE = .84, wideWidth = Math.min(600, (innerWidth - 40) / WIDE)
  const wideLeft = partner ? Math.min(front.right + 44, innerWidth - 20 - wideWidth * WIDE) : 0, wideTop = partner ? Math.max(60, Math.min(partner.bottom + 34, innerHeight - 130)) : 0
  const cardAt: CSSProperties = partner ? { left: wideLeft, top: wideTop, width: partner.width } : { left: front.right + 18, top: front.top + 8 }
  const floor = (document.querySelector('.key-strip-anchor > *')?.getBoundingClientRect().bottom || innerHeight - 20)
  const sheetAt: CSSProperties = partner ? { left: wideLeft, top: wideTop, width: wideWidth, maxHeight: Math.max(200, floor - wideTop) / WIDE } : { left: front.right + 18, top: front.top + 8, maxHeight: innerHeight - front.top - 28 }
  const columnAt: CSSProperties = { left: Math.max(12, front.left - 18 - columnWidth), width: columnWidth, top: front.top + 8 }
  const party = (game?.party ?? []).filter(p => !p.egg)
  const fallen = Object.values(run.pokemon).filter(p => p.status === 'dead')
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
  const scouting = run.rules.scouting !== false
  const bring = scouting ? bestAttackers(trainersOf(boss).flatMap(name => names?.teams?.[name] ?? []).map(m => [...new Set(names?.types?.[m.species] ?? [])]), 3) : []
  const card = <button className="run-objective run-guide" data-under={!!partner} data-open={open} onClick={() => setOpen(true)} aria-label={boss.name}
    style={{ ...cardAt, '--type': boss.type !== null ? TYPE_COLORS[boss.type] : '#f2c66b' } as CSSProperties}>
    <BossFace names={names} boss={boss} size={68}/>
    <svg className="run-next-mark" viewBox="0 9 180 63" preserveAspectRatio="xMaxYMid meet" aria-hidden><text x="0" y="72" textLength="180" lengthAdjust="spacingAndGlyphs">NEXT</text></svg>
    <span>
      <b>{boss.name}</b>
      <i className="run-types">{boss.type !== null && <TypeLabel names={names} type={boss.type}/>}</i>
    </span>
    {boss.cap !== null && <strong className="run-cap" title="Level cap"><small>Lv.</small>{boss.cap}</strong>}
  </button>
  // Next up: the catch here while the area is open, then the places still ahead on the story route with what lives in
  // each, then the boss; each step fainter than the one before.
  const upcoming: { key: string; kind: 'catch' | 'go' | 'boss'; name?: string; species: number[] }[] = []
  if (kind === 'catch') upcoming.push({ key: 'catch', kind: 'catch', species: hereWild })
  stops.slice(0, -1).forEach((stop, k) => { if (!stop.done && !stop.here && k >= step.done) upcoming.push({ key: stop.name, kind: 'go', name: stop.name, species: stop.wild }) })
  upcoming.push({ key: 'boss', kind: 'boss', name: boss.place, species: [] })
  const sheet = open && <BossSheet names={names} badges={run.badges} caps={!!run.rules.levelCaps} scouting={run.rules.scouting !== false} stops={stops} ruledOut={sp => ruledOut(run, names, sp)}
    style={sheetAt} side="right" wide={!!partner} onClose={() => setOpen(false)}/>
  return <>
    <div className="run-left" style={columnAt}>
    {here > 0 && <div className="run-place" key={here} role="status" data-caught={!!area}>
      <b>{placeName(names, here)}</b>
      {area?.species !== undefined && <span className="run-place-catch" title={speciesName(names, area.species)}><MonIcon names={names} species={area.species} size={36} fainted={area.pid !== undefined && run.pokemon[String(area.pid)]?.status === 'dead'}/></span>}
    </div>}
    <ol className="run-next" aria-label="Next up">
      {upcoming.slice(0, 4).map((up, k) => <li key={up.key} data-kind={up.kind} style={{ '--depth': k } as CSSProperties}>
        {up.kind === 'catch' ? <CircleDot size={15}/> : up.kind === 'go' ? <ArrowRight size={15}/> : <BossFace names={names} boss={boss} size={26}/>}
        {up.name && <b>{up.kind === 'boss' ? boss.name : up.name}</b>}
        {up.species.length > 0 && <WildRow run={run} names={names} species={up.species} size={up.kind === 'catch' ? 32 : 26} max={up.kind === 'catch' ? 8 : 4}/>}
      </li>)}
    </ol>
    <ol className="run-team" aria-label="Team">
      {party.map(p => {
        const dead = run.pokemon[String(p.pid)]?.status === 'dead' || p.hp === 0
        const share = p.hp !== null && p.maxHp ? p.hp / p.maxHp : 1
        const over = !!run.rules.levelCaps && boss.cap !== null && p.level !== null && p.level > boss.cap
        return <li key={p.pid} data-dead={dead} data-over={over} data-icon={!!names?.icons?.[p.species]} style={{ '--type': tint(p.species), '--hp': share } as CSSProperties}>
          <MonIcon names={names} species={p.species} size={40} hp={share} fainted={dead}/>
          <b>{called(names, p)}<em>{placeName(names, p.metLocation)}</em></b>{p.level !== null && <span title={over ? `Over the cap of ${boss.cap}` : undefined}>{p.level}</span>}
          {dead ? <Skull size={13}/> : <i data-low={share < .25} data-mid={share < .5}/>}
        </li>
      })}
    </ol>
    {fallen.length > 0 && <ol className="run-fallen" aria-label="Fallen">
      {fallen.map(p => <li key={p.pid} title={`${called(names, p)} · ${placeName(names, p.metLocation)}`}><MonIcon names={names} species={p.species} size={30} fainted/></li>)}
    </ol>}
    </div>
    {card}
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
