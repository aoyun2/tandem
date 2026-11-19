/** Games that can link, grouped by generation pair; codes are the first three characters of the DS game code. */
export const PAIR_GROUPS = [
  { id: 'gen5-sequels', games: { IRE: 'Black 2', IRD: 'White 2' } as Record<string, string> }
]

export function pairGroup(gameCode: string) {
  const prefix = gameCode.slice(0, 3)
  return PAIR_GROUPS.find(group => prefix in group.games) ?? null
}

/** True when both games belong to the same generation pair. */
export function canPair(a: string, b: string) {
  const group = pairGroup(a)
  return group !== null && group === pairGroup(b)
}

/** The other version in the game's pair, as a display name. */
export function counterpart(gameCode: string) {
  const group = pairGroup(gameCode), prefix = gameCode.slice(0, 3)
  if (!group) return null
  const other = Object.keys(group.games).find(code => code !== prefix)
  return other ? group.games[other] : null
}
