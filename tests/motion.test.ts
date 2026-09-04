import { describe, it, expect } from 'vitest'
import { LiveRaceEngine, type LiveCar } from '../src/sim/live-race'
import { buildTrackWorld } from '../src/ui/three/environment'
import { getTrackVisualDefinition } from '../src/ui/three/track-visual'
import { CIRCUITS, buildDefaultTeams, DRIVERS } from '../src/core/content'
import { finalizePackage, defaultStrategy } from '../src/championship/engine'
import * as THREE from 'three'

/**
 * Live-race motion invariants.
 *
 * These tests assert the motion pipeline:
 *   LiveRaceEngine.frameStep(dt) → cars.totalTime advances →
 *   cars.lapStartTime stays put → lapFractionOf(c) yields a smooth
 *   0..1 value → track.positionAt(frac, v) yields a different world
 *   transform as the clock advances.
 */

function makeEngineWithDrivers(n = 4) {
  const circuit = CIRCUITS[0]
  const teams = buildDefaultTeams().slice(0, n)
  // Build real RacePackage objects via finalizePackage so the
  // engine's build() step finds every driver in DRIVERS and
  // instantiates a car.
  const packages = teams.flatMap((t) =>
    t.driverIds.slice(0, 2).map((driverId, ci) =>
      finalizePackage({
        championshipId: 'live',
        roundId: '0',
        teamId: t.id,
        driverId,
        teammateId: t.driverIds.find((d) => d !== driverId),
        carNumber: ci + 1,
        selectedParts: {} as never,
        carPerformance: t.carPerformance,
        componentWear: { frontWing: 0, rearWing: 0, floor: 0, chassis: 0, suspension: 0, cooling: 0 },
        setup: { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 },
        tyreAllocation: {},
        strategy: defaultStrategy(20),
        reliability: 85,
        staffModifiers: { strategySkill: 70, pitCrewSkill: 70, engineerSkill: 70 },
        weatherForecast: { condition: 'dry', rainProbability: 0, confidence: 0.8 },
        version: 1,
        lockedAt: Date.now(),
      }),
    ),
  )
  const driverMap = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))
  const engine = new LiveRaceEngine(structuredClone(circuit), packages, driverMap, 0x5eed)
  return { engine, circuit, packages }
}

function getCars(engine: LiveRaceEngine): LiveCar[] {
  return (engine.state as { cars?: LiveCar[] }).cars ?? []
}

describe('LiveRaceEngine.frameStep — clock advance', () => {
  it('advances simTime smoothly between leader-lap boundaries', () => {
    const { engine } = makeEngineWithDrivers()
    const debugCars = getCars(engine)
    if (debugCars.length === 0) {
      // Diagnostic dump
      const e = engine as unknown as { packages: Array<{ driverId: string }>; drivers: Record<string, unknown> }
      throw new Error('no cars; packages=' + e.packages.length + ' firstPkgId=' + (e.packages[0]?.driverId ?? '?') + ' driversHaveKey=' + (e.packages[0] ? typeof e.drivers[e.packages[0].driverId] : '?'))
    }
    engine.stepLap()
    const before = engine.state.simTime
    engine.frameAdvance(30)
    expect(engine.state.simTime).toBeGreaterThanOrEqual(before)
  })

  it('lapFractionOf returns a smooth 0..1 as simTime advances', () => {
    const { engine } = makeEngineWithDrivers()
    // Burn several stepLap calls so cars have real lapStartTime values.
    for (let i = 0; i < 3; i++) engine.stepLap()
    const cars = getCars(engine)
    expect(cars.length).toBeGreaterThan(0)
    const car = cars[0]
    const before = engine.lapFractionOf(car)
    // Advance the clock without crossing a lap boundary.
    engine.frameAdvance(5)
    const after = engine.lapFractionOf(car)
    expect(before).toBeGreaterThanOrEqual(0)
    expect(before).toBeLessThan(1)
    expect(after).toBeGreaterThanOrEqual(0)
    expect(after).toBeLessThan(1)
  })
})

describe('track world — positionAt(frac) tracks motion', () => {
  it('returns different world positions for different fractions', () => {
    const circuit = CIRCUITS[0]
    const def = getTrackVisualDefinition(circuit)
    const world = buildTrackWorld(circuit, def, 2)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    world.positionAt(0.10, a)
    world.positionAt(0.20, b)
    const dx = a.x - b.x
    const dy = a.y - b.y
    const dz = a.z - b.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    // 10 % of a ~5-km lap is several hundred metres.
    expect(dist).toBeGreaterThan(50)
    world.dispose()
  }, 30000) // Extended timeout for heavy world generation

  it('handles 0.99 → 0.01 wrap without producing NaN', () => {
    const circuit = CIRCUITS[0]
    const def = getTrackVisualDefinition(circuit)
    const world = buildTrackWorld(circuit, def, 2)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    world.positionAt(0.99, a)
    world.positionAt(0.01, b)
    expect(Number.isFinite(a.x)).toBe(true)
    expect(Number.isFinite(b.x)).toBe(true)
    expect(Number.isFinite(a.y)).toBe(true)
    expect(Number.isFinite(b.y)).toBe(true)
    expect(Number.isFinite(a.z)).toBe(true)
    expect(Number.isFinite(b.z)).toBe(true)
    world.dispose()
  })
})

describe('motion progress — derived from authoritative state', () => {
  it('stepLap advances car totalTime monotonically', () => {
    const { engine } = makeEngineWithDrivers()
    const cars = getCars(engine)
    expect(cars.length).toBeGreaterThan(0)
    const before = cars[0].totalTime
    engine.stepLap()
    const after = cars[0].totalTime
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('multiple stepLap calls drive the leader clock forward', () => {
    const { engine } = makeEngineWithDrivers()
    engine.stepLap()
    const t1 = engine.state.simTime
    engine.stepLap()
    const t2 = engine.state.simTime
    expect(t2).toBeGreaterThanOrEqual(t1)
  })
})

describe('paused state — clock does not advance', () => {
  it('frameAdvance(0) does not advance simTime', () => {
    const { engine } = makeEngineWithDrivers()
    engine.stepLap()
    const before = engine.state.simTime
    engine.frameAdvance(0)
    expect(engine.state.simTime).toBe(before)
  })
  it('frameAdvance on finished engine is a no-op', () => {
    const { engine } = makeEngineWithDrivers()
    // burn enough steps to finish
    for (let i = 0; i < 30; i++) engine.stepLap()
    const before = engine.state.simTime
    engine.frameAdvance(5)
    expect(engine.state.simTime).toBe(before)
  })
  it('frameAdvance(dt) advances simTime by exactly dt', () => {
    const { engine } = makeEngineWithDrivers()
    engine.stepLap()
    const before = engine.state.simTime
    engine.frameAdvance(2.5)
    expect(engine.state.simTime).toBeCloseTo(before + 2.5, 1)
  })
  it('frameAdvance at 1x is temporally correct', () => {
    const { engine } = makeEngineWithDrivers()
    engine.stepLap()
    const before = engine.state.simTime
    // 88 small steps = 88 sim-seconds, ~1 leader lap on a 88 s track
    for (let i = 0; i < 88; i++) engine.frameAdvance(1)
    const elapsed = engine.state.simTime - before
    expect(elapsed).toBeCloseTo(88, 0)
  })
})
