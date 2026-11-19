import type { FileHandle } from 'node:fs/promises'

/**
 * The game's sound archive (an SDAT file in the ROM's root): a sequence by its symbol name, with the instrument bank
 * it plays and the wave archives the bank draws from. Offsets follow the SDAT layout: SYMB names, INFO records,
 * a FAT of file offsets relative to the archive's start.
 */

export type Track = { seq: Uint8Array; bank: Uint8Array; waves: (Uint8Array | null)[]; volume: number }

type Reader = (offset: number, length: number) => Promise<Buffer>

/** Where the root file ending in `.sdat` lies in the ROM. */
export async function findSdat(read: Reader): Promise<{ start: number; end: number } | null> {
  const header = await read(0, 0x60)
  const fnt = await read(header.readUInt32LE(0x40), header.readUInt32LE(0x44)), fat = await read(header.readUInt32LE(0x48), header.readUInt32LE(0x4c))
  let at = fnt.readUInt32LE(0), id = fnt.readUInt16LE(4)
  for (;;) {
    const kind = fnt[at++]
    if (!kind) return null
    const length = kind & 0x7f, name = fnt.subarray(at, at + length).toString('latin1'); at += length
    if (kind & 0x80) { at += 2; continue }
    if (name.endsWith('.sdat')) return { start: fat.readUInt32LE(id * 8), end: fat.readUInt32LE(id * 8 + 4) }
    id++
  }
}

/** Reads one sequence and everything it needs from the archive at `base` in the ROM. */
export async function readTrack(file: FileHandle, base: number, name: string): Promise<Track | null> {
  const read: Reader = async (offset, length) => { const b = Buffer.alloc(length); await file.read(b, 0, length, base + offset); return b }
  const head = await read(0, 0x40)
  if (head.toString('latin1', 0, 4) !== 'SDAT') return null
  const symbAt = head.readUInt32LE(0x10), symbSize = head.readUInt32LE(0x14), infoAt = head.readUInt32LE(0x18), infoSize = head.readUInt32LE(0x1c), fatAt = head.readUInt32LE(0x20), fatSize = head.readUInt32LE(0x24)
  if (!symbAt) return null
  const symb = await read(symbAt, symbSize), info = await read(infoAt, infoSize), fat = await read(fatAt, fatSize)
  // The sequence's number from its name.
  const names = symb.readUInt32LE(8), count = symb.readUInt32LE(names)
  let index = -1
  for (let i = 0; i < count && index < 0; i++) {
    const o = symb.readUInt32LE(names + 4 + i * 4)
    if (o && symb.toString('latin1', o, symb.indexOf(0, o)) === name) index = i
  }
  if (index < 0) return null
  const entry = (record: number, i: number) => { const list = info.readUInt32LE(8 + record * 4); return i < info.readUInt32LE(list) ? info.readUInt32LE(list + 4 + i * 4) : 0 }
  const fileAt = async (fileId: number) => { const o = 12 + fileId * 16; return read(fat.readUInt32LE(o), fat.readUInt32LE(o + 4)) }
  const seqInfo = entry(0, index)
  if (!seqInfo) return null
  const bankId = info.readUInt16LE(seqInfo + 4), volume = info[seqInfo + 6]
  const bankInfo = entry(2, bankId)
  if (!bankInfo) return null
  const waves: (Uint8Array | null)[] = []
  for (let w = 0; w < 4; w++) {
    const arc = info.readUInt16LE(bankInfo + 4 + w * 2)
    const arcInfo = arc === 0xffff ? 0 : entry(3, arc)
    waves.push(arcInfo ? new Uint8Array(await fileAt(info.readUInt32LE(arcInfo) & 0xffffff)) : null)
  }
  return { seq: new Uint8Array(await fileAt(info.readUInt16LE(seqInfo))), bank: new Uint8Array(await fileAt(info.readUInt16LE(bankInfo))), waves, volume }
}
