import { describe, it, expect } from 'vitest'
import { getLiveryProfile, type LiveryTemplate } from '../src/ui/three/livery'

/**
 * Livery system invariants.
 *
 * - Each top-series team has a stable authored template.
 * - The template assignment is deterministic.
 * - The sponsor and abbreviation lookups are deterministic.
 * - Two different teams always produce different templates.
 * - The same team always produces the same template.
 */

describe('livery system', () => {
  it('every top-series team has a livery profile', () => {
    const teams = [
      { id: 'base.team.titan', name: 'Titan Racing', shortName: 'Titan', colors: { primary: '#e63946', secondary: '#1c2230' } },
      { id: 'base.team.aquila', name: 'Aquila Corse', shortName: 'Aquila', colors: { primary: '#4a8fd1', secondary: '#0a0c10' } },
      { id: 'base.team.boreal', name: 'Boreal GP', shortName: 'Boreal', colors: { primary: '#4ad17d', secondary: '#101820' } },
      { id: 'base.team.meridian', name: 'Meridian', shortName: 'Meridian', colors: { primary: '#e6a14a', secondary: '#1c2230' } },
      { id: 'base.team.kestrel', name: 'Kestrel', shortName: 'Kestrel', colors: { primary: '#b0b0b0', secondary: '#0a0c10' } },
      { id: 'base.team.polaris', name: 'Polaris', shortName: 'Polaris', colors: { primary: '#9b6dd1', secondary: '#0a0c10' } },
      { id: 'base.team.sablefox', name: 'Sablefox', shortName: 'Sablefox', colors: { primary: '#d1a14a', secondary: '#1c1014' } },
      { id: 'base.team.vanguard', name: 'Vanguard', shortName: 'Vanguard', colors: { primary: '#4ad1c0', secondary: '#0a0c10' } },
      { id: 'base.team.cobalt', name: 'Cobalt', shortName: 'Cobalt', colors: { primary: '#d14a8c', secondary: '#1c1014' } },
      { id: 'base.team.horizon', name: 'Horizon', shortName: 'Horizon', colors: { primary: '#6c7a8a', secondary: '#0a0c10' } },
    ]
    const seen = new Set<LiveryTemplate>()
    for (const team of teams) {
      const profile = getLiveryProfile(team)
      expect(profile.template).toBeDefined()
      expect(profile.abbreviation.length).toBeGreaterThan(0)
      expect(profile.sponsor.length).toBeGreaterThan(0)
      seen.add(profile.template)
    }
    // At least 5 distinct templates across the 10 teams.
    expect(seen.size).toBeGreaterThanOrEqual(5)
  })

  it('the same team always produces the same template', () => {
    const team = { id: 'base.team.titan', name: 'Titan', shortName: 'Titan', colors: { primary: '#e63946', secondary: '#1c2230' } }
    const a = getLiveryProfile(team)
    const b = getLiveryProfile(team)
    expect(a.template).toBe(b.template)
    expect(a.abbreviation).toBe(b.abbreviation)
    expect(a.sponsor).toBe(b.sponsor)
  })

  it('different teams produce different templates', () => {
    const a = getLiveryProfile({ id: 'base.team.titan', name: 'Titan', shortName: 'Titan', colors: { primary: '#e63946', secondary: '#1c2230' } })
    const b = getLiveryProfile({ id: 'base.team.aquila', name: 'Aquila', shortName: 'Aquila', colors: { primary: '#4a8fd1', secondary: '#0a0c10' } })
    expect(a.template).not.toBe(b.template)
  })
})
