import { createRng, fnv1a, type Rng } from '../core/rng'
import { TYRES, tyreWetnessDelta } from '../core/tyres'
import { SIMULATION_VERSION } from '../core/content'
import type {
  CarPerformance,
  Circuit,
  Driver,
  QualifyingPackage,
  QualifyingResult,
  RaceEvent,
  RaceEventType,
  RacePackage,
  RaceResult,
  SetupChoice,
  StrategyPlaybook,
  TyreCompoundId,
} from '../core/types'

// ---------------------------------------------------------------------------
// Headless deterministic race simulation.
//
// Model: discrete lap-by-lap. Each car accumulates totalTime; ordering is by
// lapsDone desc, then totalTime asc. Pit stops add circuit pitLoss + variance.
// ALL randomness flows through seeded Rng instances — identical inputs give
// identical races.
// ---------------------------------------------------------------------------

const BASE_LAP_SECONDS = 88

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Weight car performance attributes against circuit characteristics → pace score ~0..100 */
export function carPaceForCircuit(car: CarPerformance, circuit: Circuit): number {
  const c = circuit.characteristics
  const w = (x: number) => x / 100
  const totalW = w(c.lowSpeed) + w(c.mediumSpeed) + w(c.highSpeed)
  const aeroAvg =
    (car.lowSpeedAero * w(c.lowSpeed) +
      car.mediumSpeedAero * w(c.mediumSpeed) +
      car.highSpeedAero * w(c.highSpeed)) /
    Math.max(totalW, 0.01)
  const straight = (car.straightLineSpeed - car.drag * 0.6) * w(c.straightLine)
  const mech = car.braking * w(c.brakingStress) + car.traction * (1 - w(c.brakingStress))
  return clamp(
    aeroAvg * 0.55 + straight * 0.2 + mech * 0.15 + car.energyEfficiency * 0.05 + car.reliability * 0.05,
    0,
    100,
  )
}

/** Setup sliders shift effective performance. downforceBias: -3 (speed) .. +3 (grip). */
export function applySetup(perf: CarPerformance, setup: SetupChoice): CarPerformance {
  const p = { ...perf }
  // Downforce vs top speed tradeoff
  const df = setup.downforceBias
  p.lowSpeedAero += df * 1.1
  p.mediumSpeedAero += df * 1.4
  p.highSpeedAero += df * 1.2
  p.drag += df * 1.5
  p.straightLineSpeed -= df * 1.3
  // Mechanical grip bias toward traction/braking vs straights
  const mg = setup.mechanicalGripBias
  p.traction += mg * 1.4
  p.braking += mg * 1.0
  p.straightLineSpeed -= mg * 0.6
  return p
}

interface SimCar {
  teamId: string
  driverId: string
  gridPos: number
  position: number
  lapsDone: number
  totalTime: number
  lastLapTime: number
  bestLapTime: number
  tyre: TyreCompoundId
  tyreAge: number
  tyreWear: number
  fuelKg: number
  aggression: number
  pitStops: number
  retired: boolean
  dnfReason?: string
  damage: number
  componentCondition: number
  finished: boolean
  strategy: StrategyPlaybook
  reliability: number
  paceScore: number
  stintPlansUsed: Set<number>
  lastPitLap: number
}

export interface SimulateRaceInput {
  roundId: string
  circuit: Circuit
  /** MUST be sorted into grid order by the caller (from qualifying result). */
  packages: RacePackage[]
  drivers: Record<string, Driver>
  seed: number
  weatherEnabled: boolean
  championshipPointsTable?: number[]
}

const DEFAULT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

function paceFactorFromDriver(d: Driver, wetness: number): number {
  const formAdj = d.dynamic.form * 3
  const moraleAdj = (d.dynamic.morale - 60) * 0.06
  const confAdj = (d.dynamic.confidence - 60) * 0.04
  const wet = wetness > 0.15 ? (d.visible.wetSkill - 70) * 0.08 : 0
  return d.visible.pace + formAdj + moraleAdj + confAdj + wet
}

