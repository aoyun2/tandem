import { describe, expect, it } from 'vitest'
import { badgeCount, encodePokemon, findSaveBase, readParty, readPokemon, SAVE } from '../src/shared/gen5'

describe('Gen 5 Pokémon', () => {
  it('decrypts what it encrypts, for every block order', () => {
    for (let shuffle = 0; shuffle < 24; shuffle++) {
      const pid = (shuffle << 13) | 0x1234
      const bytes = encodePokemon({ pid, species: 495, nickname: 'Leafy', metLocation: 117, metLevel: 5, level: 7, hp: 0, maxHp: 24 }, true)
      const p = readPokemon(bytes, 0, true)!
      expect(p).toMatchObject({ pid, species: 495, nickname: 'Leafy', nicknamed: true, metLocation: 117, metLevel: 5, level: 7, hp: 0, maxHp: 24 })
    }
  })
  it('rejects a slot whose checksum fails', () => {
    const bytes = encodePokemon({ pid: 99, species: 1, nickname: '', metLocation: 1, metLevel: 2 }, false)
    bytes[40] ^= 0xff
    expect(readPokemon(bytes, 0, false)).toBeNull()
  })
  it('finds the save base from the party block and reads the party', () => {
    const ram = new Uint8Array(0x40000), base = 0x8000, party = base + SAVE.party
    for (let i = 0; i < 24; i++) ram.set(new Uint8Array(new Uint16Array([...`BOX ${i + 1}`].map(c => c.charCodeAt(0)).concat(0xffff)).buffer), base + 4 + i * 0x28)
    ram[party] = 6; ram[party + 4] = 2
    ram.set(encodePokemon({ pid: 1, species: 501, nickname: '', metLocation: 117, metLevel: 5 }, true), party + 8)
    ram.set(encodePokemon({ pid: 2, species: 504, nickname: 'Pat', metLocation: 119, metLevel: 3 }, true), party + 8 + 220)
    expect(findSaveBase(ram)).toBe(base)
    expect(readParty(ram, party)!.map(p => p.species)).toEqual([501, 504])
  })
  it('does not take a block without box names as the save data', () => {
    const ram = new Uint8Array(0x40000), party = 0x8000 + SAVE.party
    ram[party] = 6; ram[party + 4] = 1
    ram.set(encodePokemon({ pid: 1, species: 501, nickname: '', metLocation: 117, metLevel: 5 }, true), party + 8)
    expect(findSaveBase(ram)).toBe(-1)
  })
  it('counts badges from their flags', () => { expect(badgeCount(0b1011)).toBe(3) })
})
