import { deflateSync } from 'node:zlib'
import { messages, narcFiles } from './romtext'
import { lz, palette, tiles } from './ndsgfx'

/**
 * Pokémon icons from the ROM: the party icon of every species (a/0/0/7), its two 32×32 frames stacked into one 32×64
 * PNG data URL. The icon archive holds three shared palettes; each species takes the one closest to the colours of
 * its own battle sprite (a/0/0/4: the front image and its palette), with the species' recorded body colour (personal
 * data byte 0x21) as a smaller second signal.
 */

const BODY = [[220, 60, 60], [70, 110, 230], [230, 210, 70], [80, 180, 80], [50, 50, 55], [150, 100, 60], [150, 80, 180], [150, 150, 150], [235, 235, 235], [240, 150, 190]]
const BODY_WEIGHT = .35

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.2, a[2] - b[2])

/** The palette, of three, whose colours best fit the species' battle sprite and body colour. */
export function choosePalette(icon: Uint8Array, sprite: Uint8Array | undefined, spritePalette: Uint8Array | undefined, body: number[] | undefined, iconPalettes: number[][][]) {
  if (!sprite || !spritePalette) return 0
  const pal = palette(spritePalette), use = new Array(16).fill(0)
  for (const tile of tiles(lz(sprite)).tiles) for (const v of tile) if (v) use[v]++
  const total = use.reduce((a, b) => a + b, 0) || 1
  const iconUse = new Array(16).fill(0)
  for (let i = 0x30; i < 0x30 + 512; i++) { iconUse[icon[i] & 15]++; iconUse[icon[i] >> 4]++ }
  iconUse[0] = 0
  const iconTotal = iconUse.reduce((a, b) => a + b, 0) || 1
  const spriteColours = pal.slice(1).filter((_, i) => use[i + 1] > 0)
  const scores = iconPalettes.map(ip => {
    const used = ip.filter((_, i) => i > 0 && iconUse[i] > 0)
    let score = 0
    for (let v = 1; v < 16; v++) if (iconUse[v]) score += iconUse[v] / iconTotal * Math.min(...spriteColours.map(q => dist(ip[v], q)))
    for (let v = 1; v < 16; v++) if (use[v]) score += use[v] / total * Math.min(...used.map(q => dist(pal[v], q)))
    if (body) {
      let r = 0, g = 0, b = 0, n = 0
      for (let v = 1; v < 16; v++) { const c = ip[v], lum = c[0] + c[1] + c[2]; if (!iconUse[v] || lum < 120 || lum > 680) continue; r += c[0] * iconUse[v]; g += c[1] * iconUse[v]; b += c[2] * iconUse[v]; n += iconUse[v] }
      if (n) score += dist([r / n, g / n, b / n], body) * BODY_WEIGHT
    }
    return score
  })
  return scores.indexOf(Math.min(...scores))
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
export function png(w: number, h: number, rgba: Uint8Array) {
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** Every species' icon, indexed by species number; empty for numbers without one. */
export function speciesIcons(iconArchive: Uint8Array, spriteArchive: Uint8Array | null, personalArchive: Uint8Array | null, count = 650): string[] {
  const icons = narcFiles(iconArchive), sprites = spriteArchive ? narcFiles(spriteArchive) : [], personal = personalArchive ? narcFiles(personalArchive) : []
  const iconPalettes = [0, 1, 2].map(p => palette(icons[0], p))
  const out: string[] = []
  for (let sp = 0; sp < count; sp++) {
    const icon = icons[8 + sp * 2]
    if (!sp || !icon?.length) { out.push(''); continue }
    const body = personal[sp] ? BODY[personal[sp][0x21] & 0x7f] : undefined
    const colours = iconPalettes[choosePalette(icon, sprites[sp * 20], sprites[sp * 20 + 18], body, iconPalettes)]
    const rgba = new Uint8Array(32 * 64 * 4)
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
      const o = 0x30 + ((y >> 3) * 4 + (x >> 3)) * 32 + (y & 7) * 4 + ((x & 7) >> 1), v = x & 1 ? icon[o] >> 4 : icon[o] & 15
      if (!v) continue
      const c = colours[v], p = (y * 32 + x) * 4
      rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255
    }
    out.push('data:image/png;base64,' + png(32, 64, rgba).toString('base64'))
  }
  return out
}

/**
 * Trainer portraits from the ROM, by trainer name: the trainer's class (a/0/9/1, byte 1 of its record, matched by the
 * line of the trainer-name text with that name) picks the class graphic in a/2/9/1, and the portrait is the 32×32
 * head at the right end of its 256×32 strip.
 */
export function trainerFaces(textArchive: Uint8Array, trainerArchive: Uint8Array, faceArchive: Uint8Array, wanted: string[]): Record<string, string> {
  const trainers = narcFiles(trainerArchive), faces = narcFiles(faceArchive).map(f => f[0] === 0x10 || f[0] === 0x11 ? lz(f) : f)
  const names = narcFiles(textArchive).map(messages).find(lines => lines.length === trainers.length && wanted.some(n => lines.includes(n)))
  const out: Record<string, string> = {}
  if (!names) return out
  for (const name of wanted) {
    const index = names.indexOf(name), record = trainers[index]
    if (index < 0 || !record || record.length < 2) continue
    const ncgr = faces[record[1] * 2], nclr = faces[record[1] * 2 + 1]
    if (!ncgr || !nclr || String.fromCharCode(...ncgr.subarray(0, 4)) !== 'RGCN') continue
    const { tiles: t, width } = tiles(ncgr), colours = palette(nclr), rgba = new Uint8Array(32 * 32 * 4)
    if (width < 4) continue
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const v = t[(y >> 3) * width + width - 4 + (x >> 3)]?.[(y & 7) * 8 + (x & 7)]
      if (!v) continue
      const c = colours[v], p = (y * 32 + x) * 4
      rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255
    }
    out[name] = 'data:image/png;base64,' + png(32, 32, rgba).toString('base64')
  }
  return out
}
