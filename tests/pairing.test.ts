import { describe, expect, it } from 'vitest'
import { canPair, counterpart } from '../src/shared/pairing'

describe('game pairing', () => {
  it('links Black 2 and White 2 in any combination and region', () => {
    expect(canPair('IREO', 'IRDO')).toBe(true)
    expect(canPair('IRDO', 'IREO')).toBe(true)
    expect(canPair('IREO', 'IRED')).toBe(true)
  })
  it('refuses games outside a shared generation pair', () => {
    expect(canPair('IREO', 'IRBO')).toBe(false)
    expect(canPair('IRBO', 'IRAO')).toBe(false)
    expect(canPair('', 'IREO')).toBe(false)
  })
  it('names the other version', () => {
    expect(counterpart('IREO')).toBe('White 2')
    expect(counterpart('IRDO')).toBe('Black 2')
    expect(counterpart('IRBO')).toBe(null)
  })
})