function computeBaseline(
  pkg: RacePackage,
  driver: Driver,
  circuit: Circuit,
): number {
  const perf = applySetup(pkg.carPerformance, pkg.setup)
  const carPace = carPaceForCircuit(perf, circuit)
  const driverFactor = paceFactorFromDriver(driver, 0)
  return clamp(carPace * 0.62 + driverFactor * 0.38, 20, 110)
}

function pickFreshCompound(currentWetness: number, rng: Rng): TyreCompoundId {
  if (currentWetness > 0.7) return 'wet'
  if (currentWetness > 0.25) return 'inter'
  return rng.chance(0.5) ? 'medium' : 'hard'
}

export function simulateQualifying(input: {
  roundId: string
  circuit: Circuit
  packages: QualifyingPackage[]
  drivers: Record<string, Driver>
  seed: number
  weatherForecast: { rainProbability: number }
}): QualifyingResult {
  const rng = createRng((input.seed ^ 0x51ab) >>> 0)
  const rows: QualifyingResult['rows'] = []
  for (const p of input.packages) {
    const carPace = carPaceForCircuit(p.carPerformance, input.circuit)
    for (const driverId of p.driverIds) {
      const drv = input.drivers[driverId]
      if (!drv) continue
      const qualiSkill = drv.visible.qualifying * 0.65 + drv.visible.pace * 0.35
      const score = carPace * 0.58 + qualiSkill * 0.42
      let t = BASE_LAP_SECONDS - (score - 70) * 0.44
      t -= input.circuit.characteristics.trackEvolution * 1.0
      t += rng.gauss(0, 0.34)
      if (input.weatherForecast.rainProbability > 0.35 && rng.chance(0.28)) {
        t += rng.range(3, 12) // caught out in a wet Q
      }
      rows.push({ driverId, teamId: p.teamId, lapTime: Math.round(t * 1000) / 1000, gridPosition: 0 })
    }
  }
  rows.sort((a, b) => a.lapTime - b.lapTime)
  rows.forEach((r, i) => (r.gridPosition = i + 1))
  return { roundId: input.roundId, simulationVersion: SIMULATION_VERSION, seed: input.seed, rows }
}

// ---------------------------------------------------------------------------

