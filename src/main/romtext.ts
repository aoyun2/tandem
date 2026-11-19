/**
 * Reads text from a Black 2 / White 2 ROM: the cartridge file system, NARC archives inside it, and the game's
 * encrypted message files. The species and place names the tracker shows come from the player's own ROM.
 */

const u16 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8
const u32 = (b: Uint8Array, o: number) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0

/** Where a cartridge file at a path such as "a/0/0/2" lies in the ROM, from its file name and allocation tables. */
export function locate(fnt: Uint8Array, fat: Uint8Array, path: string): [number, number] | null {
  let dir = 0xf000
  const parts = path.split('/')
  for (let p = 0; p < parts.length; p++) {
    const entry = (dir & 0xfff) * 8
    let at = u32(fnt, entry), id = u16(fnt, entry + 4), found = -1
    for (;;) {
      const kind = fnt[at++]
      if (!kind) break
      const length = kind & 0x7f, name = String.fromCharCode(...fnt.subarray(at, at + length)); at += length
      if (kind & 0x80) { const sub = u16(fnt, at); at += 2; if (name === parts[p] && p < parts.length - 1) { found = sub; break } }
      else { if (name === parts[p] && p === parts.length - 1) return [u32(fat, id * 8), u32(fat, id * 8 + 4)]; id++ }
    }
    if (found < 0) return null
    dir = found
  }
  return null
}

/** The cartridge file at a path, from a whole ROM in memory. */
export function romFile(rom: Uint8Array, path: string) {
  const fnt = rom.subarray(u32(rom, 0x40), u32(rom, 0x40) + u32(rom, 0x44)), fat = rom.subarray(u32(rom, 0x48), u32(rom, 0x48) + u32(rom, 0x4c))
  const range = locate(fnt, fat, path)
  return range ? rom.subarray(range[0], range[1]) : null
}

/** The files inside a NARC archive. */
export function narcFiles(narc: Uint8Array) {
  if (String.fromCharCode(...narc.subarray(0, 4)) !== 'NARC') return []
  let at = u16(narc, 0x0c)
  const blocks: Record<string, number> = {}
  for (let i = 0; i < 3 && at < narc.length; i++) { blocks[String.fromCharCode(...narc.subarray(at, at + 4))] = at; at += u32(narc, at + 4) }
  const fat = blocks.BTAF, gmif = blocks.GMIF
  if (fat === undefined || gmif === undefined) return []
  const count = u16(narc, fat + 8), data = gmif + 8, files: Uint8Array[] = []
  for (let i = 0; i < count; i++) files.push(narc.subarray(data + u32(narc, fat + 12 + i * 8), data + u32(narc, fat + 16 + i * 8)))
  return files
}

/** The lines of one Gen 5 message file, decrypted; variables are dropped and line breaks become spaces. */
export function messages(file: Uint8Array): string[] {
  if (file.length < 16) return []
  const sections = u16(file, 0), count = u16(file, 2)
  if (!sections || !count || count > 4000) return []
  const section = u32(file, 12)
  if (section + 4 + count * 8 > file.length) return []
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    const offset = section + u32(file, section + 4 + i * 8), length = Math.min(u16(file, section + 8 + i * 8), (file.length - offset) >> 1)
    // Each line is decrypted from its end: the last character is the 0xFFFF terminator, which gives the key.
    const chars = new Array<number>(length)
    let k = length ? u16(file, offset + (length - 1) * 2) ^ 0xffff : 0
    for (let c = length - 1; c >= 0; c--) { chars[c] = u16(file, offset + c * 2) ^ k; k = ((k >> 3) | (k << 13)) & 0xffff }
    let out = ''
    if (chars[0] === 0xf100) {
      // Compressed: 9-bit characters packed into the following words, least significant bits first.
      let bits = 0, acc = 0
      for (let c = 1; c < length; c++) {
        acc |= chars[c] << bits; bits += 16
        while (bits >= 9) { const ch = acc & 0x1ff; acc >>>= 9; bits -= 9; if (ch === 0x1ff) { c = length; break } out += String.fromCharCode(ch) }
      }
      lines.push(out); continue
    }
    for (let c = 0; c < length; c++) {
      const ch = chars[c]
      if (ch === 0xffff) break
      if (ch === 0xf000) { c += 2 + (chars[c + 2] & 0xff); continue }
      out += ch === 0xfffe ? ' ' : String.fromCharCode(ch)
    }
    lines.push(out)
  }
  return lines
}

/**
 * Species and place names from the ROM's system text: the message file whose first entries are the first species,
 * and the one that holds the starting town's name, found by content rather than a fixed index.
 */
export function gameNames(archive: Uint8Array | null) {
  if (!archive) return null
  const files = narcFiles(archive).map(messages)
  const species = files.find(lines => lines.length > 649 && lines[1] === 'Bulbasaur' && lines[4] === 'Charmander')
  const places = files.find(lines => lines.length > 100 && lines.includes('Aspertia City') && lines.includes('Route 19'))
  return species && places ? { species, places } : null
}

/** Each species' two types, from the personal data archive a/0/1/6 (type bytes at 6 and 7). */
export function speciesTypes(personal: Uint8Array | null) {
  return personal ? narcFiles(personal).map(f => f.length > 7 ? [f[6], f[7]] as [number, number] : [0, 0] as [number, number]) : []
}

/**
 * Each species' evolution line, from the evolution archive a/0/1/9: seven entries of method, parameter and target per
 * species. Species joined by any evolution share a line, named by its lowest species number.
 */
export function evolutionLines(evolutions: Uint8Array | null) {
  const files = evolutions ? narcFiles(evolutions) : []
  const parent = files.map((_, i) => i)
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]))
  files.forEach((f, species) => {
    for (let e = 0; e + 6 <= f.length && e < 42; e += 6) {
      const target = u16(f, e + 4)
      if (u16(f, e) && target && target < files.length) { const a = root(species), b = root(target); parent[Math.max(a, b)] = Math.min(a, b) }
    }
  })
  return files.map((_, i) => root(i))
}
