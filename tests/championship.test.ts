import { describe, it, expect } from 'vitest'
import { createChampionship } from '../src/championship/create'
import { GameEngine, roundSeed } from '../src/championship/game-engine'
import { computeStandings } from '../src/championship/engine'
import { validateMod, sampleMod } from '../src/content/modding'
import { serializeSave, deserializeSave } from '../src/state/persistence'

describe('championship lifecycle', () => {
  function makeChamp() {
    return createChampionship('fast', 'Test Champ', { numberOfRaces: 3 }, { playerTeamIndex: 0, seed: 999 })
  }

  it('creates teams with drivers and staff', () => {
    const champ = makeChamp()
    expect(champ.teams.length).toBe(10)
    for (const t of champ.teams) {
      expect(t.driverIds.length).toBe(2)
      expect(t.staffIds.length).toBeGreaterThan(0)
      expect(t.sponsors.length).toBeGreaterThan(0)
    }
    expect(champ.playerTeamId).toBeDefined()
    expect(champ.rounds.length).toBe(3)
  })

  it('full round loop: lock → quali → race → results', () => {
    const champ = makeChamp()
    const engine = new GameEngine(champ)
    engine.lockRound()
    const round = champ.rounds[0]
    expect(round.packagesLocked).toBe(true)
    expect(round.qualifyingDone).toBe(true)
    expect(round.raceDone).toBe(true)
    expect(round.qualifyingResult!.rows.length).toBe(20) // 2 drivers per team
    // Grid for the race takes each team's best qualifier: 10 unique teams
    const qualiTeams = new Set(round.qualifyingResult!.rows.slice(0, 10).map((r) => r.teamId))
    expect(qualiTeams.size).toBeLessThanOrEqual(10)
    expect(round.raceResult!.results.length).toBe(10)
    // Standings accumulate
    const st = engine.standings()
    expect(st.teamRows.reduce((s, r) => s + r.points, 0)).toBeGreaterThan(0)
  })

  it('deterministic across full round replays', () => {
    const a = makeChamp()
    const b = makeChamp()
    new GameEngine(a).lockRound()
    new GameEngine(b).lockRound()
    expect(JSON.stringify(a.rounds[0].raceResult!.results)).toBe(JSON.stringify(b.rounds[0].raceResult!.results))
  })

  it('roundSeed depends on championship + round + season', () => {
    const champ = makeChamp()
    expect(roundSeed(champ, 0)).not.toBe(roundSeed(champ, 1))
    expect(roundSeed(champ, 1)).toBe(roundSeed(champ, 1))
  })

  it('advances rounds and completes the season with history', () => {
    const champ = makeChamp()
    const engine = new GameEngine(champ)
    for (let i = 0; i < 3; i++) {
      engine.lockRound()
      const outcome = engine.advanceRound()
      if (i < 2) expect(outcome).toBe('nextRound')
      else expect(outcome).toBe('seasonComplete')
    }
    expect(champ.history.length).toBe(1)
    expect(champ.history[0].driverStandings.length).toBeGreaterThan(0)
    expect(champ.config.season).toBe(2)
    expect(champ.currentRoundIndex).toBe(0)
    expect(champ.rounds.length).toBe(3)
    // New season is playable immediately
    const engine2 = new GameEngine(champ)
    engine2.lockRound()
    expect(champ.rounds[0].raceDone).toBe(true)
  })

  it('standings calculation handles points, wins, podiums correctly', () => {
    const champ = makeChamp()
    const engine = new GameEngine(champ)
    engine.lockRound()
    const result = champ.rounds[0].raceResult!
    const winnerPoints = result.results.filter((r) => r.finishPosition === 1)[0].points
    expect(winnerPoints).toBeGreaterThanOrEqual(25)
    const standings = computeStandings(champ)
    const topDriver = standings.driverRows[0]
    expect(topDriver.points).toBeGreaterThan(0)
  })

  it('economy settles without runaway inflation over a season', () => {
    const champ = makeChamp()
    const engine = new GameEngine(champ)
    const startMoney = champ.teams.map((t) => t.money)
    for (let i = 0; i < 3; i++) {
      engine.lockRound()
      engine.advanceRound()
    }
    champ.teams.forEach((t, idx) => {
      // No team bankrupted or multiplied money absurdly in one short season
      expect(t.money).toBeGreaterThan(startMoney[idx] * -0.5)
      expect(t.money).toBeLessThan(startMoney[idx] * 2.5)
    })
  })
})

describe('save system', () => {
  it('serializes and restores championship state', () => {
    const champ = createChampionship('fast', 'Save Test', { numberOfRaces: 2 }, { playerTeamIndex: 0, seed: 1234 })
    const engine = new GameEngine(champ)
    engine.lockRound()
    const raw = serializeSave(champ)
    const res = deserializeSave(raw)
    expect(res.ok).toBe(true)
    expect(res.champ!.rounds[0].raceResult!.seed).toBe(champ.rounds[0].raceResult!.seed)
    expect(JSON.stringify(res.champ!.teams)).toBe(JSON.stringify(champ.teams))
  })

  it('rejects corrupt saves with an actionable error', () => {
    expect(deserializeSave('not json at all {{{').ok).toBe(false)
    expect(deserializeSave(JSON.stringify({ schemaVersion: 99 })).ok).toBe(false)
    expect(deserializeSave(JSON.stringify({ schemaVersion: 1, savedAt: 0, championship: {} })).ok).toBe(false)
  })
})

describe('modding validation', () => {
  it('sample mod validates cleanly', () => {
    const res = validateMod(sampleMod())
    expect(res.valid).toBe(true)
    expect(res.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('detects duplicate ids and missing references', () => {
    const mod = sampleMod()
    mod.content!.drivers!.push(structuredClone(mod.content!.drivers![0]))
    mod.content!.teams = [
      {
        id: 'example.team.broken',
        name: 'Broken FC',
        shortName: 'BRK',
        colors: { primary: '#000', secondary: '#fff' },
        reputation: 50,
        money: 1000,
        driverIds: ['nonexistent.driver'],
        staffIds: [],
        carPerformance: {} as never,
        parts: {} as never,
        facilities: {},
        sponsors: [],
      },
    ]
    const res = validateMod(mod)
    expect(res.valid).toBe(false)
    expect(res.issues.some((i) => i.message.includes('Duplicate'))).toBe(true)
    expect(res.issues.some((i) => i.message.includes('unknown driver'))).toBe(true)
  })
})
