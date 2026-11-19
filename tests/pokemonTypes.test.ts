import { describe, expect, it } from 'vitest'
import { bestAttackers, effectiveness, TYPES } from '../src/shared/pokemonTypes'

const t = (name: string) => TYPES.indexOf(name)

describe('effectiveness', () => {
  it('multiplies across both types', () => {
    expect(effectiveness(t('Fire'), [t('Bug'), t('Grass')])).toBe(4)
    expect(effectiveness(t('Fire'), [t('Bug'), t('Rock')])).toBe(1)
    expect(effectiveness(t('Ground'), [t('Water'), t('Flying')])).toBe(0)
  })

  it('follows the Generation V chart', () => {
    expect(effectiveness(t('Ghost'), [t('Steel')])).toBe(.5)
    expect(effectiveness(t('Dark'), [t('Steel')])).toBe(.5)
    expect(effectiveness(t('Poison'), [t('Steel')])).toBe(0)
    expect(effectiveness(t('Psychic'), [t('Dark')])).toBe(0)
  })

  it('counts a single type once', () => {
    expect(effectiveness(t('Water'), [t('Fire'), t('Fire')])).toBe(2)
  })
})

describe('bestAttackers', () => {
  it('ranks types by how much of the team they hit', () => {
    // Burgh: Swadloon (Bug/Grass), Dwebble (Bug/Rock), Leavanny (Bug/Grass)
    const best = bestAttackers([[t('Bug'), t('Grass')], [t('Bug'), t('Rock')], [t('Bug'), t('Grass')]])
    expect(best[0]).toMatchObject({ type: t('Rock'), hits: 3 })
    expect(best.map(a => TYPES[a.type])).toContain('Fire')
  })
})
