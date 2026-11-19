/**
 * Pokémon Black 2 / White 2 data structures: the encrypted Pokémon format, the party, and the save blocks the
 * tracker reads. Offsets follow PKHeX's SaveBlockAccessor5B2W2, Misc5 and PlayerPosition5.
 */

/** Save-block offsets within the save data. */
export const SAVE = {
  party: 0x18e00, trainer: 0x19400, position: 0x19500, misc: 0x21100, boxes: 0x400,
  /** One box: 30 stored Pokémon of 136 bytes, padded to 0x1000. */
  boxStride: 0x1000, boxCount: 24
} as const

export const STORED_SIZE = 136, PARTY_SIZE = 220

export type Pokemon = {
  pid: number; species: number; nickname: string; nicknamed: boolean; egg: boolean
  level: number | null; hp: number | null; maxHp: number | null
  metLocation: number; metLevel: number; ball: number; otId: number; shiny: boolean
}

/** Block order for each of the 24 shuffles, as indices of blocks A–D in stored order. */
const ORDERS = ['ABCD', 'ABDC', 'ACBD', 'ACDB', 'ADBC', 'ADCB', 'BACD', 'BADC', 'BCAD', 'BCDA', 'BDAC', 'BDCA', 'CABD', 'CADB', 'CBAD', 'CBDA', 'CDAB', 'CDBA', 'DABC', 'DACB', 'DBAC', 'DBCA', 'DCAB', 'DCBA']

const u16 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8
const u32 = (b: Uint8Array, o: number) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0

/** XORs `length` bytes from `offset` with the game's linear congruential stream seeded by `seed`. */
function crypt(out: Uint8Array, offset: number, length: number, seed: number) {
  let s = seed >>> 0
  for (let i = 0; i < length; i += 2) {
    s = (Math.imul(s, 0x41c64e6d) + 0x6073) >>> 0
    const k = s >>> 16
    out[offset + i] ^= k & 0xff; out[offset + i + 1] ^= k >>> 8
  }
}

/** UTF-16 text up to the game's 0xFFFF terminator. */
export function text(bytes: Uint8Array, offset: number, chars: number) {
  let out = ''
  for (let i = 0; i < chars; i++) {
    const c = u16(bytes, offset + i * 2)
    if (c === 0xffff || c === 0) break
    out += String.fromCharCode(c)
  }
  return out
}

/**
 * Decrypts one Pokémon at `offset` (136 bytes stored, 220 with party stats). Returns null for an empty slot or when
 * the checksum fails, which is how a slot that does not hold a Pokémon is told apart.
 */
export function readPokemon(source: Uint8Array, offset: number, party: boolean): Pokemon | null {
  const size = party ? PARTY_SIZE : STORED_SIZE
  if (offset < 0 || offset + size > source.length) return null
  const b = source.slice(offset, offset + size)
  const pid = u32(b, 0), checksum = u16(b, 6)
  if (pid === 0 && checksum === 0) return null
  crypt(b, 8, 128, checksum)
  let sum = 0
  for (let i = 8; i < 136; i += 2) sum = (sum + u16(b, i)) & 0xffff
  if (sum !== checksum) return null
  // Unshuffle the four 32-byte blocks into A, B, C, D order.
  const order = ORDERS[((pid >>> 13) & 31) % 24], blocks = new Uint8Array(128)
  for (let i = 0; i < 4; i++) blocks.set(b.subarray(8 + i * 32, 8 + i * 32 + 32), ('ABCD'.indexOf(order[i])) * 32)
  const at = (o: number) => o - 8
  const species = u16(blocks, at(0x08))
  if (!species || species > 721) return null
  const ivs = u32(blocks, at(0x38))
  const tid = u16(blocks, at(0x0c)), sid = u16(blocks, at(0x0e))
  const shiny = ((tid ^ sid ^ (pid >>> 16) ^ (pid & 0xffff)) >>> 0) < 8
  let level: number | null = null, hp: number | null = null, maxHp: number | null = null
  if (party) {
    crypt(b, 136, 84, pid)
    level = b[0x8c]; hp = u16(b, 0x8e); maxHp = u16(b, 0x90)
  }
  const metByte = blocks[at(0x84)]
  return {
    pid, species,
    nickname: text(blocks, at(0x48), 11),
    nicknamed: (ivs >>> 31) === 1, egg: ((ivs >>> 30) & 1) === 1,
    level, hp, maxHp,
    metLocation: u16(blocks, at(0x80)), metLevel: metByte & 0x7f, ball: blocks[at(0x83)],
    otId: tid, shiny
  }
}

/** The party block: a capacity of six, the count, then six 220-byte Pokémon. */
export function readParty(source: Uint8Array, offset: number): Pokemon[] | null {
  if (u32(source, offset) !== 6) return null
  const count = u32(source, offset + 4)
  if (count > 6) return null
  const party: Pokemon[] = []
  for (let i = 0; i < count; i++) {
    const p = readPokemon(source, offset + 8 + i * PARTY_SIZE, true)
    if (!p) return null
    party.push(p)
  }
  return party
}

/**
 * Finds the game's in-memory copy of the save data by locating its party block: a capacity of six and a count of one
 * to six, followed by that many Pokémon whose checksums hold. Returns the address the save offsets are relative to.
 */
