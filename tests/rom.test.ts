import { describe, expect, it } from 'vitest'
import { crc16, inspectHeader } from '../src/shared/rom'

function fixture(code = 'IREO') {
  const bytes = new Uint8Array(0x160)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode(code), 0x0c)
  view.setUint32(0x80, 4096, true)
  for (const offset of [0x20, 0x30]) {
    view.setUint32(offset, 0x200, true)
    view.setUint32(offset + 12, 128, true)
  }
  view.setUint16(0x15e, crc16(bytes.subarray(0, 0x15e)), true)
  return bytes
}

describe('DS base ROM inspection', () => {
  it('recognizes both paired versions independently', () => {
    expect(inspectHeader(fixture(), 4096).game).toBe('Black 2')
    expect(inspectHeader(fixture('IRDO'), 4096).game).toBe('White 2')
  })
  it('uses the actual slice offset when reading a header', () => {
    const wrapped = new Uint8Array(0x200)
    wrapped.set(fixture('IRED'), 0x40)
    expect(inspectHeader(wrapped.subarray(0x40), 4096).language).toBe('German')
  })
  it('rejects other games', () => expect(() => inspectHeader(fixture('IRBO'), 4096)).toThrow('not supported'))
  it('rejects truncated files even with a correct header checksum', () => expect(() => inspectHeader(fixture(), 1024)).toThrow('truncated'))
  it('rejects corrupt headers', () => {
    const bytes = fixture(); bytes[0] = 42
    expect(() => inspectHeader(bytes, 4096)).toThrow('checksum')
  })
  it('rejects executable ranges beyond the file', () => {
    const bytes = fixture(); const view = new DataView(bytes.buffer)
    view.setUint32(0x2c, 8192, true)
    view.setUint16(0x15e, crc16(bytes.subarray(0, 0x15e)), true)
    expect(() => inspectHeader(bytes, 4096)).toThrow('executable')
  })
  it('rejects empty and oversized files', () => {
    expect(() => inspectHeader(new Uint8Array(), 0)).toThrow('too small')
    expect(() => inspectHeader(fixture(), 2 * 1024 ** 3)).toThrow('1 GB')
  })
})