export function simulateRace(input: SimulateRaceInput): RaceResult {
  const seed = input.seed >>> 0
  const rng = createRng(seed)
  const circuit = input.circuit
  const c = circuit.characteristics
  const totalLaps = c.laps
  const events: RaceEvent[] = []
  let evT = 0

  // ----- Weather timeline (decided upfront from the seed → fully deterministic) -----
  let condition: 'dry' | 'cloud' | 'lightRain' | 'heavyRain' = 'dry'
  let trackWetness = 0
  interface WeatherChange { atLap: number; to: 'lightRain' | 'heavyRain' | 'dry' }
  const weatherChanges: WeatherChange[] = []
  if (input.weatherEnabled && rng.chance(c.rainProbability)) {
    const startLap = rng.int(2, Math.max(3, Math.floor(totalLaps * 0.75)))
    weatherChanges.push({ atLap: startLap, to: rng.chance(0.35) ? 'heavyRain' : 'lightRain' })
    if (rng.chance(0.55)) {
      weatherChanges.push({ atLap: Math.min(totalLaps - 2, startLap + rng.int(6, 14)), to: 'dry' })
    }
  }

  // ----- Build sim cars in grid order -----
  const cars: SimCar[] = []
  for (let i = 0; i < input.packages.length; i++) {
    const pkg = input.packages[i]
    const driverId = pkg.drivers[0]?.driverId
    const driver = driverId ? input.drivers[driverId] : undefined
    if (!driver) continue
    const wearVals = Object.values(pkg.componentWear ?? {})
    const avgWear = wearVals.length ? wearVals.reduce((a, b) => a + b, 0) / wearVals.length : 0
    cars.push({
      teamId: pkg.teamId,
      driverId,
      gridPos: i + 1,
      position: i + 1,
      lapsDone: 0,
      totalTime: 0,
      lastLapTime: 0,
      bestLapTime: Infinity,
      tyre: pkg.strategy.startingTyre,
      tyreAge: 0,
      tyreWear: 0,
      fuelKg: 105,
      aggression: pkg.aggressionOverride ?? clamp(driver.hidden.aggression + (driver.dynamic.morale - 60) * 0.2, 10, 95),
      pitStops: 0,
      retired: false,
      damage: 0,
      componentCondition: 1 - avgWear * 0.5,
      finished: false,
      strategy: normalizeStrategy(pkg.strategy, totalLaps),
      reliability: pkg.reliability,
      paceScore: computeBaseline(pkg, driver, circuit),
      stintPlansUsed: new Set<number>(),
      lastPitLap: 0,
    })
  }

  const nameOf = (driverId: string) => input.drivers[driverId]?.lastName ?? driverId

  events.push({ t: 0, type: 'raceStart', detail: `Lights out at ${circuit.name} — ${totalLaps} laps` })

  // ----- State -----
  let scLapsRemaining = 0
  let vscLapsRemaining = 0
  let scCount = 0
  let vscCount = 0
  let fastestLapHolder: string | null = null
  let fastestLapTime = Infinity
  let lastLeaderId: string | null = null
  const finishOrder: SimCar[] = []

  const running = () => cars.filter((car) => !car.retired)

  function orderRunning(): SimCar[] {
    const list = running()
    list.sort((a, b) => (b.lapsDone - a.lapsDone) || (a.totalTime - b.totalTime))
    list.forEach((car, i) => (car.position = i + 1))
    return list
  }

  // ----- Main lap loop -----
  for (let leaderLap = 1; leaderLap <= totalLaps; leaderLap++) {
    // Weather evolution
    for (const wc of weatherChanges) {
      if (wc.atLap === leaderLap) {
        condition = wc.to === 'dry' ? 'dry' : wc.to
        events.push({
          t: evT,
          type: 'weatherChange',
          detail: wc.to === 'dry' ? 'The rain has stopped — track drying' : wc.to === 'lightRain' ? 'Light rain is falling' : 'Heavy rain!',
        })
      }
    }
    const targetWet = condition === 'heavyRain' ? 1 : condition === 'lightRain' ? 0.5 : 0
    trackWetness = clamp(trackWetness + clamp(targetWet - trackWetness, -0.07, 0.1), 0, 1)

    const ordered = orderRunning()

    for (const car of ordered) {
      if (car.retired || car.finished) continue
      const driver = input.drivers[car.driverId]!

      // --- Strategy decision ---
      const decision = decideStrategyAction(car, {
        lap: leaderLap,
        totalLaps,
        trackWetness,
        safetyCarActive: scLapsRemaining > 0 || vscLapsRemaining > 0,
        circuit,
        rng,
        strategistSkill: 70,
        gapsToAhead: gapSeconds(ordered, car),
      })
      if (decision.pitNow) {
        car.pitStops++
        const oldTyre = car.tyre
        car.tyre = decision.compound ?? pickFreshCompound(trackWetness, rng)
        car.tyreAge = 0
        car.tyreWear = 0
        car.lastPitLap = leaderLap
        const pitLoss = c.pitLossSeconds + Math.max(0, rng.gauss(1.2, 0.9))
        car.totalTime += pitLoss
        events.push({ t: car.totalTime, type: 'pitStop', driverId: car.driverId, teamId: car.teamId, detail: `${nameOf(car.driverId)} pits — ${oldTyre.toUpperCase()} → ${car.tyre.toUpperCase()}`, data: { stopNumber: car.pitStops } })
        if (decision.reason) {
          events.push({ t: car.totalTime, type: 'strategyDecision', driverId: car.driverId, teamId: car.teamId, detail: decision.reason })
        }
      }

      // --- Mechanical failure check (before driving) ---
      const failChance =
        ((100 - car.reliability) * 0.00016 +
          (1 - car.componentCondition) * 0.0022 +
          (c.brakingStress - 50) * 0.00001 +
          car.damage * 0.0018) *
        (scLapsRemaining > 0 ? 0.3 : 1)
      if (rng.chance(failChance)) {
        retireCar(car, rng.pick(['engine failure', 'gearbox failure', 'hydraulics', 'electrical issue', 'brake failure']))
        maybeDeploySafetyCar(rng.chance(0.45))
        continue
      }

      // --- Lap time ---
      const lt = lapTime(car, driver, trackWetness, rng, scLapsRemaining > 0, vscLapsRemaining > 0)
      car.lastLapTime = lt.time
      car.totalTime += lt.time
      car.bestLapTime = Math.min(car.bestLapTime, lt.time)
      for (const e of lt.events) {
        events.push({ t: car.totalTime, type: e.type, driverId: car.driverId, teamId: car.teamId, detail: e.detail })
        if (e.type === 'spin') {
          if (e.data?.crash) {
            retireCar(car, 'crashed')
            maybeDeploySafetyCar(true)
            break
          } else {
            car.damage = clamp(car.damage + rng.range(0.02, 0.09), 0, 1)
          }
        }
      }
      if (car.retired) continue

      // Fastest lap tracking (only competitive laps, not SC laps)
      if (!scLapsRemaining && !vscLapsRemaining && leaderLap >= 3 && car.lastLapTime < fastestLapTime) {
        fastestLapTime = car.lastLapTime
        if (fastestLapHolder !== null) {
          events.push({ t: car.totalTime, type: 'fastestLap', driverId: car.driverId, teamId: car.teamId, detail: `Fastest lap ${fmtLap(car.lastLapTime)} — ${nameOf(car.driverId)}` })
        }
        fastestLapHolder = car.driverId
      }

      // --- Tyres & fuel & wear ---
      const comp = TYRES[car.tyre]
      let wearRate = comp.degradationPerLap
      wearRate *= 1 + (c.tyreStress - 50) / 160
      wearRate *= car.strategy.tyreUsage === 'aggressive' ? 1.35 : car.strategy.tyreUsage === 'conserve' ? 0.72 : 1
      if (trackWetness > 0.3) wearRate *= 0.55
      car.tyreWear += wearRate
      car.tyreAge++
      car.fuelKg = Math.max(0, car.fuelKg - 2.2)

      car.lapsDone++

      // --- Overtaking: try to pass the car directly ahead on-track ---
      tryOvertakes(ordered, car)

      // --- Lead change detection ---
      const leaderNow = ordered.find((cc) => !cc.retired)
      if (leaderNow && leaderNow.lapsDone >= leaderLap - 1) {
        if (lastLeaderId !== null && leaderNow.driverId !== lastLeaderId) {
          events.push({ t: leaderNow.totalTime, type: 'leadChange', driverId: leaderNow.driverId, teamId: leaderNow.teamId, detail: `New race leader: ${nameOf(leaderNow.driverId)}` })
        }
        lastLeaderId = leaderNow.driverId
      }

      // --- Finish ---
      if (car.lapsDone >= totalLaps && !car.finished) {
        car.finished = true
        finishOrder.push(car)
        events.push({ t: car.totalTime, type: 'finish', driverId: car.driverId, teamId: car.teamId, detail: `${nameOf(car.driverId)} takes the flag in P${finishOrder.length}` })
      }

      events.push({ t: car.totalTime, type: 'lapComplete', driverId: car.driverId, teamId: car.teamId, detail: `Lap ${car.lapsDone}/${totalLaps}` })

      // Component degradation over the race
      car.componentCondition = clamp(car.componentCondition - 0.0025 * (1 + c.brakingStress / 150), 0.4, 1)
    }

    // SC/VSC countdowns
    if (vscLapsRemaining > 0) {
      vscLapsRemaining--
      if (vscLapsRemaining === 0) events.push({ t: evT, type: 'restart', detail: 'VSC has ended — back to racing' })
    } else if (scLapsRemaining > 0) {
      scLapsRemaining--
      if (scLapsRemaining === 0) events.push({ t: evT, type: 'restart', detail: 'Safety Car is in — racing resumes' })
    }

    // Random independent safety car (multi-car incident upstream etc.)
    if (scLapsRemaining <= 0 && vscLapsRemaining <= 0 && leaderLap < totalLaps - 2) {
      maybeDeploySafetyCar(rng.chance(c.safetyCarProbability / (totalLaps * 1.8)))
    }

    // Advance presentation clock to the leader's elapsed time
    const leaderCar = cars.reduce((lead, cc) => (cc.lapsDone > lead.lapsDone || (cc.lapsDone === lead.lapsDone && cc.totalTime < lead.totalTime) ? cc : lead), cars[0])
    if (leaderCar) evT = Math.max(evT + 1, leaderCar.totalTime)
  }

  // ----- Classification -----
  const dnf = cars.filter((car) => car.retired).sort((a, b) => b.lapsDone - a.lapsDone)
  const pointsTable = input.championshipPointsTable ?? DEFAULT_POINTS

  const results: RaceResult['results'] = []
  finishOrder.forEach((car, i) => {
    const pos = i + 1
    const pts = pos <= pointsTable.length ? pointsTable[pos - 1] : 0
    results.push({
      driverId: car.driverId,
      teamId: car.teamId,
      startPosition: car.gridPos,
      finishPosition: pos,
      classified: true,
      lapsCompleted: car.lapsDone,
      totalTime: car.totalTime,
      bestLapTime: car.bestLapTime === Infinity ? undefined : round3(car.bestLapTime),
      pitStops: car.pitStops,
      penaltiesSeconds: 0,
      points: pts + (car.driverId === fastestLapHolder && pos <= 10 ? 1 : 0),
      fastestLap: car.driverId === fastestLapHolder,
      dnfReason: car.dnfReason,
    })
  })
  // DNFs that covered 90%+ distance are classified
  dnf.forEach((car) => {
    const classified = car.lapsDone >= Math.ceil(totalLaps * 0.9)
    results.push({
      driverId: car.driverId,
      teamId: car.teamId,
      startPosition: car.gridPos,
      finishPosition: classified ? finishOrder.length + results.filter((r) => r.classified).length - finishOrder.length + 1 : 0,
      classified,
      lapsCompleted: car.lapsDone,
      pitStops: car.pitStops,
      penaltiesSeconds: 0,
      points: 0,
      dnfReason: car.dnfReason,
    })
  })

  // Fix classified DNF ordering: re-sort classified tail by laps done
  const classifiedResults = results.filter((r) => r.classified)
  classifiedResults.sort((a, b) => {
    const fa = finishOrder.findIndex((f) => f.driverId === a.driverId)
    const fb = finishOrder.findIndex((f) => f.driverId === b.driverId)
    const la = fa >= 0 ? -(totalLaps + 1) + 0 : -a.lapsCompleted
    const lb = fb >= 0 ? -(totalLaps + 1) + 0 : -b.lapsCompleted
    void la
    void lb
    if (fa >= 0 && fb >= 0) return fa - fb
    if (fa >= 0) return -1
    if (fb >= 0) return 1
    return b.lapsCompleted - a.lapsCompleted
  })
  // Recompute finish positions and points after sort
  classifiedResults.forEach((r, i) => {
    r.finishPosition = i + 1
    const pts = i + 1 <= pointsTable.length ? pointsTable[i] : 0
    r.points = pts + (r.fastestLap && i + 1 <= 10 ? 1 : 0)
  })

  const winnerName = classifiedResults[0] ? nameOf(classifiedResults[0].driverId) : 'unknown'
  events.push({ t: evT, type: 'finish', detail: `Chequered flag — winner: ${winnerName}` })

  return {
    roundId: input.roundId,
    circuitId: circuit.id,
    simulationVersion: SIMULATION_VERSION,
    seed,
    rulesHash: fnv1a(`rules|${SIMULATION_VERSION}|${totalLaps}|${pointsTable.join(',')}|${circuit.id}`),
    events: [...events].sort((a, b) => a.t - b.t),
    results: classifiedResults.concat(results.filter((r) => !r.classified)),
    fastestLapDriverId: fastestLapHolder ?? undefined,
    totalSimTime: evT,
    safetyCarCount: scCount,
    vscCount: vscCount,
  }

  // ---- inner helpers ----

  function retireCar(car: SimCar, reason: string) {
    car.retired = true
    car.dnfReason = reason
    events.push({ t: car.totalTime, type: 'retirement', driverId: car.driverId, teamId: car.teamId, detail: `${nameOf(car.driverId)} retires — ${reason}` })
  }

  function maybeDeploySafetyCar(chanceHit: boolean) {
    if (!chanceHit || scLapsRemaining > 0 || vscLapsRemaining > 0) return
    if (rng.chance(0.62)) {
      scLapsRemaining = rng.int(3, 6)
      scCount++
      events.push({ t: evT, type: 'safetyCar', detail: 'Safety Car deployed' })
    } else {
      vscLapsRemaining = rng.int(2, 4)
      vscCount++
      events.push({ t: evT, type: 'virtualSafetyCar', detail: 'Virtual Safety Car deployed' })
    }
  }

  function tryOvertakes(ordered: SimCar[], car: SimCar) {
    const idx = ordered.indexOf(car)
    if (idx <= 0) return
    const ahead = ordered[idx - 1]
    if (!ahead || ahead.retired) return
    const gapSec = ahead.totalTime - car.totalTime
    if (gapSec <= 0 || gapSec > 2.8) return // only close battles
    const closeness = 1 - gapSec / 3.0
    const sectorOvt = circuit.sectors[(car.lapsDone + car.gridPos) % circuit.sectors.length].overtakingChance
    const attacker = input.drivers[car.driverId]!
    const defender = input.drivers[ahead.driverId]!
    const chance =
      closeness *
      (1 - c.overtakingDifficulty / 130) *
      (0.35 + sectorOvt * 0.65) *
      (0.6 + (attacker.visible.overtaking - 60) / 90) *
      (0.9 - (defender.visible.defending - 60) / 160) *
      (car.damage > 0.25 ? 0.6 : 1) *
      (ahead.damage > 0.25 ? 1.5 : 1) *
      (trackWetness > 0.4 ? 1.2 : 1) *
      (scLapsRemaining > 0 || vscLapsRemaining > 0 ? 0 : 1)
    if (chance > 0 && rng.chance(clamp(chance, 0, 0.9))) {
      ;[ordered[idx - 1], ordered[idx]] = [ordered[idx], ordered[idx - 1]]
      ahead.position = idx + 1
      car.position = idx
      events.push({ t: car.totalTime, type: 'overtake', driverId: car.driverId, teamId: car.teamId, detail: `${nameOf(car.driverId)} passes ${nameOf(ahead.driverId)}`, data: { newPosition: car.position } })
    }
  }
}

