import { badgeCount, type Pokemon } from './gen5'

/**
 * A Nuzlocke run and the rules that track it from the game. One solo run is active at a time; Soul Link has one
 * session per partner. Each run plays on its own cartridge save. The rules and presets follow Souldew's
 * (shared/rules.mjs at the commit docs/SPECIFICATION.md pins).
 */

export type Rules = {
  preset: 'classic' | 'hardcore' | 'custom'
  /** 'party': a whiteout ends the run; 'box': only when nothing alive is left anywhere; 'off': it never ends by itself. */
  blackout: 'party' | 'box' | 'off'
  /** The first death ends the run. */
  deathless: boolean
  /** A catch of a species, or of an evolution line, already caught (dead ones count) breaks the rule. */
  dupes: 'off' | 'species' | 'line'
  /** A shiny may always be caught, whatever the area or dupes. */
  shinyClause: boolean
  /** The next boss's ace level: off, a warning, or strict, where going over breaks the rule. */
  levelCaps: false | 'warn' | 'strict'
  /** 'party': primary types may not repeat in the team (Souldew's type rule); 'mono': every team member has `monoType`. */
  typeClause: 'off' | 'party' | 'mono'
  /** The one type of a monotype run, by the games' type number. */
  monoType: number
  /** Legendary and mythical Pokémon may not be caught. */
  noLegendaries: boolean
  /** On your honour: nickname every catch, no bag items in battle, the Set battle style. */
  nicknames: boolean; noBattleItems: boolean; setMode: boolean
}

const CLASSIC: Omit<Rules, 'preset'> = { blackout: 'party', deathless: false, dupes: 'line', shinyClause: true, levelCaps: false, typeClause: 'off', monoType: 0, noLegendaries: false, nicknames: false, noBattleItems: false, setMode: false }

/** Restrictions sit beside a preset rather than in it: they are kept when the preset changes. */
export const RESTRICTIONS = ['typeClause', 'monoType', 'noLegendaries'] as const

/** Legendary and mythical Pokémon up to Generation V, by National Pokédex number. */
export const LEGENDARY = new Set([144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649])
export const PRESETS: Record<'classic' | 'hardcore', Omit<Rules, 'preset'>> = {
  classic: CLASSIC,
  hardcore: { ...CLASSIC, levelCaps: 'strict', noBattleItems: true, setMode: true }
}

/** A run's rules with defaults filled in; runs from before this rule set kept `levelCaps` as a boolean and `blackoutEnds`. */
export function rulesOf(stored: Partial<Rules> & { blackoutEnds?: boolean; levelCaps?: unknown }): Rules {
  const preset = stored.preset === 'hardcore' || stored.preset === 'custom' ? stored.preset : 'classic'
  const base = preset === 'hardcore' ? PRESETS.hardcore : CLASSIC
  const r = { ...base, ...stored, preset } as Rules & { blackoutEnds?: boolean }
  if (preset !== 'custom') { const kept = Object.fromEntries(RESTRICTIONS.map(k => [k, r[k]])); Object.assign(r, base, kept) }
  if ((stored.levelCaps as unknown) === true) r.levelCaps = preset === 'hardcore' ? 'strict' : 'warn'
  if (stored.blackout === undefined && stored.blackoutEnds !== undefined) r.blackout = stored.blackoutEnds ? 'party' : 'off'
  delete r.blackoutEnds
  return r
}

/**
 * The highest level on each Gym Leader's team in Black 2 / White 2 on Normal difficulty, then the Elite Four: Souldew's
 * b2w2 caps (shared/routes.mjs). Challenge Mode teams are higher.
 */
export const LEVEL_CAPS = [13, 18, 24, 30, 33, 39, 48, 51, 58]

export type Tracked = {
  pid: number; species: number; nickname: string; metLocation: number; metLevel: number
  level: number | null; status: 'alive' | 'dead'; boxed: boolean; shiny: boolean
  caughtAt: number; diedAt?: number; warned?: string[]
}

export type Area = { location: number; outcome: 'caught' | 'missed'; pid?: number; species?: number; at: number; source: 'observed' | 'manual' }

/** Why a catch breaks the rules: a second catch in a used area, a species or line already caught, a banned legendary, or the wrong type for a monotype run. */
export type Breach = 'area' | 'dupe' | 'legendary' | 'type'

