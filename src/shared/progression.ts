import { LEVEL_CAPS } from './run'

/**
 * The bosses of Black 2 / White 2 in story order: the eight Gym Leaders with their city, type and badge, then the
 * Elite Four and the Champion. Caps are LEVEL_CAPS; the Champion has none. `path` is the main story route from the
 * previous boss to this one, from Bulbapedia's walkthrough, leaving out side areas.
 */
export type Boss = { name: string; place: string; type: number | null; badge?: string; cap: number | null; members?: string[]; path: string[] }

export const BOSSES: Boss[] = [
  { name: 'Cheren', place: 'Aspertia City', type: 0, badge: 'Basic Badge', cap: LEVEL_CAPS[0], path: ['Route 19', 'Floccesy Town', 'Route 20', 'Floccesy Ranch', 'Pledge Grove'] },
  { name: 'Roxie', place: 'Virbank City', type: 3, badge: 'Toxic Badge', cap: LEVEL_CAPS[1], path: ['Route 20', 'Virbank Complex'] },
  { name: 'Burgh', place: 'Castelia City', type: 6, badge: 'Insect Badge', cap: LEVEL_CAPS[2], path: ['Castelia Sewers'] },
  { name: 'Elesa', place: 'Nimbasa City', type: 12, badge: 'Bolt Badge', cap: LEVEL_CAPS[3], path: ['Route 4', 'Join Avenue'] },
  { name: 'Clay', place: 'Driftveil City', type: 4, badge: 'Quake Badge', cap: LEVEL_CAPS[4], path: ['Route 5', 'Driftveil Drawbridge'] },
  { name: 'Skyla', place: 'Mistralton City', type: 2, badge: 'Jet Badge', cap: LEVEL_CAPS[5], path: ['Plasma Frigate', 'Relic Passage', 'Route 6', 'Chargestone Cave'] },
  { name: 'Drayden', place: 'Opelucid City', type: 15, badge: 'Legend Badge', cap: LEVEL_CAPS[6], path: ['Lentimas Town', 'Reversal Mountain', 'Undella Town', 'Route 13', 'Lacunosa Town', 'Route 12', 'Village Bridge', 'Route 11', 'Route 9'] },
  { name: 'Marlon', place: 'Humilau City', type: 10, badge: 'Wave Badge', cap: LEVEL_CAPS[7], path: ['Marine Tube'] },
  { name: 'Elite Four', place: 'Pokémon League', type: null, cap: LEVEL_CAPS[8], members: ['Shauntal', 'Grimsley', 'Caitlin', 'Marshal'], path: ['Route 22', 'Route 21', 'Seaside Cave', 'Plasma Frigate', 'Giant Chasm', 'Route 23', 'Victory Road'] },
  { name: 'Iris', place: 'Pokémon League', type: 15, cap: null, path: [] }
]

/** Every trainer a boss stands for: the Elite Four's members, otherwise the boss. */
export const trainersOf = (boss: Boss) => boss.members ?? [boss.name]

/** The next boss for a number of badges. */
export const nextBoss = (badges: number) => BOSSES[Math.min(badges, BOSSES.length - 1)]
