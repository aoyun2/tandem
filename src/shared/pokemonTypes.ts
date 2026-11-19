/** Type names in the games' own order, and a colour for each. */
export const TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark']
export const TYPE_COLORS = ['#a8a77a', '#c22e28', '#a98ff3', '#a33ea1', '#e2bf65', '#b6a136', '#a6b91a', '#735797', '#b7b7ce', '#ee8130', '#6390f0', '#7ac74c', '#f7d02c', '#f95587', '#96d9d6', '#6f35fc', '#705746']

const SUPER: number[][] = [[], [0, 5, 8, 14, 16], [1, 6, 11], [11], [3, 5, 8, 9, 12], [2, 6, 9, 14], [11, 13, 16], [7, 13], [5, 14], [6, 8, 11, 14], [4, 5, 9], [4, 5, 10], [2, 10], [1, 3], [2, 4, 11, 15], [15], [7, 13]]
const RESISTED: number[][] = [[5, 8], [2, 3, 6, 13], [5, 8, 12], [3, 4, 5, 7], [6, 11], [1, 4, 8], [1, 2, 3, 7, 8, 9], [16, 8], [8, 9, 10, 12], [5, 9, 10, 15], [10, 11, 15], [2, 3, 6, 8, 9, 11, 15], [11, 12, 15], [8, 13], [8, 9, 10, 14], [8], [1, 16, 8]]
const IMMUNE: number[][] = [[7], [7], [], [8], [2], [], [], [0], [], [], [], [], [4], [16], [], [], []]

/** Damage multiplier of an attacking type against a Pokémon's types, by the Generation V chart. */
export function effectiveness(attack: number, defence: readonly number[]) {
  return [...new Set(defence)].reduce((m, d) => m * (IMMUNE[attack]?.includes(d) ? 0 : SUPER[attack]?.includes(d) ? 2 : RESISTED[attack]?.includes(d) ? .5 : 1), 1)
}

/**
 * The attacking types that hit the most of a team super-effectively, best first, with how many each hits; ties go to
 * the larger total multiplier, then to fewer members resisting.
 */
export function bestAttackers(team: readonly (readonly number[])[], limit = 3) {
  return TYPES.map((_, attack) => {
    const each = team.map(t => effectiveness(attack, t))
    return { type: attack, hits: each.filter(m => m > 1).length, total: each.reduce((a, m) => a + m, 0), resisted: each.filter(m => m < 1).length }
  })
    .filter(a => a.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.total - a.total || a.resisted - b.resisted || a.type - b.type)
    .slice(0, limit)
}
