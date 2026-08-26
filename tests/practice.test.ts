import { describe, it, expect } from 'vitest'
import { runPractice, defaultManualPlan, defaultQuickSimPlan } from '../src/championship/practice'
import { createChampionship } from '../src/championship/create'

describe('practice system', () => {
  it('returns a numeric bonus clamped to a sensible range', () => {
    const champ = createChampionship('career', 'Test', {}, { teamCount: 4, seed: 12345 })
    const team = champ.teams[0]
    const round = champ.rounds[0]
    const r = runPractice(champ, team, round, defaultManualPlan(team.id))
    expect(r.bonus).toBeGreaterThanOrEqual(-0.05)
    expect(r.bonus).toBeLessThanOrEqual(0.12)
    expect(round.practiceBonus?.[team.id]).toBe(r.bonus)
  })

  it('quick sim is always a small safe bonus', () => {
    const champ = createChampionship('career', 'Test', {}, { teamCount: 4, seed: 99 })
    const team = champ.teams[1]
    const round = champ.rounds[0]
    const r = runPractice(champ, team, round, defaultQuickSimPlan(team.id))
    expect(r.bonus).toBeGreaterThanOrEqual(-0.05)
    expect(r.bonus).toBeLessThanOrEqual(0.05)
  })

  it('is deterministic given the same seed', () => {
    const champ1 = createChampionship('career', 'Test', {}, { teamCount: 4, seed: 42 })
    const champ2 = createChampionship('career', 'Test', {}, { teamCount: 4, seed: 42 })
    const plan = defaultManualPlan(champ1.teams[0].id)
    const r1 = runPractice(champ1, champ1.teams[0], champ1.rounds[0], plan)
    const r2 = runPractice(champ2, champ2.teams[0], champ2.rounds[0], defaultManualPlan(champ2.teams[0].id))
    expect(r1.bonus).toBeCloseTo(r2.bonus, 5)
  })

  it('high effort beats low effort on average across many seeds', () => {
    const seedCount = 12
    let highSum = 0
    let lowSum = 0
    for (let s = 0; s < seedCount; s++) {
      const champ = createChampionship('career', 'Test', {}, { teamCount: 4, seed: s * 1000 + 7 })
      const team = champ.teams[2]
      const round = champ.rounds[0]
      highSum += runPractice(champ, team, round, { teamId: team.id, mode: 'manual', focuses: ['qualiSim', 'longRun'], effort: 'high' }).bonus
      lowSum += runPractice(champ, team, round, { teamId: team.id, mode: 'manual', focuses: ['qualiSim', 'longRun'], effort: 'low' }).bonus
    }
    expect(highSum).toBeGreaterThan(lowSum)
  })
})
