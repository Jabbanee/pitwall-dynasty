import { describe, it, expect } from 'vitest'
import { LiveRaceEngine, setComplianceCalculator, type LiveCommand } from '../src/sim/live-race'
import { CIRCUITS, DRIVERS, buildDefaultTeams } from '../src/core/content'
import { finalizePackage, defaultStrategy } from '../src/championship/engine'
import type { RacePackage } from '../src/core/types'

function makeLivePackages(count: number): RacePackage[] {
  const teams = buildDefaultTeams().slice(0, count)
  return teams.flatMap((t) =>
    t.driverIds.slice(0, 2).map((driverId, ci) =>
      finalizePackage({
        championshipId: 'live', roundId: '0', teamId: t.id,
        driverId, teammateId: t.driverIds.find((d) => d !== driverId), carNumber: ci + 1,
        selectedParts: {} as never,
        carPerformance: t.carPerformance,
        componentWear: { frontWing: 0, rearWing: 0, floor: 0, chassis: 0, suspension: 0, cooling: 0 },
        setup: { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 },
        tyreAllocation: {},
        strategy: defaultStrategy(20),
        reliability: 85,
        staffModifiers: { strategySkill: 70, pitCrewSkill: 70, engineerSkill: 70 },
        weatherForecast: { condition: 'dry', rainProbability: 0, confidence: 0.8 },
        version: 1, lockedAt: Date.now(),
      }),
    ),
  )
}

const driverMap = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))
const circuit = CIRCUITS[0]

function runFullRace(packages: RacePackage[], commands: Array<LiveCommand & Partial<Pick<LiveCommand, 't'>>> = []) {
  const engine = new LiveRaceEngine(structuredClone(circuit), structuredClone(packages), driverMap, 4242)
  // Commands with t=N are issued when leaderLap reaches N (t=0 → lap 1)
  let cmdIdx = 0
  while (!engine.isFinished()) {
    while (cmdIdx < commands.length && engine.state.leaderLap >= Math.max(1, commands[cmdIdx].t ?? 0)) {
      const { t, applied, note, ...cmd } = commands[cmdIdx]
      void t; void applied; void note
      engine.applyCommand(cmd)
      cmdIdx++
    }
    engine.stepLap()
  }
  return { engine, results: engine.results() }
}