// ---------------------------------------------------------------------------
// Lap-time model
// ---------------------------------------------------------------------------

function lapTime(
  car: SimCar,
  driver: Driver,
  trackWetness: number,
  rng: Rng,
  safetyCar: boolean,
  vsc: boolean,
): { time: number; events: Array<{ type: RaceEventType; detail: string; data?: Record<string, number | string> }> } {
  const events: Array<{ type: RaceEventType; detail: string; data?: Record<string, number | string> }> = []
  let t = BASE_LAP_SECONDS - (car.paceScore - 70) * 0.42

  // Tyres
  t += tyreWetnessDelta(car.tyre, trackWetness)
  const comp = TYRES[car.tyre]
  if (car.tyreAge < comp.warmupLaps) t += (comp.warmupLaps - car.tyreAge) * 0.9
  if (car.tyreWear > comp.wearCliff) t += (car.tyreWear - comp.wearCliff) * 26

  // Fuel
  t += car.fuelKg * 0.03

  // Modes
  t += car.strategy.paceMode === 'attack' ? -0.65 : car.strategy.paceMode === 'push' ? -0.3 : car.strategy.paceMode === 'conserve' ? 0.75 : 0
  t += car.strategy.energy === 'deploy' ? -0.15 : car.strategy.energy === 'harvest' ? 0.18 : 0

  // Damage & components
  t += car.damage * 6
  t += (1 - car.componentCondition) * 2.2

  // Driver consistency noise
  const sigma = (100 - driver.visible.consistency) * 0.026 + 0.12
  t += rng.gauss(0, sigma)

  // Small mistakes
  if (
    rng.chance(clamp((100 - driver.visible.consistency) * 0.0007 + (car.aggression - 50) * 0.0003 + trackWetness * 0.003, 0.001, 0.04))
  ) {
    t += rng.range(0.4, 2.2)
    events.push({ type: 'lockup', detail: `${driver.lastName} locks up into turn one` })
  }

  // Spins / crashes
  const spinChance = clamp(
    (car.aggression - 45) * 0.00016 +
      (100 - driver.visible.consistency) * 0.00015 +
      trackWetness * (driver.visible.wetSkill < 78 ? 0.0035 : 0.0012) +
      car.damage * 0.002 +
      (88 - car.componentCondition * 100) * 0.00004,
    0.0003,
    0.016,
  )
  if (rng.chance(spinChance)) {
    const crash = rng.chance(0.22 + car.damage * 0.3)
    if (crash) {
      events.push({ type: 'spin', detail: `${driver.lastName} crashes out!`, data: { crash: 1 } })
    } else {
      events.push({ type: 'spin', detail: `${driver.lastName} spins but rejoins`, data: {} })
      t += rng.range(4, 12)
    }
  }

  if (vsc) t *= 1.32
  else if (safetyCar) t *= 1.52

  return { time: Math.max(t, 40), events }
}

