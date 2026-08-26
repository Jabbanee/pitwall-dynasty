import { describe, it, expect } from 'vitest'
import { createChampionship } from '../src/championship/create'
import { regulationsForYear, START_YEARS, teamOrderAvailability } from '../src/regulations/regulations'

describe('career + era configuration', () => {
  it('persists careerKind + eraYear on the championship config', () => {
    const champ = createChampionship(
      'career', 'Test Career', {},
      { teamCount: 4, seed: 1 },
    )
    // Default: not provided -> fallback to fictional / 2022
    expect(champ.config.careerKind).toBe('fictional')
    expect(champ.config.eraYear).toBe(2022)
  })

  it('respects explicit careerKind + eraYear overrides', () => {
    // The UI sets these in configOverrides — exercise the path that passes
    // them through to the championship.
    const champ = createChampionship(
      'career', 'Historical', { careerKind: 'real', eraYear: 2005 },
      { teamCount: 4, seed: 1 },
    )
    expect(champ.config.careerKind).toBe('real')
    expect(champ.config.eraYear).toBe(2005)
  })

  it('regulations engine returns the correct era for 2005 (Order Prohibition Era)', () => {
    const r = regulationsForYear(2005)
    expect(r.eraName).toContain('Order Prohibition')
    expect(r.positionSwapOrders).toBe('prohibited')
  })

  it('regulations engine returns the correct era for 2022 (Ground Effect Era)', () => {
    const r = regulationsForYear(2022)
    expect(r.eraName).toContain('Ground Effect')
    expect(r.costCap).toBe(true)
    expect(r.teamOrders).toBe('allowed')
  })

  it('team order availability surfaces a meaningful explanation', () => {
    const r2005 = regulationsForYear(2005)
    const a2005 = teamOrderAvailability(r2005)
    expect(a2005.directOrders).toBe('PROHIBITED')
    expect(a2005.explanation.toLowerCase()).toContain('prohibit')

    const r2022 = regulationsForYear(2022)
    const a2022 = teamOrderAvailability(r2022)
    expect(a2022.directOrders).toBe('AVAILABLE')
  })

  it('START_YEARS exposes one entry per era', () => {
    expect(START_YEARS.length).toBeGreaterThanOrEqual(5)
    for (const sy of START_YEARS) {
      expect(sy.year).toBeGreaterThan(1970)
      expect(sy.eraName.length).toBeGreaterThan(4)
    }
  })
})