export type RunEvent =
  | { at: number; kind: 'caught'; pid: number; species: number; nickname: string; location: number; level: number; extra: boolean; breach?: Breach }
  | { at: number; kind: 'died'; pid: number; species: number; nickname: string; level: number | null }
  | { at: number; kind: 'revived'; pid: number; species: number; nickname: string }
  | { at: number; kind: 'badge'; badge: number }
  | { at: number; kind: 'over-cap'; pid: number; species: number; nickname: string; level: number; cap: number; strict?: boolean }
  | { at: number; kind: 'same-type'; pids: [number, number]; type: number }
  | { at: number; kind: 'missed'; location: number }
  | { at: number; kind: 'ended'; result: 'won' | 'lost' | 'abandoned' }

export type Run = {
  id: string; mode: 'solo' | 'soul-link'; partner?: string
  romSha: string; game: 'Black 2' | 'White 2'; rules: Rules
  createdAt: number; endedAt?: number; result?: 'won' | 'lost' | 'abandoned'
  trainer?: { name: string; id: number }
  badges: number
  /** Milliseconds played in this run. */
  playTime?: number
  pokemon: Record<string, Tracked>
  areas: Record<string, Area>
  events: RunEvent[]
}

export type GameState = {
  trainer: { name: string; id: number; badges: number; money: number } | null
  party: Pokemon[]
  /** Null when the boxes were not read this time. */
  boxes: Pokemon[] | null
  /** The zone the player is in and its place-name index (the met-location number), when it could be read. */
  where?: { zone: number; place: number } | null
}

/** What the rules need from the game data: each species' types and evolution line. */
export type SpeciesData = { types?: [number, number][]; lines?: number[] }

export const newRun = (fields: Pick<Run, 'id' | 'mode' | 'partner' | 'romSha' | 'game' | 'rules' | 'createdAt'>): Run =>
  ({ ...fields, badges: 0, pokemon: {}, areas: {}, events: [] })

const label = (p: { nickname: string }) => p.nickname

/**
 * Applies one reading of the game to a run. Catches are new Pokémon carrying your trainer ID; their area is where
 * they were met. A party Pokémon at 0 HP has fainted and is dead for the rest of the run.
 */
export function track(run: Run, game: GameState, now: number, data: SpeciesData = {}): { run: Run; events: RunEvent[] } {
  if (run.endedAt || !game.trainer || !game.trainer.name) return { run, events: [] }
  const rules = rulesOf(run.rules)
  const next: Run = { ...run, pokemon: { ...run.pokemon }, areas: { ...run.areas }, events: run.events }
  const events: RunEvent[] = []
  next.trainer ??= { name: game.trainer.name, id: game.trainer.id }
  if (next.trainer.id !== game.trainer.id) return { run, events: [] }
  const lineOf = (species: number) => data.lines?.[species] ?? species

  const inParty = new Set(game.party.map(p => p.pid))
  for (const p of [...game.party, ...(game.boxes ?? [])]) {
    if (p.egg || p.otId !== next.trainer.id) continue
    const key = String(p.pid), known = next.pokemon[key]
    if (!known) {
      const earlier = Object.values(next.pokemon)
      const area = next.areas[String(p.metLocation)]
      const dupe = rules.dupes !== 'off' && earlier.some(e => rules.dupes === 'species' ? e.species === p.species : lineOf(e.species) === lineOf(p.species))
      const excused = p.shiny && rules.shinyClause
      const banned = rules.noLegendaries && LEGENDARY.has(p.species)
      const offType = rules.typeClause === 'mono' && !!data.types?.[p.species] && !data.types[p.species].includes(rules.monoType)
      const breach: Breach | undefined = banned ? 'legendary' : offType ? 'type' : excused ? undefined : area ? 'area' : dupe ? 'dupe' : undefined
      if (!area) next.areas[String(p.metLocation)] = { location: p.metLocation, outcome: 'caught', pid: p.pid, species: p.species, at: now, source: 'observed' }
      next.pokemon[key] = { pid: p.pid, species: p.species, nickname: p.nickname, metLocation: p.metLocation, metLevel: p.metLevel, level: p.level, status: 'alive', boxed: !inParty.has(p.pid), shiny: p.shiny, caughtAt: now }
      events.push({ at: now, kind: 'caught', pid: p.pid, species: p.species, nickname: p.nickname, location: p.metLocation, level: p.level ?? p.metLevel, extra: !!breach, breach })
    } else {
      next.pokemon[key] = { ...known, nickname: p.nickname, species: p.species, level: p.level ?? known.level, boxed: game.boxes ? !inParty.has(p.pid) : known.boxed && !inParty.has(p.pid) }
    }
  }
  let died = false
  for (const p of game.party) {
    const key = String(p.pid), t = next.pokemon[key]
    if (!t || p.hp === null) continue
    if (t.status === 'alive' && p.hp === 0) {
      next.pokemon[key] = { ...t, status: 'dead', diedAt: now }; died = true
      events.push({ at: now, kind: 'died', pid: p.pid, species: p.species, nickname: label(p), level: p.level })
    } else if (t.status === 'dead' && p.hp > 0 && !t.warned?.includes('revived')) {
      next.pokemon[key] = { ...t, warned: [...(t.warned ?? []), 'revived'] }
      events.push({ at: now, kind: 'revived', pid: p.pid, species: p.species, nickname: label(p) })
    }
  }
  const badges = badgeCount(game.trainer.badges)
  for (let b = next.badges + 1; b <= badges; b++) events.push({ at: now, kind: 'badge', badge: b })
  next.badges = Math.max(next.badges, badges)
  if (rules.levelCaps) {
    const cap = LEVEL_CAPS[Math.min(next.badges, LEVEL_CAPS.length - 1)]
    for (const p of game.party) {
      const t = next.pokemon[String(p.pid)], tag = `cap-${cap}`
      if (!t || t.status !== 'alive' || p.level === null || p.level <= cap || t.warned?.includes(tag)) continue
      next.pokemon[String(p.pid)] = { ...t, warned: [...(t.warned ?? []), tag] }
      events.push({ at: now, kind: 'over-cap', pid: p.pid, species: p.species, nickname: label(p), level: p.level, cap, strict: rules.levelCaps === 'strict' })
    }
  }
  if (rules.typeClause === 'party' && data.types) {
    const team = game.party.filter(p => !p.egg && next.pokemon[String(p.pid)]?.status === 'alive')
    for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) {
      const type = data.types[team[i].species]?.[0]
      if (type === undefined || type !== data.types[team[j].species]?.[0]) continue
      const a = next.pokemon[String(team[i].pid)], tag = `type-${team[j].pid}`
      if (a.warned?.includes(tag)) continue
      next.pokemon[String(team[i].pid)] = { ...a, warned: [...(a.warned ?? []), tag] }
      events.push({ at: now, kind: 'same-type', pids: [team[i].pid, team[j].pid], type })
    }
  }
  const owned = Object.values(next.pokemon)
  const wiped = rules.blackout === 'party' && game.party.length > 0 && game.party.every(p => p.egg || p.hp === 0)
  const nothingLeft = rules.blackout !== 'off' && owned.length > 0 && owned.every(p => p.status === 'dead')
  if ((rules.deathless && died) || wiped || nothingLeft) { next.endedAt = now; next.result = 'lost'; events.push({ at: now, kind: 'ended', result: 'lost' }) }
  next.events = [...run.events, ...events]
  return { run: next, events }
}

