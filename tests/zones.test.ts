import { describe, expect, it } from 'vitest'
import { placeOfZone, searchCopy, whereabouts, ZONE_HEADER } from '../src/shared/zones'

/** A zone table where zone z's header is filled with z, has `parent` at +0x18 and `place` at +0x1A. */
function table(zones: { parent: number; place: number }[]) {
  const t = new Uint8Array(zones.length * ZONE_HEADER)
  zones.forEach((z, i) => { t.fill(i + 1, i * ZONE_HEADER, (i + 1) * ZONE_HEADER); t[i * ZONE_HEADER + 0x18] = z.parent; t[i * ZONE_HEADER + 0x19] = 0; t[i * ZONE_HEADER + 0x1a] = z.place })
  return t
}

/** Main RAM with the pointer at 0x24 and a copy of `zone`'s header plus its id at `at`. */
function ram(headers: Uint8Array, zone: number, at: number, pointed = true) {
  const r = new Uint8Array(0x50000)
  if (pointed) { const p = at - 0x41b2c; r[0x24] = p & 255; r[0x25] = p >> 8 & 255; r[0x26] = p >> 16 & 255 }
  r.set(headers.subarray(zone * ZONE_HEADER, (zone + 1) * ZONE_HEADER), at)
  r[at + ZONE_HEADER] = zone & 255; r[at + ZONE_HEADER + 1] = zone >> 8
  return r
}

describe('zones', () => {
  const headers = table([{ parent: 0, place: 0 }, { parent: 0, place: 117 }, { parent: 1, place: 0 }])

  it('reads the zone behind the pointer and names it by its place, or its parent’s', () => {
    expect(whereabouts(ram(headers, 1, 0x42000), headers)).toEqual({ zone: 1, place: 117, at: 0x42000 })
    expect(whereabouts(ram(headers, 2, 0x42000), headers)?.place).toBe(117)
    expect(placeOfZone(headers, 0)).toBe(0)
  })

  it('ignores a copy that differs from the ROM’s header, and zone 0', () => {
    const r = ram(headers, 1, 0x42000); r[0x42003] ^= 1
    expect(whereabouts(r, headers)).toBeNull()
    expect(whereabouts(new Uint8Array(0x50000), headers)).toBeNull()
  })

  it('finds a single copy elsewhere in RAM', () => {
    const r = ram(headers, 1, 0x43000, false)
    expect(searchCopy(r, headers)).toBe(0x43000)
    expect(whereabouts(r, headers, searchCopy(r, headers))?.zone).toBe(1)
  })
})
