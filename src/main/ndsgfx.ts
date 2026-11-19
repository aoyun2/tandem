/**
 * DS graphics from the ROM: Nintendo's LZ10/LZ11 compression, 4-bit tile images (NCGR) with their palettes (NCLR),
 * and sprites assembled from cell layouts (NCER). Output is RGBA pixels.
 */

const u16 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8
const u32 = (b: Uint8Array, o: number) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0

/** Decompresses LZ10 or LZ11 data; returns the input unchanged when it is not compressed. */
export function lz(src: Uint8Array): Uint8Array {
  const type = src[0]
  if (type !== 0x10 && type !== 0x11) return src
  let size = src[1] | src[2] << 8 | src[3] << 16, at = 4
  if (!size) { size = u32(src, 4); at = 8 }
  const out = new Uint8Array(size)
  let o = 0
  while (o < size && at < src.length) {
    const flags = src[at++]
    for (let bit = 7; bit >= 0 && o < size; bit--) {
      if (!(flags >> bit & 1)) { out[o++] = src[at++]; continue }
      let length: number, disp: number
      if (type === 0x10) { const a = src[at++], b = src[at++]; length = (a >> 4) + 3; disp = ((a & 15) << 8 | b) + 1 }
      else {
        const a = src[at++], kind = a >> 4
        if (kind === 0) { const b = src[at++], c = src[at++]; length = ((a & 15) << 4 | b >> 4) + 0x11; disp = ((b & 15) << 8 | c) + 1 }
        else if (kind === 1) { const b = src[at++], c = src[at++], d = src[at++]; length = ((a & 15) << 12 | b << 4 | c >> 4) + 0x111; disp = ((c & 15) << 8 | d) + 1 }
        else { const b = src[at++]; length = kind + 1; disp = ((a & 15) << 8 | b) + 1 }
      }
      for (let k = 0; k < length && o < size; k++, o++) out[o] = out[o - disp]
    }
  }
  return out
}

/** A palette's colours as RGBA, from an NCLR file. */
export function palette(nclr: Uint8Array, index = 0): number[][] {
  const pltt = u32(nclr, 0x0c) === 0x10 ? 0x10 : u16(nclr, 0x0c), data = pltt + 0x18
  const out: number[][] = []
  for (let i = 0; i < 16; i++) { const v = u16(nclr, data + (index * 16 + i) * 2); out.push([(v & 31) * 255 / 31, (v >> 5 & 31) * 255 / 31, (v >> 10 & 31) * 255 / 31, i === 0 ? 0 : 255]) }
  return out
}

/** A 4-bit NCGR's tiles as palette indices: tile n is 64 values, row by row. */
export function tiles(ncgr: Uint8Array) {
  const char = u16(ncgr, 0x0c), data = char + 0x20, size = u32(ncgr, char + 0x18)
  const count = size / 32, out: Uint8Array[] = []
  for (let t = 0; t < count; t++) {
    const tile = new Uint8Array(64)
    for (let i = 0; i < 32; i++) { const b = ncgr[data + t * 32 + i]; tile[i * 2] = b & 15; tile[i * 2 + 1] = b >> 4 }
    out.push(tile)
  }
  return { tiles: out, width: u16(ncgr, char + 0x0a), height: u16(ncgr, char + 0x08) }
}

const OBJ_SIZES = [[[8, 8], [16, 16], [32, 32], [64, 64]], [[16, 8], [32, 8], [32, 16], [64, 32]], [[8, 16], [8, 32], [16, 32], [32, 64]]]

/** Draws cell `index` of an NCER over the NCGR's tiles into a w×h RGBA image centred on the cell's origin. */
export function cell(ncer: Uint8Array, ncgr: Uint8Array, colors: number[][], index: number, w: number, h: number) {
  const cebk = 0x10, count = u16(ncer, cebk + 8), extended = u16(ncer, cebk + 10) === 1
  const table = cebk + 8 + u32(ncer, cebk + 12), entry = table + index * (extended ? 16 : 8)
  const oams = u16(ncer, entry), oamAt = table + count * (extended ? 16 : 8) + u32(ncer, entry + 4)
  const shift = u32(ncer, cebk + 16) & 3 // tile index boundary: 32 bytes << shift
  const { tiles: tileList } = tiles(ncgr)
  const out = new Uint8Array(w * h * 4)
  // Later OAM entries sit underneath earlier ones.
  for (let k = oams - 1; k >= 0; k--) {
    const a0 = u16(ncer, oamAt + k * 6), a1 = u16(ncer, oamAt + k * 6 + 2), a2 = u16(ncer, oamAt + k * 6 + 4)
    let y = a0 & 0xff; if (y >= 128) y -= 256
    let x = a1 & 0x1ff; if (x >= 256) x -= 512
    const [ow, oh] = OBJ_SIZES[a0 >> 14][a1 >> 14], flipX = a1 >> 12 & 1, flipY = a1 >> 13 & 1
    const first = (a2 & 0x3ff) << shift
    for (let ty = 0; ty < oh / 8; ty++) for (let tx = 0; tx < ow / 8; tx++) {
      const tile = tileList[first + ty * (ow / 8) + tx]
      if (!tile) continue
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        const v = tile[py * 8 + px]
        if (!v) continue
        const lx = tx * 8 + px, ly = ty * 8 + py
        const dx = w / 2 + x + (flipX ? ow - 1 - lx : lx), dy = h / 2 + y + (flipY ? oh - 1 - ly : ly)
        if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue
        const o = (dy * w + dx) * 4, c = colors[v]
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255
      }
    }
  }
  return out
}
