/** Nintendo DS header inspection only. This does not prove retail identity or playability. */
const languages: Record<string, string> = {
  O: 'English', J: 'Japanese', D: 'German', F: 'French', I: 'Italian', S: 'Spanish', K: 'Korean'
}

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff
  for (const value of bytes) {
    crc ^= value
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1
  }
  return crc
}

export function inspectHeader(bytes: Uint8Array, fileSize: number) {
  if (bytes.length < 0x160 || fileSize < 0x160) throw new Error('This file is too small to contain a Nintendo DS header.')
  if (!Number.isSafeInteger(fileSize) || fileSize > 1024 ** 3) throw new Error('Choose an uncompressed Nintendo DS ROM smaller than 1 GB.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const code = String.fromCharCode(...bytes.subarray(0x0c, 0x10))
  const game = code.startsWith('IRE') ? 'Black 2' : code.startsWith('IRD') ? 'White 2' : null
  if (!game || !languages[code[3]]) throw new Error('Choose a Pokémon Black 2 or White 2 .nds file. Other games are not supported in this first build.')
  if (crc16(bytes.subarray(0, 0x15e)) !== view.getUint16(0x15e, true)) throw new Error('The ROM header checksum does not match. Select an intact base ROM.')
  const usedSize = view.getUint32(0x80, true)
  if (usedSize < 0x160 || usedSize > fileSize) throw new Error('The ROM appears truncated or has an invalid size in its header.')
  for (const offset of [0x20, 0x30]) {
    const start = view.getUint32(offset, true)
    const length = view.getUint32(offset + 12, true)
    if (start < 0x160 || length === 0 || start + length > fileSize) throw new Error('A game executable is missing or extends beyond the file. Select an intact base ROM.')
  }
  return { game, gameCode: code, revision: bytes[0x1e], language: languages[code[3]] } as const
}