/** Marks an area's encounter as used without a capture: it fled, fainted, or was not caught. */
export function markMissed(run: Run, location: number, now: number): Run {
  if (run.areas[String(location)]) return run
  return { ...run, areas: { ...run.areas, [location]: { location, outcome: 'missed', at: now, source: 'manual' } }, events: [...run.events, { at: now, kind: 'missed', location }] }
}

/** Ends a run by the player's call: the Hall of Fame reached, or given up. */
export function endRun(run: Run, result: 'won' | 'abandoned', now: number): Run {
  if (run.endedAt) return run
  return { ...run, endedAt: now, result, events: [...run.events, { at: now, kind: 'ended', result }] }
}

/** The level the next boss's strongest Pokémon will be. */
export const nextCap = (run: Run) => LEVEL_CAPS[Math.min(run.badges, LEVEL_CAPS.length - 1)]

/** Rules from an untrusted request: each field kept only when it is one of its allowed values. */
export function checkRules(input: unknown): Rules {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const pick = <T,>(value: unknown, allowed: readonly T[]) => allowed.includes(value as T) ? value as T : undefined
  const fields: Partial<Rules> = {
    preset: pick(i.preset, ['classic', 'hardcore', 'custom'] as const),
    blackout: pick(i.blackout, ['party', 'box', 'off'] as const), dupes: pick(i.dupes, ['off', 'species', 'line'] as const),
    levelCaps: pick(i.levelCaps, [false, 'warn', 'strict'] as const), typeClause: pick(i.typeClause, ['off', 'party', 'mono'] as const), monoType: pick(i.monoType, Array.from({ length: 17 }, (_, n) => n)), noLegendaries: pick(i.noLegendaries, [true, false]),
    deathless: pick(i.deathless, [true, false]), shinyClause: pick(i.shinyClause, [true, false]), nicknames: pick(i.nicknames, [true, false]),
    noBattleItems: pick(i.noBattleItems, [true, false]), setMode: pick(i.setMode, [true, false])
  }
  return rulesOf(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)))
}