export function findSaveBase(ram: Uint8Array) {
  for (let o = 0; o + 8 + PARTY_SIZE <= ram.length; o += 4) {
    if (ram[o] !== 6 || ram[o + 1] || ram[o + 2] || ram[o + 3]) continue
    const count = ram[o + 4]
    if (!count || count > 6 || ram[o + 5] || ram[o + 6] || ram[o + 7]) continue
    const base = o - SAVE.party
    if (base < 0 || !boxNames(ram, base)) continue
    if (readParty(ram, o)) return base
  }
  // Before the first Pokémon: an empty party block beside a named trainer.
  for (let o = SAVE.party; o + 8 <= ram.length; o += 4) {
    if (ram[o] !== 6 || ram[o + 1] || ram[o + 2] || ram[o + 3] || ram[o + 4] || ram[o + 5] || ram[o + 6] || ram[o + 7]) continue
    const base = o - SAVE.party
    if (base + SAVE.misc + 8 > ram.length) continue
    if (boxNames(ram, base) && plausibleName(text(ram, base + SAVE.trainer + 4, 8))) return base
  }
  return -1
}

/** A trainer name: one to eight printable Latin, kana or CJK characters. */
const plausibleName = (name: string) => name.length > 0 && name.length <= 8 && name.trim().length > 0 && [...name].every(ch => { const c = ch.charCodeAt(0); return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0x24f) || (c >= 0x3000 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef) })

/** The save data opens with the 24 box names, 0x28 bytes apart; a real copy has a name in every one. */
const boxNames = (ram: Uint8Array, base: number) => { for (let i = 0; i < 24; i++) if (!plausibleName(text(ram, base + 4 + i * 0x28, 9))) return false; return true }

/** Whether the save data is still at `base`: the party block's capacity and a named trainer. */
export const stillAt = (ram: Uint8Array, base: number) => base >= 0 && boxNames(ram, base) && u32(ram, base + SAVE.party) === 6 && u32(ram, base + SAVE.party + 4) <= 6 && plausibleName(text(ram, base + SAVE.trainer + 4, 8))

/** What a save file says about the game: the trainer, time played in the game, badges and money. Null when unsaved. */
export function saveSummary(save: Uint8Array) {
  const name = text(save, SAVE.trainer + 4, 8)
  if (save.length < SAVE.misc + 8 || !name) return null
  return {
    name, id: u16(save, SAVE.trainer + 0x14),
    played: { hours: u16(save, SAVE.trainer + 0x24), minutes: save[SAVE.trainer + 0x26] },
    badges: badgeCount(save[SAVE.misc + 4]), money: u32(save, SAVE.misc)
  }
}

export type Trainer = { name: string; id: number; badges: number; zone: number; money: number }

/** The trainer's name and ID, badge flags, money and current zone. */
export function readTrainer(source: Uint8Array, base: number): Trainer {
  return {
    name: text(source, base + SAVE.trainer + 4, 8),
    id: u16(source, base + SAVE.trainer + 0x14),
    badges: source[base + SAVE.misc + 4],
    money: u32(source, base + SAVE.misc),
    zone: u16(source, base + SAVE.position + 0x80)
  }
}

/** Every Pokémon in the PC boxes. */
export function readBoxes(source: Uint8Array, base: number) {
  const out: Pokemon[] = []
  for (let box = 0; box < SAVE.boxCount; box++) for (let slot = 0; slot < 30; slot++) {
    const p = readPokemon(source, base + SAVE.boxes + box * SAVE.boxStride + slot * STORED_SIZE, false)
    if (p) out.push(p)
  }
  return out
}

/** Number of badges from the badge flags. */
export const badgeCount = (flags: number) => { let n = 0; for (let i = 0; i < 8; i++) if (flags & (1 << i)) n++; return n }

/** Encrypts a Pokémon for tests: the inverse of readPokemon for the fields it reads. */
export function encodePokemon(p: { pid: number; species: number; nickname: string; metLocation: number; metLevel: number; ball?: number; tid?: number; sid?: number; level?: number; hp?: number; maxHp?: number }, party: boolean) {
  const size = party ? PARTY_SIZE : STORED_SIZE, b = new Uint8Array(size), blocks = new Uint8Array(128)
  const w16 = (a: Uint8Array, o: number, v: number) => { a[o] = v & 0xff; a[o + 1] = (v >>> 8) & 0xff }
  const w32 = (a: Uint8Array, o: number, v: number) => { w16(a, o, v & 0xffff); w16(a, o + 2, v >>> 16) }
  const at = (o: number) => o - 8
  w16(blocks, at(0x08), p.species); w16(blocks, at(0x0c), p.tid ?? 1); w16(blocks, at(0x0e), p.sid ?? 2)
  w32(blocks, at(0x38), p.nickname ? 0x80000000 : 0)
  for (let i = 0; i < 11; i++) w16(blocks, at(0x48) + i * 2, i < p.nickname.length ? p.nickname.charCodeAt(i) : 0xffff)
  w16(blocks, at(0x80), p.metLocation); blocks[at(0x83)] = p.ball ?? 4; blocks[at(0x84)] = p.metLevel
  let sum = 0
  for (let i = 0; i < 128; i += 2) sum = (sum + u16(blocks, i)) & 0xffff
  w32(b, 0, p.pid); w16(b, 6, sum)
  const order = ORDERS[((p.pid >>> 13) & 31) % 24]
  for (let i = 0; i < 4; i++) b.set(blocks.subarray('ABCD'.indexOf(order[i]) * 32, 'ABCD'.indexOf(order[i]) * 32 + 32), 8 + i * 32)
  crypt(b, 8, 128, sum)
  if (party) { b[0x8c] = p.level ?? 5; w16(b, 0x8e, p.hp ?? 20); w16(b, 0x90, p.maxHp ?? 20); crypt(b, 136, 84, p.pid) }
  return b
}
