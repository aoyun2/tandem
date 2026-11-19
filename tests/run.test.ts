import { describe, expect, it } from 'vitest'
import { checkRules, markMissed, newRun, PRESETS, rulesOf, track, type GameState, type Rules } from '../src/shared/run'
import type { Pokemon } from '../src/shared/gen5'

const mon = (pid: number, over: Partial<Pokemon> = {}): Pokemon => ({ pid, species: 495, nickname: 'Snivy', nicknamed: false, egg: false, level: 5, hp: 20, maxHp: 20, metLocation: 117, metLevel: 5, ball: 4, otId: 7, shiny: false, ...over })
const state = (party: Pokemon[], badges = 0, boxes: Pokemon[] | null = []): GameState => ({ trainer: { name: 'Ash', id: 7, badges, money: 0 }, party, boxes })
const run = (rules: Partial<Rules> = {}) => newRun({ id: 'r', mode: 'solo', romSha: 's', game: 'Black 2', rules: { preset: 'custom', ...PRESETS.hardcore, ...rules }, createdAt: 0 })

describe('Nuzlocke tracking', () => {
  it('records a catch in the area it was met', () => {
    const { run: r, events } = track(run(), state([mon(1)]), 10)
    expect(events.map(e => e.kind)).toEqual(['caught'])
    expect(r.areas['117']).toMatchObject({ outcome: 'caught', pid: 1, source: 'observed' })
    expect(r.trainer).toEqual({ name: 'Ash', id: 7 })
  })
  it('flags a second catch in a used area, except a shiny under the shiny clause', () => {
    let r = track(run(), state([mon(1)]), 1).run
    const second = track(r, state([mon(1), mon(2, { species: 504 })]), 2)
    expect(second.events[0]).toMatchObject({ kind: 'caught', extra: true })
    r = { ...r, rules: { ...r.rules, shinyClause: true } }
    expect(track(r, state([mon(1), mon(3, { shiny: true })]), 3).events[0]).toMatchObject({ extra: false })
  })
  it('ignores Pokémon from another trainer', () => {
    expect(track(run(), state([mon(1, { otId: 99 })]), 1).events).toEqual([])
  })
  it('marks a fainted party Pokémon dead and warns once if it comes back', () => {
    let r = track(run(), state([mon(1), mon(2, { metLocation: 120 })]), 1).run
    const fall = track(r, state([mon(1, { hp: 0 }), mon(2, { metLocation: 120 })]), 2)
    expect(fall.events.map(e => e.kind)).toEqual(['died'])
    r = fall.run
    expect(track(r, state([mon(1, { hp: 5 }), mon(2, { metLocation: 120 })]), 3).events.map(e => e.kind)).toEqual(['revived'])
  })
  it('ends the run on a party wipe', () => {
    const r = track(run(), state([mon(1)]), 1).run
    const wipe = track(r, state([mon(1, { hp: 0 })]), 2)
    expect(wipe.run.result).toBe('lost')
    expect(wipe.events.map(e => e.kind)).toEqual(['died', 'ended'])
  })
  it('counts new badges and warns above the level cap', () => {
    const r = track(run(), state([mon(1)]), 1).run
    const next = track(r, state([mon(1, { level: 20 })], 0b1), 2)
    expect(next.events.map(e => e.kind)).toEqual(['badge', 'over-cap'])
    expect(next.run.badges).toBe(1)
  })
  it('keeps a manual miss and does not overwrite a used area', () => {
    const r = markMissed(run(), 120, 5)
    expect(r.areas['120']).toMatchObject({ outcome: 'missed', source: 'manual' })
    expect(markMissed(r, 120, 6)).toBe(r)
  })
  it('matches Souldew’s presets: Hardcore is Classic with strict caps, no battle items and Set, plus no scouting', () => {
    expect(PRESETS.classic).toMatchObject({ blackout: 'party', dupes: 'line', shinyClause: true, levelCaps: false, nicknames: false, typeClause: 'off', scouting: true })
    expect(PRESETS.hardcore).toEqual({ ...PRESETS.classic, levelCaps: 'strict', noBattleItems: true, setMode: true, scouting: false })
  })
  it('flags a catch from an evolution line already caught, in a new area', () => {
    const lines = Array.from({ length: 700 }, (_, i) => i); lines[496] = 495
    const r = track(run(), state([mon(1)]), 1, { lines }).run
    expect(track(r, state([mon(1), mon(2, { species: 496, metLocation: 130 })]), 2, { lines }).events[0]).toMatchObject({ extra: true, breach: 'dupe' })
    expect(track(run({ dupes: 'species' }), state([mon(1)]), 1).run.areas['117']).toBeDefined()
  })
  it('flags two team members sharing a primary type under the type clause', () => {
    const types: [number, number][] = Array.from({ length: 700 }, () => [0, 0]); types[495] = [11, 11]; types[504] = [11, 2]
    const r = run({ typeClause: 'party' })
    const out = track(r, state([mon(1), mon(2, { species: 504, metLocation: 130 })]), 1, { types })
    expect(out.events.map(e => e.kind)).toContain('same-type')
  })
  it('ends a deathless run at the first death, and a box-blackout run only when nothing is left', () => {
    let r = track(run({ deathless: true }), state([mon(1), mon(2, { metLocation: 130, species: 504 })]), 1).run
    expect(track(r, state([mon(1, { hp: 0 }), mon(2, { metLocation: 130, species: 504 })]), 2).run.result).toBe('lost')
    r = track(run({ blackout: 'box' }), state([mon(1)], 0, [mon(2, { metLocation: 130, species: 504 })]), 1).run
    expect(track(r, state([mon(1, { hp: 0 })], 0, [mon(2, { metLocation: 130, species: 504 })]), 2).run.result).toBeUndefined()
  })
  it('reads runs from before this rule set, and keeps only allowed values from a request', () => {
    expect(rulesOf({ preset: 'hardcore', levelCaps: true, blackoutEnds: true } as never)).toMatchObject({ levelCaps: 'strict', blackout: 'party' })
    expect(checkRules({ preset: 'custom', levelCaps: 'maybe', dupes: 'species' })).toMatchObject({ levelCaps: false, dupes: 'species' })
  })
  it('flags a banned legendary and a catch outside a monotype run’s type', () => {
    expect(track(run({ noLegendaries: true }), state([mon(1, { species: 643 })]), 1).events[0]).toMatchObject({ breach: 'legendary' })
    const types: [number, number][] = Array.from({ length: 700 }, () => [0, 0]); types[495] = [11, 11]; types[501] = [10, 10]
    const mono = run({ typeClause: 'mono', monoType: 11 })
    expect(track(mono, state([mon(1)]), 1, { types }).events[0]).toMatchObject({ extra: false })
    expect(track(mono, state([mon(2, { species: 501 })]), 1, { types }).events[0]).toMatchObject({ breach: 'type' })
  })
  it('keeps restrictions when a preset fills in the rules', () => {
    expect(rulesOf({ preset: 'hardcore', typeClause: 'mono', monoType: 9, noLegendaries: true })).toMatchObject({ levelCaps: 'strict', typeClause: 'mono', monoType: 9, noLegendaries: true })
  })
})

describe('progression', () => {
  it('steps along a boss path from the furthest place visited', async () => {
    const { BOSSES, nextStep } = await import('../src/shared/progression')
    const cheren = BOSSES[0]
    expect(nextStep(cheren, () => false)).toEqual({ place: 'Route 19', done: 0 })
    expect(nextStep(cheren, p => p === 'Floccesy Town')).toEqual({ place: 'Route 20', done: 2 })
    expect(nextStep(cheren, () => true)).toEqual({ place: null, done: cheren.path.length })
  })
  it('records each place the player has been to once', () => {
    const r1 = track(run(), { ...state([mon(1)]), where: { zone: 427, place: 117 } }, 1).run
    const r2 = track(r1, { ...state([mon(1)]), where: { zone: 428, place: 117 } }, 2).run
    expect(r2.visited).toEqual([117])
  })
})
