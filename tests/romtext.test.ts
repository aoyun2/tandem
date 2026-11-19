import { describe, expect, it } from 'vitest'
import { messages } from '../src/main/romtext'

const rotl = (k: number) => ((k << 3) | (k >> 13)) & 0xffff

/** A Gen 5 message file holding the given lines, each already in game characters, encrypted as the games do. */
function messageFile(lines: number[][]) {
  const section = 0x10, table = section + 4, data = table + lines.length * 8
  const size = data + lines.reduce((n, l) => n + l.length * 2, 0)
  const file = new Uint8Array(size), view = new DataView(file.buffer)
  view.setUint16(0, 1, true); view.setUint16(2, lines.length, true); view.setUint32(12, section, true)
  let offset = data - section, key = 0x7c89
  lines.forEach((line, i) => {
    view.setUint32(table + i * 8, offset, true); view.setUint16(table + i * 8 + 4, line.length, true)
    let k = key
    line.forEach((ch, c) => { view.setUint16(section + offset + c * 2, ch ^ k, true); k = rotl(k) })
    offset += line.length * 2; key = (key + 0x2983) & 0xffff
  })
  return file
}

const plain = (text: string) => [...text].map(c => c.charCodeAt(0)).concat(0xffff)

/** The compressed form: 0xF100, then 9-bit characters packed into words, least significant bits first, ending in 0x1FF. */
function packed(text: string) {
  const codes = [...text].map(c => c.charCodeAt(0)).concat(0x1ff), words = [0xf100]
  let acc = 0, bits = 0
  for (const code of codes) { acc |= code << bits; bits += 9; while (bits >= 16) { words.push(acc & 0xffff); acc >>>= 16; bits -= 16 } }
  if (bits) words.push((acc | (0xffff << bits)) & 0xffff)
  return words.concat(0xffff)
}

describe('messages', () => {
  it('decrypts plain lines', () => {
    expect(messages(messageFile([plain('Cheren'), plain('Roxie')]))).toEqual(['Cheren', 'Roxie'])
  })

  it('turns line breaks into spaces and drops variables', () => {
    expect(messages(messageFile([[0x48, 0xfffe, 0xf000, 0x0100, 0x0001, 0x0000, 0x69, 0xffff]]))).toEqual(['H i'])
  })

  it('unpacks compressed lines', () => {
    expect(messages(messageFile([plain('Leader'), packed('Brock'), packed('Lt. Surge')]))).toEqual(['Leader', 'Brock', 'Lt. Surge'])
  })
})
