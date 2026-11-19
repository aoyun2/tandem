import { narcFiles } from './romtext'

/**
 * Wild Pokémon by place, from the ROM. A zone header's u16 at +0x14 holds the zone's encounter table in its low byte
 * (0xFF: none) and its place-name index at +0x1A; a/1/2/7 holds the tables, each season 232 bytes: eight rates, then
 * 4-byte slots (species in the low 11 bits, minimum and maximum level) for 12 grass, 12 dark grass, 12 rustling grass,
 * 5 surfing, 5 rippling water, 5 fishing and 5 rippling fishing. The first season is read.
 */
export const METHODS = ['grass', 'dark grass', 'rustling grass', 'surfing', 'rippling water', 'fishing', 'rippling fishing'] as const
const SLOTS = [12, 12, 12, 5, 5, 5, 5]

/** Place-name index → [species, method, lowest level, highest level] for each species and method found there. */
export function wildEncounters(zoneHeaders: Uint8Array, encounterArchive: Uint8Array): Record<string, [number, number, number, number][]> {
  const tables = narcFiles(encounterArchive), out: Record<string, [number, number, number, number][]> = {}
  for (let z = 0; (z + 1) * 48 <= zoneHeaders.length; z++) {
    const table = zoneHeaders[z * 48 + 0x14], place = zoneHeaders[z * 48 + 0x1a], data = tables[table]
    if (table === 0xff || !place || !data || data.length < 232) continue
    const list = out[place] ??= []
    let o = 8
    SLOTS.forEach((count, method) => {
      for (let k = 0; k < count; k++, o += 4) {
        const species = (data[o] | data[o + 1] << 8) & 0x7ff, low = data[o + 2], high = data[o + 3]
        if (!species) continue
        const known = list.find(e => e[0] === species && e[1] === method)
        if (known) { known[2] = Math.min(known[2], low); known[3] = Math.max(known[3], high) } else list.push([species, method, low, high])
      }
    })
    if (!list.length) delete out[place]
  }
  return out
}