// ---------------------------------------------------------------------------
// Strategy engine
// ---------------------------------------------------------------------------

interface StrategyCtx {
  lap: number
  totalLaps: number
  trackWetness: number
  safetyCarActive: boolean
  circuit: Circuit
  rng: Rng
  strategistSkill: number
  gapsToAhead: number[]
}

function decideStrategyAction(car: SimCar, ctx: StrategyCtx): { pitNow: boolean; compound?: TyreCompoundId; reason?: string } {
  const s = car.strategy
  const lapsLeft = ctx.totalLaps - car.lapsDone
  const comp = TYRES[car.tyre]
  const pitCost = ctx.circuit.characteristics.pitLossSeconds

  // 1. Weather crossover — switch to rain tyres or back to slicks
  if (isDryCompound(car.tyre) && ctx.trackWetness > 0.22) {
    const dryDelta = tyreWetnessDelta(car.tyre, ctx.trackWetness)
    const bestWet = ctx.trackWetness > 0.65 ? 'wet' : 'inter'
    const wetDelta = tyreWetnessDelta(bestWet, ctx.trackWetness)
    const gainPerLap = dryDelta - wetDelta
    if (gainPerLap > 0.6 && lapsLeft * gainPerLap > pitCost * (1.35 - ctx.strategistSkill / 250)) {
      return {
        pitNow: true,
        compound: bestWet,
        reason: `Track wetness ${(ctx.trackWetness * 100) | 0}% — switching to ${bestWet === 'inter' ? 'Intermediates' : 'full Wets'} (${gainPerLap.toFixed(1)}s/lap faster)`,
      }
    }
  }
  if (!isDryCompound(car.tyre) && ctx.trackWetness < 0.12) {
    const gain = tyreWetnessDelta(car.tyre, ctx.trackWetness) - tyreWetnessDelta('medium', ctx.trackWetness)
    if (lapsLeft * gain > pitCost) {
      return { pitNow: true, compound: 'medium', reason: 'Track dry enough — boxing for slicks' }
    }
  }

  // 2. Wear cliff emergency
  if (car.tyreWear > comp.wearCliff + 0.07 && lapsLeft > 2) {
    return { pitNow: true, reason: 'Tyres past the wear cliff — emergency stop' }
  }

  // 3. Safety-car cheap stop (rules-driven)
  if (ctx.safetyCarActive) {
    for (const rule of s.safetyCarRules) {
      if (!rule.enabled || rule.kind !== 'safetyCarPit') continue
      const minAge = rule.params.minTyreAge ?? 6
      const maxLapFrac = (rule.params.maxLapFraction ?? 0.7) * ctx.totalLaps
      if (car.tyreAge >= minAge && ctx.lap <= maxLapFrac) {
        return { pitNow: true, compound: pickFreshCompound(ctx.trackWetness, ctx.rng), reason: 'Safety Car Rule: cheap stop under neutralisation' }
      }
    }
    // AI fallback: sensible default cheap stop
    if (car.tyreAge >= Math.floor(ctx.totalLaps * 0.25) && ctx.lap <= ctx.totalLaps * 0.72) {
      return { pitNow: true, compound: pickFreshCompound(ctx.trackWetness, ctx.rng), reason: 'Opportunistic stop under Safety Car' }
    }
  }

  // 4. Planned stints
  for (let i = 0; i < s.plannedStints.length; i++) {
    if (car.stintPlansUsed.has(i)) continue
    const stint = s.plannedStints[i]
    const windowStart = stint.fromLap
    const windowEnd = stint.fromLap + 4
    if (car.lapsDone >= windowStart && car.lapsDone <= windowEnd) {
      car.stintPlansUsed.add(i)
      return { pitNow: true, compound: stint.compound, reason: `Planned pit window (stint ${i + 1}, lap ${windowStart})` }
    }
  }

  // 5. Late-race attack rule
  for (const rule of s.lateRaceRules) {
    if (!rule.enabled || rule.kind !== 'lateAttack') continue
    const maxLeft = rule.params.maxLapsRemaining ?? 10
    if (lapsLeft <= maxLeft && car.tyreAge > 8 && car.tyreWear < 0.55 && lapsLeft > 4) {
      if (ctx.rng.chance(0.3)) {
        car.stintPlansUsed.add(99)
        return { pitNow: true, compound: 'soft', reason: 'Late-race Rule: fitting Softs for a final charge' }
      }
    }
  }

  // 6. Fallback: one-stop sanity if tyres will not reach the end
  if (car.pitStops === 0 && lapsLeft > 12) {
    const projectedWearAtEnd = car.tyreWear + comp.degradationPerLap * (1 + (ctx.circuit.characteristics.tyreStress - 50) / 160) * lapsLeft
    if (projectedWearAtEnd > comp.wearCliff + 0.05 && car.lapsDone > ctx.totalLaps * 0.33) {
      return { pitNow: true, compound: pickFreshCompound(ctx.trackWetness, ctx.rng), reason: 'Strategy fallback: tyres cannot make the distance' }
    }
  }

  return { pitNow: false }
}

function isDryCompound(t: TyreCompoundId): boolean {
  return t === 'soft' || t === 'medium' || t === 'hard'
}

function normalizeStrategy(strategy: StrategyPlaybook, totalLaps: number): StrategyPlaybook {
  const s: StrategyPlaybook = structuredClone(strategy)
  if (!s.plannedStints || s.plannedStints.length === 0) {
    s.plannedStints = [
      { fromLap: Math.floor(totalLaps * 0.42), compound: s.startingTyre === 'soft' ? 'medium' : 'hard' },
    ]
  }
  s.weatherRules ??= []
  s.safetyCarRules ??= []
  s.lateRaceRules ??= []
  return s
}

function gapSeconds(ordered: SimCar[], car: SimCar): number[] {
  const idx = ordered.indexOf(car)
  const gaps: number[] = []
  for (let i = Math.max(0, idx - 2); i <= idx; i++) {
    gaps.push(i === idx ? 0 : ordered[i].totalTime - car.totalTime)
  }
  return gaps
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function fmtLap(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}
