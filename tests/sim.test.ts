import { describe, it, expect } from 'vitest'
import { simulateRace, simulateQualifying, carPaceForCircuit } from '../src/sim/race-sim'
import { CIRCUITS, DRIVERS, buildDefaultTeams } from '../src/core/content'
import { defaultStrategy } from '../src/championship/engine'
import type { Championship, RacePackage } from '../src/core/types'
import { finalizePackage } from '../src/championship/engine'

function makePackages(count: number): RacePackage[] {
  const teams = buildDefaultTeams().slice(0, count)
  return teams.flatMap((t) =>
    t.driverIds.slice(0, 2).map((driverId, ci) =>
      finalizePackage({
        championshipId: 'test',
        roundId: '0',
        teamId: t.id,
        driverId,
        teammateId: t.driverIds.find((d) => d !== driverId),
        carNumber: ci + 1,
        selectedParts: {} as RacePackage['selectedParts'],
        carPerformance: t.carPerformance,
        componentWear: { frontWing: 0, rearWing: 0, floor: 0, chassis: 0, suspension: 0, cooling: 0 },
        setup: { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 },
        tyreAllocation: {},
        strategy: defaultStrategy(20),
        reliability: 80,
        staffModifiers: { strategySkill: 70, pitCrewSkill: 70, engineerSkill: 70 },
        weatherForecast: { condition: 'dry', rainProbability: 0, confidence: 0.8 },
        version: 1,
        lockedAt: Date.now(),
      }),
    ),
  )
}

const driverMap = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))
const circuit = CIRCUITS[0]

describe('race simulation determinism', () => {
  it('same seed produces byte-identical results', () => {
    const pkgs = makePackages(10)
    const a = simulateRace({ roundId: '0', circuit, packages: structuredClone(pkgs), drivers: driverMap, seed: 4242, weatherEnabled: true })
    const b = simulateRace({ roundId: '0', circuit, packages: structuredClone(pkgs), drivers: driverMap, seed: 4242, weatherEnabled: true })
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results))
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events))
  })

  it('different seeds usually produce different outcomes', () => {
    const pkgs = makePackages(10)
    let differences = 0
    for (let i = 0; i < 5; i++) {
      const a = simulateRace({ roundId: '0', circuit, packages: structuredClone(pkgs), drivers: driverMap, seed: 1000 + i, weatherEnabled: true })
      const b = simulateRace({ roundId: '0', circuit, packages: structuredClone(pkgs), drivers: driverMap, seed: 2000 + i, weatherEnabled: true })
      if (JSON.stringify(a.results) !== JSON.stringify(b.results)) differences++
    }
    expect(differences).toBeGreaterThanOrEqual(3)
  })

  it('produces exactly one winner and sane classification', () => {
    const result = simulateRace({ roundId: '0', circuit, packages: makePackages(10), drivers: driverMap, seed: 99, weatherEnabled: false })
    expect(result.results.length).toBe(20) // 10 teams × 2 drivers
    const winner = result.results[0]
    expect(winner.classified).toBe(true)
    expect(winner.finishPosition).toBe(1)
    // Positions are unique
    const positions = new Set(result.results.map((r) => r.finishPosition))
    expect(positions.size).toBe(result.results.length)
    // Total points distributed sanely
    const totalPoints = result.results.reduce((s, r) => s + r.points, 0)
    expect(totalPoints).toBeGreaterThan(0)
    expect(totalPoints).toBeLessThanOrEqual(25 + 18 + 15 + 12 + 10 + 8 + 6 + 4 + 2 + 1 + 1)
  })

  it('fields two cars per team — both score toward team totals', () => {
    const result = simulateRace({ roundId: '0', circuit, packages: makePackages(10), drivers: driverMap, seed: 123, weatherEnabled: false })
    const teamIds = new Set(result.results.map((r) => r.teamId))
    expect(teamIds.size).toBe(10)
    // Every team has exactly 2 entries
    for (const teamId of teamIds) {
      expect(result.results.filter((r) => r.teamId === teamId).length).toBe(2)
    }
  })

  it('timeline is time-sorted and non-empty', () => {
    const result = simulateRace({ roundId: '0', circuit, packages: makePackages(10), drivers: driverMap, seed: 7, weatherEnabled: true })
    expect(result.events.length).toBeGreaterThan(50)
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].t).toBeGreaterThanOrEqual(result.events[i - 1].t)
    }
  })

  it('DNF rate stays in a believable band over many races', () => {
    let dnfs = 0
    let starters = 0
    for (let i = 0; i < 30; i++) {
      const res = simulateRace({ roundId: `${i}`, circuit, packages: makePackages(10), drivers: driverMap, seed: 50000 + i * 13, weatherEnabled: true })
      starters += res.results.length
      dnfs += res.results.filter((r) => !r.classified).length
    }
    const rate = dnfs / starters
    expect(rate).toBeLessThan(0.28)
    expect(rate).toBeGreaterThan(0)
  })

  it('simulates a full 20-car race fast (well under real-time)', () => {
    const start = performance.now()
    simulateRace({ roundId: 'perf', circuit, packages: makePackages(10), drivers: driverMap, seed: 31415, weatherEnabled: true })
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('qualifying', () => {
  it('assigns unique grid positions sorted by lap time (one row per car)', () => {
    const q = simulateQualifying({
      roundId: '0',
      circuit,
      packages: makePackages(10).map((p) => ({
        championshipId: p.championshipId,
        roundId: p.roundId,
        teamId: p.teamId,
        driverId: p.driverId,
        carPerformance: p.carPerformance,
        setup: p.setup,
        qualiTyre: 'soft' as const,
        version: 1,
        hash: p.hash,
      })),
      drivers: driverMap,
      seed: 555,
      weatherForecast: { rainProbability: 0.1 },
    })
    expect(q.rows.length).toBe(20)
    const positions = q.rows.map((r) => r.gridPosition).sort((a, b) => a - b)
    expect(positions[0]).toBe(1)
    expect(positions[positions.length - 1]).toBe(20)
    for (let i = 1; i < q.rows.length; i++) {
      expect(q.rows[i].lapTime).toBeGreaterThanOrEqual(q.rows[i - 1].lapTime)
    }
  })
})

describe('car pace model', () => {
  it('weights circuit characteristics — a high-speed car wins at a speed track', () => {
    const speedTrack = CIRCUITS.find((c) => c.characteristics.straightLine > 70)!
    const techTrack = CIRCUITS.find((c) => c.characteristics.lowSpeed > 60)!
    const aeroCar = { ...buildDefaultTeams()[0].carPerformance, lowSpeedAero: 90, mediumSpeedAero: 90, highSpeedAero: 60, straightLineSpeed: 60 }
    const powerCar = { ...buildDefaultTeams()[0].carPerformance, lowSpeedAero: 60, mediumSpeedAero: 60, highSpeedAero: 90, straightLineSpeed: 92, drag: 20 }
    expect(carPaceForCircuit(powerCar, speedTrack)).toBeGreaterThan(carPaceForCircuit(aeroCar, speedTrack))
    void techTrack
  })
})

// Guard: Championship import used only as a type reference in this file
export type _ChampGuard = Championship