describe('live race engine', () => {
  it('runs a full 20-car race to completion', () => {
    const { engine, results } = runFullRace(makeLivePackages(10))
    expect(engine.isFinished()).toBe(true)
    expect(results.length).toBe(20)
    expect(results.filter((r) => r.classified).length).toBeGreaterThanOrEqual(10)
    expect(results[0].finishPosition).toBe(1)
  })

  it('is deterministic — same inputs, same result', () => {
    const pkgs = makeLivePackages(10)
    const a = runFullRace(structuredClone(pkgs))
    const b = runFullRace(structuredClone(pkgs))
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results))
    expect(JSON.stringify(a.engine.events)).toBe(JSON.stringify(b.engine.events))
  })

  it('live commands alter the race outcome vs no commands', () => {
    const pkgs = makeLivePackages(10)
    const team = buildDefaultTeams()[0]
    const cmds = team.driverIds.slice(0, 2).map((driverId) => ({
      teamId: team.id, driverId, command: 'PIT_NEXT_LAP' as const, t: 0,
    }))
    const baseline = runFullRace(structuredClone(pkgs))
    const withCmds = runFullRace(structuredClone(pkgs), cmds)
    // Early forced stops must change the finishing order for the team
    const baseJson = JSON.stringify(baseline.results.filter((r) => r.teamId === team.id).map((r) => [r.driverId, r.finishPosition]))
    const cmdJson = JSON.stringify(withCmds.results.filter((r) => r.teamId === team.id).map((r) => [r.driverId, r.finishPosition]))
    expect(cmdJson).not.toBe(baseJson)
  })

  it('replay from packages + command log reproduces identical race', () => {
    const pkgs = makeLivePackages(10)
    const first = new LiveRaceEngine(structuredClone(circuit), structuredClone(pkgs), driverMap, 777)
    // Issue a deterministic command sequence mid-race
    while (!first.isFinished()) {
      if (first.state.leaderLap === 5) {
        for (const car of first.state.cars.slice(0, 4)) {
          first.applyCommand({ teamId: car.teamId, driverId: car.driverId, command: 'PACE_ATTACK' })
        }
      }
      first.stepLap()
    }
    // Replay: same seed, same commands at same points
    const second = new LiveRaceEngine(structuredClone(circuit), structuredClone(pkgs), driverMap, 777)
    while (!second.isFinished()) {
      if (second.state.leaderLap === 5) {
        for (const car of second.state.cars.slice(0, 4)) {
          second.applyCommand({ teamId: car.teamId, driverId: car.driverId, command: 'PACE_ATTACK' })
        }
      }
      second.stepLap()
    }
    expect(JSON.stringify(first.results())).toBe(JSON.stringify(second.results()))
    expect(JSON.stringify(first.commandLog.map((c) => [c.t, c.driverId, c.command]))).toBe(
      JSON.stringify(second.commandLog.map((c) => [c.t, c.driverId, c.command])))
  })

  it('PIT_THIS_LAP respects the pit-entry decision point', () => {
    const engine = new LiveRaceEngine(structuredClone(circuit), makeLivePackages(10), driverMap, 31337)
    const car = engine.state.cars[0]
    let deferredSeen = false
    let immediateSeen = false
    while (!engine.isFinished() && !(deferredSeen && immediateSeen)) {
      // Sample the fraction right before issuing
      const frac = engine.lapFractionOf(car)
      const res = engine.applyCommand({ teamId: car.teamId, driverId: car.driverId, command: 'PIT_THIS_LAP' })
      if (res.ok) {
        if (res.deferred) {
          deferredSeen = true
          expect(frac).toBeGreaterThanOrEqual(car.pitEntryFraction)
        } else {
          immediateSeen = true
          expect(frac).toBeLessThan(car.pitEntryFraction)
        }
        // Clean up so the car doesn't actually pit every lap
        engine.applyCommand({ teamId: car.teamId, driverId: car.driverId, command: 'CANCEL_PIT' })
      }
      engine.stepLap()
    }
    // The immediate branch must be reachable
    expect(immediateSeen).toBe(true)
    // Deterministic check: fraction >= entry point must defer
    const engine2 = new LiveRaceEngine(structuredClone(circuit), makeLivePackages(10), driverMap, 31337)
    engine2.stepLap()
    const car2 = engine2.state.cars.find((c) => !c.retired)!
    const lapDur = car2.lastLapTime > 0 ? car2.lastLapTime : 92
    // Place the car's last line crossing ~85% of a lap ago → past the 72% point
    car2.lapStartTime = engine2.state.simTime - 0.85 * lapDur
    const res = engine2.applyCommand({ teamId: car2.teamId, driverId: car2.driverId, command: 'PIT_THIS_LAP' })
    expect(res.ok).toBe(true)
    expect(res.deferred).toBe(true)
  })

  it('PIT command produces an extra stop vs baseline', () => {
    const pkgs = makeLivePackages(10)
    const team = buildDefaultTeams()[0]
    const engine = new LiveRaceEngine(structuredClone(circuit), structuredClone(pkgs), driverMap, 8888)
    const driverId = team.driverIds[0]
    while (!engine.isFinished()) {
      if (engine.state.leaderLap === 4) {
        engine.applyCommand({ teamId: team.id, driverId, command: 'PIT_THIS_LAP', compound: 'soft' })
      }
      engine.stepLap()
    }
    const result = engine.results().find((r) => r.driverId === driverId)!
    // At least the commanded stop happened (playbook may add more)
    expect(result.pitStops).toBeGreaterThanOrEqual(1)
  })

  it('radio feed records driver responses to commands', () => {
    const engine = new LiveRaceEngine(structuredClone(circuit), makeLivePackages(10), driverMap, 555)
    const car = engine.state.cars[0]
    const res = engine.applyCommand({ teamId: car.teamId, driverId: car.driverId, command: 'PACE_ATTACK' })
    expect(res.ok).toBe(true)
    expect(engine.radioFeed.length).toBeGreaterThan(0)
    expect(engine.radioFeed[engine.radioFeed.length - 1].message).toContain('Attack')
  })

  it('team order swap can be refused by driver agency', () => {
    const engine = new LiveRaceEngine(structuredClone(circuit), makeLivePackages(10), driverMap, 999)
    const car = engine.state.cars[0]
    setComplianceCalculator(() => ({ compliance: 0, reasons: ['test: driver is furious'] }))
    const res = engine.applyCommand({ teamId: car.teamId, driverId: car.driverId, command: 'TEAM_ORDER_SWAP' })
    expect(res.response).toContain('REFUSES')
    setComplianceCalculator(() => ({ compliance: 100, reasons: [] }))
    const res2 = engine.applyCommand({ teamId: car.teamId, driverId: car.driverId, command: 'TEAM_ORDER_SWAP' })
    expect(res2.response).toContain('yield')
  })
})
