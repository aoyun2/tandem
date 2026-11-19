/**
 * Where the player is in Black 2 / White 2. The ROM's zone table (a/0/1/2, file 0) has a 48-byte header per zone, with
 * its parent zone at +0x18 and its place-name index at +0x1A; that index is the met-location number catches carry.
 * The game keeps a copy of the current zone's header in main RAM, followed by the zone's id, behind the pointer at
 * 0x02000024 (masked to 24 bits) plus 0x41B2C. A copy counts only when it equals the ROM's header of the zone it
 * names; when the pointer's copy does not, main RAM is searched for a single such copy. Facts from Souldew's
 * shared/live/location.mjs and NDS-Ironmon-Tracker's memory addresses.
 */

export const ZONE_HEADER = 48
const POINTER = 0x24, COPY = 0x41b2c

const u16 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8

/** The zone whose header the copy at `offset` in main RAM is, or -1. */
export function zoneCopyAt(ram: Uint8Array, offset: number, headers: Uint8Array) {
  if (offset < 0 || offset + ZONE_HEADER + 2 > ram.length) return -1
  const zone = u16(ram, offset + ZONE_HEADER)
  if ((zone + 1) * ZONE_HEADER > headers.length) return -1
  for (let i = 0; i < ZONE_HEADER; i++) if (ram[offset + i] !== headers[zone * ZONE_HEADER + i]) return -1
  return zone
}

/** The offset of the copy behind the game's main pointer. */
export const pointedCopy = (ram: Uint8Array) => ram.length >= POINTER + 4 ? ((ram[POINTER] | ram[POINTER + 1] << 8 | ram[POINTER + 2] << 16) + COPY) : -1

/** The offset of the only copy of a zone header in main RAM, or -1 when there is none or more than one. */
export function searchCopy(ram: Uint8Array, headers: Uint8Array) {
  let found = -1
  for (let o = 0; o + ZONE_HEADER + 2 <= ram.length; o += 4) {
    if (zoneCopyAt(ram, o, headers) < 0) continue
    if (found >= 0) return -1
    found = o
  }
  return found
}

/** The place-name index of a zone, or its parent zone's when it has none of its own; 0 for none. */
export function placeOfZone(headers: Uint8Array, zone: number) {
  const at = (z: number) => (z + 1) * ZONE_HEADER <= headers.length ? headers[z * ZONE_HEADER + 0x1a] : 0
  return at(zone) || at(u16(headers, zone * ZONE_HEADER + 0x18))
}

export type Whereabouts = { zone: number; place: number; at: number }

/** The current zone and place, trying the remembered copy, then the pointer's; null when no copy matches. */
export function whereabouts(ram: Uint8Array, headers: Uint8Array, remembered = -1): Whereabouts | null {
  for (const at of [remembered, pointedCopy(ram)]) {
    const zone = zoneCopyAt(ram, at, headers)
    if (zone > 0) return { zone, place: placeOfZone(headers, zone), at }
  }
  return null
}
