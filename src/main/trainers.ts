import { messages, narcFiles } from './romtext'
import { palette } from './ndsgfx'
import { png } from './icons'
import { TYPE_COLORS } from '../shared/pokemonTypes'
import type { TrainerMon } from '../shared/api'

/** The trainer-name text: the message file with one line per trainer record that holds one of the wanted names. */
export function trainerNames(texts: string[][], trainers: number, wanted: string[]) {
  return texts.find(lines => lines.length === trainers && wanted.some(n => lines.includes(n)))
}

/**
 * Each wanted trainer's team in its first battle under that name, the Normal-mode one: a/0/9/1 gives the record
 * (byte 0 flags, 1 moves and 2 items; byte 3 the team size) and a/0/9/2 the Pokémon, 8 bytes each (level at 2,
 * species at 4, the difficulty at 0 giving every IV as difficulty × 31 / 255) then the item and the four moves when
 * flagged. Each move's type, category (0 status, 1 physical, 2 special), power, accuracy and PP are a/0/2/1 bytes 0, 2,
 * 3, 4 and 5.
 */
export function trainerTeams(textArchive: Uint8Array, trainerArchive: Uint8Array, teamArchive: Uint8Array, moveArchive: Uint8Array, wanted: string[]): Record<string, TrainerMon[]> {
  const texts = narcFiles(textArchive).map(messages), trainers = narcFiles(trainerArchive), teams = narcFiles(teamArchive), moves = narcFiles(moveArchive)
  const names = trainerNames(texts, trainers.length, wanted)
  const moveNames = texts.find(lines => lines[1] === 'Pound' && lines[33] === 'Tackle') ?? []
  const itemNames = texts.find(lines => lines[1] === 'Master Ball') ?? []
  const out: Record<string, TrainerMon[]> = {}
  if (!names) return out
  for (const name of wanted) {
    const index = names.indexOf(name), record = trainers[index], team = teams[index]
    if (index < 0 || !record || record.length < 4 || !team) continue
    const hasMoves = record[0] & 1, hasItems = record[0] & 2, size = 8 + (hasItems ? 2 : 0) + (hasMoves ? 8 : 0)
    const u16 = (o: number) => team[o] | team[o + 1] << 8
    const mons: TrainerMon[] = []
    for (let k = 0; k < record[3] && (k + 1) * size <= team.length; k++) {
      const o = k * size, item = hasItems ? u16(o + 8) : 0
      const known = hasMoves ? [0, 1, 2, 3].map(m => u16(o + 8 + (hasItems ? 2 : 0) + m * 2)).filter(Boolean) : []
      mons.push({
        species: u16(o + 4), level: team[o + 2], iv: Math.floor(team[o] * 31 / 255),
        ...(item && itemNames[item] ? { item: itemNames[item] } : {}),
        moves: known.map(m => ({ name: moveNames[m] ?? `#${m}`, type: moves[m]?.[0] ?? 0, category: moves[m]?.[2] ?? 0, power: moves[m]?.[3] ?? 0, accuracy: moves[m]?.[4] ?? 0, pp: moves[m]?.[5] ?? 0 }))
      })
    }
    out[name] = mons
  }
  return out
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

/** One 32×16 label of a/0/8/2 in whichever of the three palettes of file 33 puts its own slots (those that differ
 * between the palettes) nearest `colour`, as a PNG data URL, with that distance. */
function uiLabel(files: Uint8Array[], palettes: number[][][], index: number, colour: string) {
  const label = files[index]
  if (!label || String.fromCharCode(...label.subarray(0, 4)) !== 'RGCN') return { url: '', distance: Infinity }
  const at = (x: number, y: number) => { const o = 0x30 + ((y >> 3) * 4 + (x >> 3)) * 32 + (y & 7) * 4 + ((x & 7) >> 1); return x & 1 ? label[o] >> 4 : label[o] & 15 }
  const use = new Array(16).fill(0)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) use[at(x, y)]++
  use[0] = 0
  const want = rgb(colour), own = use.map((n, v) => n && palettes.some(p => p[v].some((c, i) => c !== palettes[0][v][i])) ? n : 0)
  const total = own.reduce((a, b) => a + b, 0) || 1
  const distance = (p: number[][]) => own.reduce((sum, n, v) => sum + n * Math.hypot(p[v][0] - want[0], p[v][1] - want[1], p[v][2] - want[2]), 0) / total
  const colours = palettes.reduce((best, p) => distance(p) < distance(best) ? p : best)
  const rgba = new Uint8Array(32 * 16 * 4)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    const v = at(x, y)
    if (!v) continue
    const c = colours[v], p = (y * 32 + x) * 4
    rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255
  }
  return { url: 'data:image/png;base64,' + png(32, 16, rgba).toString('base64'), distance: distance(colours) }
}

/**
 * The games' own type labels (a/0/8/2, files 34 to 50, 32×16), as PNG data URLs in type order, each in the shared
 * palette nearest that type's colour.
 */
export function typeLabels(uiArchive: Uint8Array): string[] {
  const files = narcFiles(uiArchive), palettes = [0, 1, 2].map(p => palette(files[33], p))
  return TYPE_COLORS.map((colour, type) => uiLabel(files, palettes, 34 + type, colour).url)
}

/**
 * The move category icons (a/0/8/2, files 56 to 58) in category order: status, physical, special. Each category takes
 * the file and palette nearest its colour: grey, orange, blue.
 */
export function categoryIcons(uiArchive: Uint8Array): string[] {
  const files = narcFiles(uiArchive), palettes = [0, 1, 2].map(p => palette(files[33], p))
  const left = [56, 57, 58]
  return ['#a4a4ac', '#e8743a', '#5c86e8'].map(colour => {
    const options = left.map(index => ({ index, ...uiLabel(files, palettes, index, colour) }))
    const best = options.reduce((a, b) => b.distance < a.distance ? b : a)
    left.splice(left.indexOf(best.index), 1)
    return best.url
  })
}
