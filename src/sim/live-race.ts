import { createRng, fnv1a, type Rng } from '../core/rng'
import { TYRES, tyreWetnessDelta } from '../core/tyres'
import { SIMULATION_VERSION } from '../core/content'
import type {
  Circuit,
  Driver,
  RaceEvent,
  RaceEventType,
  RacePackage,
  SetupChoice,
  StrategyPlaybook,
  TyreCompoundId,
} from '../core/types'

// ---------------------------------------------------------------------------
// LiveRaceEngine — the authoritative race runs lap-by-lap on the server and
// can be stepped in real time. Determinism: identical packages + identical
// ordered live-command log + identical seed reproduce identical races.
//
// The engine exposes stepLap() which advances exactly one leader-lap. The
// broadcast consumes emitted events; live commands are applied via
// applyCommand() and recorded in an append-only log.
// ---------------------------------------------------------------------------

export type LiveCommandType =
  | 'PACE_CONSERVE' | 'PACE_NORMAL' | 'PACE_PUSH' | 'PACE_ATTACK'
  | 'ENERGY_HARVEST' | 'ENERGY_BALANCED' | 'ENERGY_DEPLOY'
  | 'PIT_THIS_LAP' | 'PIT_NEXT_LAP' | 'CANCEL_PIT'
  | 'TYRE_REQUEST' // data.compound = requested compound for next stop
  | 'TEAM_ORDER_HOLD' | 'TEAM_ORDER_SWAP' | 'TEAM_ORDER_DO_NOT_FIGHT' | 'TEAM_ORDER_PRIORITY_DRIVER' | 'TEAM_ORDER_FREE'
  | 'EXTEND_STINT'

export interface LiveCommand {
  /** Server race time (seconds) when received — recorded for the audit log. */
  t: number
  teamId: string
  driverId: string
  command: LiveCommandType
  compound?: TyreCompoundId
  targetDriverId?: string
  /** Set by engine: whether the command took effect this lap or was deferred. */
  applied?: boolean
  note?: string
}

export interface LiveCar {
  teamId: string
  driverId: string
  teammateId?: string
  carNumber: number
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
  reliability: number
  paceScore: number
  // live-mutable strategy state (mutated by commands)
  strategy: StrategyPlaybook
  // pit scheduling
  pitThisLap: boolean
  pitNextLap: boolean
  requestedCompound?: TyreCompoundId
  // team order state
  teamOrder: StrategyPlaybook['teamOrder']
  orderTargetDriverId?: string
  /** Lap fraction (0..1) at which pit entry decision passes this lap. */
  pitEntryFraction: number
  /** Sim time when this car last crossed the line (for lap-fraction calc). */
  lapStartTime: number
  /** Set when a PIT_THIS_LAP arrived after the decision point. */
  deferredMessage?: string
  stintPlansUsed: Set<number>
  lastPitLap: number
  /** Setup-confidence bonus from practice, in seconds (negative = faster). */
  practiceBonus: number
}

export interface LiveRaceState {
  cars: LiveCar[]
  leaderLap: number
  totalLaps: number
  simTime: number
  finished: boolean
  trackWetness: number
  condition: 'dry' | 'cloud' | 'lightRain' | 'heavyRain'
  safetyCarLaps: number
  vscLaps: number
}

export class LiveRaceEngine {
  readonly circuit: Circuit
  readonly packages: RacePackage[]
  readonly drivers: Record<string, Driver>
  readonly seed: number
  readonly simulationVersion = SIMULATION_VERSION
  readonly rulesHash: string
  /** Append-only command log — part of the deterministic replay input. */
  readonly commandLog: LiveCommand[] = []

  /**
   * Authoritative pit-stop timeline. Each entry records the
   * car id, the sim time the stop began, the sim time the stop
   * ended, the chosen compound and the team id. The renderer
   * uses this to drive the on-screen pit animation: at 1× the
   * wall-clock duration equals the sim duration; at 2× it
   * halves; at 4× it quarters. There is no separate
   * presentation-side stop timer.
   */
  private pitStopsTimeline: Array<{
    carId: string
    teamId: string
    startedAtSim: number
    durationSim: number
    compound: TyreCompoundId
    oldCompound: TyreCompoundId
  }> = []

  private cars: LiveCar[] = []
  private rng: Rng
  private weatherChanges: Array<{ atLap: number; to: 'lightRain' | 'heavyRain' | 'dry' }> = []
  private condition: 'dry' | 'cloud' | 'lightRain' | 'heavyRain' = 'dry'
  private trackWetness = 0
  private scLaps = 0
  private vscLaps = 0
  private scCount = 0
  private vscCount = 0
  private leaderLap = 0
  private simTime = 0
  private finished = false
  private fastestLapHolder: string | null = null
  private fastestLapTime = Infinity
  private finishOrder: LiveCar[] = []
  /** Radio messages generated since last snapshot. */
  radioFeed: Array<{ t: number; driverId: string; message: string; kind: 'info' | 'confirm' | 'refusal' | 'warn' }> = []
  events: RaceEvent[] = []

  constructor(circuit: Circuit, packages: RacePackage[], drivers: Record<string, Driver>, seed: number) {
    // Grid order = packages order (caller sorts by qualifying)
    this.circuit = circuit
    this.packages = packages
    this.drivers = drivers
    this.seed = seed >>> 0
    this.rng = createRng(this.seed)
    this.rulesHash = fnv1a(`live|${SIMULATION_VERSION}|${circuit.characteristics.laps}|${circuit.id}`)
    this.build()
  }

  private build() {
    const c = this.circuit.characteristics
    if (this.packages.length && this.rng.chance(c.rainProbability)) {
      const startLap = this.rng.int(2, Math.max(3, Math.floor(c.laps * 0.75)))
      this.weatherChanges.push({ atLap: startLap, to: this.rng.chance(0.35) ? 'heavyRain' : 'lightRain' })
      if (this.rng.chance(0.55)) {
        this.weatherChanges.push({ atLap: Math.min(c.laps - 2, startLap + this.rng.int(6, 14)), to: 'dry' })
      }
    }
    this.packages.forEach((pkg, i) => {
      const driver = this.drivers[pkg.driverId]
      if (!driver) return
      const wearVals = Object.values(pkg.componentWear ?? {})
      const avgWear = wearVals.length ? wearVals.reduce((a, b) => a + b, 0) / wearVals.length : 0
      const practiceBonus = (pkg as unknown as { practiceBonus?: number }).practiceBonus ?? 0
      this.cars.push({
        teamId: pkg.teamId,
        driverId: pkg.driverId,
        teammateId: pkg.teammateId,
        carNumber: pkg.carNumber,
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
        reliability: pkg.reliability,
        paceScore: computePace(pkg, driver, this.circuit),
        strategy: structuredClone(pkg.strategy),
        pitThisLap: false,
        pitNextLap: false,
        teamOrder: pkg.strategy.teamOrder,
        pitEntryFraction: 0.72,
        lapStartTime: 0,
        stintPlansUsed: new Set(),
        lastPitLap: 0,
        practiceBonus,
      })
    })
    this.pushEvent('raceStart', null, `Lights out at ${this.circuit.name} — ${c.laps} laps`)
  }

  get state(): LiveRaceState {
    return {
      cars: this.cars,
      leaderLap: this.leaderLap,
      totalLaps: this.circuit.characteristics.laps,
      simTime: this.simTime,
      finished: this.finished,
      trackWetness: this.trackWetness,
      condition: this.condition,
      safetyCarLaps: this.scLaps,
      vscLaps: this.vscLaps,
    }
  }

  isFinished(): boolean {
    return this.finished
  }

  // -------------------------------------------------------------------------
  // Live commands
  // -------------------------------------------------------------------------

  /**
   * Apply a live command. Returns a human-readable radio response.
   * PIT_THIS_LAP respects the pit-entry decision point: if the car has passed
   * it this lap, the stop is scheduled for next lap instead (deterministic).
   */
  applyCommand(cmd: Omit<LiveCommand, 't' | 'applied' | 'note'>): { ok: boolean; response: string; deferred?: boolean } {
    const car = this.cars.find((c) => c.driverId === cmd.driverId && c.teamId === cmd.teamId)
    if (!car) return { ok: false, response: 'No radio contact — car not found.' }
    if (car.retired) return { ok: false, response: `${this.name(car.driverId)} has retired — no radio.` }
    if (this.finished) return { ok: false, response: 'Race complete.' }

    const entry: LiveCommand = { ...cmd, t: this.simTime, applied: true }

    switch (cmd.command) {
      case 'PACE_CONSERVE': case 'PACE_NORMAL': case 'PACE_PUSH': case 'PACE_ATTACK': {
        const mode = cmd.command.split('_')[1].toLowerCase() as StrategyPlaybook['paceMode']
        car.strategy.paceMode = mode
        this.commandLog.push(entry)
        const msg = { conserve: 'Copy. Managing pace, conserving.', normal: 'Understood, back to normal pace.', push: 'Understood. Pushing now.', attack: 'Copy. Attack mode — flat out.' }[mode] ?? 'Copy.'
        this.radio(car, msg, 'confirm')
        return { ok: true, response: msg }
      }
      case 'ENERGY_HARVEST': case 'ENERGY_BALANCED': case 'ENERGY_DEPLOY': {
        car.strategy.energy = cmd.command.split('_')[1].toLowerCase() as StrategyPlaybook['energy']
        this.commandLog.push(entry)
        const msg = cmd.command === 'ENERGY_DEPLOY' ? 'Deploying energy now.' : cmd.command === 'ENERGY_HARVEST' ? 'Harvesting energy.' : 'Energy balanced.'
        this.radio(car, msg, 'confirm')
        return { ok: true, response: msg }
      }
      case 'PIT_THIS_LAP': {
        // Pit-entry decision point: fraction of lap already covered
        const lapFraction = this.lapFractionOf(car)
        if (lapFraction >= car.pitEntryFraction) {
          car.pitNextLap = true
          entry.applied = false
          entry.note = 'passed pit entry — deferred to next lap'
          this.commandLog.push(entry)
          const msg = 'Too late for pit entry this lap — boxing next lap.'
          this.radio(car, msg, 'warn')
          return { ok: true, response: msg, deferred: true }
        }
        car.pitThisLap = true
        car.pitNextLap = false
        if (cmd.compound) car.requestedCompound = cmd.compound
        this.commandLog.push(entry)
        const msg = 'Copy. Box this lap.'
        this.radio(car, msg, 'confirm')
        return { ok: true, response: msg }
      }
      case 'PIT_NEXT_LAP': {
        // Schedule for the start of the next leader lap
        car.pitNextLap = true
        car.pitThisLap = false
        car.deferredMessage = undefined
        if (cmd.compound) car.requestedCompound = cmd.compound
        this.commandLog.push(entry)
        this.radio(car, 'Understood — boxing next lap.', 'confirm')
        return { ok: true, response: 'Boxing next lap.' }
      }
      case 'CANCEL_PIT': {
        car.pitThisLap = false
        car.pitNextLap = false
        car.requestedCompound = undefined
        this.commandLog.push(entry)
        this.radio(car, 'Okay, staying out — stay sharp.', 'confirm')
        return { ok: true, response: 'Pit call cancelled — staying out.' }
      }
      case 'TYRE_REQUEST': {
        if (!cmd.compound) return { ok: false, response: 'No compound specified.' }
        car.requestedCompound = cmd.compound
        this.commandLog.push(entry)
        return { ok: true, response: `Next stop will fit ${TYRES[cmd.compound].name}.` }
      }
      case 'EXTEND_STINT': {
        car.strategy.tyreUsage = 'conserve'
        car.pitNextLap = false
        car.pitThisLap = false
        this.commandLog.push(entry)
        this.radio(car, 'Extending the stint — managing these tyres.', 'confirm')
        return { ok: true, response: 'Stint extended — tyre conservation mode.' }
      }
      case 'TEAM_ORDER_HOLD': case 'TEAM_ORDER_DO_NOT_FIGHT': case 'TEAM_ORDER_SWAP': case 'TEAM_ORDER_PRIORITY_DRIVER': case 'TEAM_ORDER_FREE': {
        const res = applyTeamOrder(car, cmd, this, entry)
        return res
      }
      default:
        return { ok: false, response: 'Unknown command.' }
    }
  }

  private radio(car: LiveCar, message: string, kind: 'info' | 'confirm' | 'refusal' | 'warn') {
    this.radioFeed.push({ t: this.simTime, driverId: car.driverId, message, kind })
    if (this.radioFeed.length > 60) this.radioFeed.shift()
  }

  name(driverId: string): string {
    return this.drivers[driverId]?.lastName ?? driverId
  }

  /**
   * Fraction (0..1) of the current lap covered by this car. The
   * presentation-time approach keeps this stable between stepLap
   * calls: the broadcast increments each car's `totalTime` and
   * `lapStartTime` by the same `dt` per frame, so the delta
   * grows smoothly. `simTime` is the master clock, advanced by
   * the same `dt`, so `simTime - car.lapStartTime` matches the
   * interpolated value.
   */
  lapFractionOf(car: LiveCar): number {
    const lapDur = car.lastLapTime > 0 ? car.lastLapTime : 92
    return clamp((this.simTime - car.lapStartTime) / lapDur, 0, 0.999)
  }

  carByDriver(driverId: string): LiveCar | undefined {
    return this.cars.find((c) => c.driverId === driverId)
  }

  /**
   * Authoritative pit presentation query.
   *
   * Returns the pit stop the given car is currently inside (or
   * just finished), and where the car is along that stop in
   * sim-time terms. The renderer uses this to drive the on-screen
   * pit animation: the wall-clock duration of the visible stop
   * equals (1 / speedMultiplier) × durationSim.
   */
  pitStateAt(carId: string, simTime: number): { startedAtSim: number; durationSim: number; compound: TyreCompoundId; oldCompound: TyreCompoundId; fraction: number } | null {
    for (const stop of this.pitStopsTimeline) {
      if (stop.carId !== carId) continue
      if (simTime < stop.startedAtSim) continue
      // We treat the stop as a window from startedAtSim to
      // startedAtSim + durationSim. The renderer's frame
      // rate is the only thing that can advance faster or
      // slower — simTime itself is the master clock.
      const frac = clamp((simTime - stop.startedAtSim) / stop.durationSim, 0, 1)
      return { ...stop, fraction: frac }
    }
    return null
  }

  orderedCars(): LiveCar[] {
    const list = this.cars.filter((c) => !c.retired)
    list.sort((a, b) => (b.lapsDone - a.lapsDone) || (a.totalTime - b.totalTime))
    list.forEach((c, i) => (c.position = i + 1))
    return list
  }

  // -------------------------------------------------------------------------
  // Simulation stepping
  // -------------------------------------------------------------------------

  /** Advance the race by one leader lap. Emits events. Returns emitted events. */
  stepLap(): RaceEvent[] {
    if (this.finished) return []
    const c = this.circuit.characteristics
    const totalLaps = c.laps
    this.leaderLap++
    const leaderLap = this.leaderLap

    // Weather evolution
    for (const wc of this.weatherChanges) {
      if (wc.atLap === leaderLap) {
        this.condition = wc.to
        this.pushEvent('weatherChange', null, wc.to === 'dry' ? 'The rain has stopped — track drying' : wc.to === 'lightRain' ? 'Light rain is falling' : 'Heavy rain!')
      }
    }
    const targetWet = this.condition === 'heavyRain' ? 1 : this.condition === 'lightRain' ? 0.5 : 0
    this.trackWetness = clamp(this.trackWetness + clamp(targetWet - this.trackWetness, -0.07, 0.1), 0, 1)

    const ordered = this.orderedCars()
    const before: RaceEvent[] = []

    for (const car of ordered) {
      if (car.retired || car.finished) continue
      const driver = this.drivers[car.driverId]!

      // --- Pit stop execution (from live commands or playbook) ---
      const wantsPit = car.pitThisLap || car.pitNextLap || this.playbookWantsPit(car, leaderLap)
      if (wantsPit) {
        // Consume the scheduled stop flags regardless of source
        car.pitThisLap = false
        car.pitNextLap = false
        const compound = car.requestedCompound ?? pickFreshCompound(this.trackWetness, this.rng)
        car.pitStops++
        const oldTyre = car.tyre
        car.tyre = compound
        car.tyreAge = 0
        car.tyreWear = 0
        car.lastPitLap = leaderLap
        car.pitThisLap = false
        car.pitNextLap = false
        car.requestedCompound = undefined
        const pitLoss = c.pitLossSeconds + Math.max(0, this.rng.gauss(1.2, 0.9))
        // Record the authoritative stop. The renderer reads this
        // and animates the car at this exact sim-time duration,
        // so 1×/2×/4× all show the same sim-time spent in the
        // box (the wall-clock duration scales with the speed
        // multiplier through dt * speed).
        const startedAtSim = car.totalTime
        this.pitStopsTimeline.push({
          carId: car.driverId,
          teamId: car.teamId,
          startedAtSim,
          durationSim: pitLoss,
          compound,
          oldCompound: oldTyre,
        })
        car.totalTime += pitLoss
        before.push(this.mkEvent(car.totalTime, 'pitStop', car, `PIT — ${oldTyre.toUpperCase()} → ${compound.toUpperCase()}`, { stopNumber: car.pitStops, duration: pitLoss }))
        this.radio(car, 'Good stop. Tyres are cold for a lap.', 'info')
      }

      // --- Mechanical failure ---
      const failChance =
        ((100 - car.reliability) * 0.00016 +
          (1 - car.componentCondition) * 0.0022 +
          (c.brakingStress - 50) * 0.00001 +
          car.damage * 0.0018) *
        (this.scLaps > 0 ? 0.3 : 1)
      if (this.rng.chance(failChance)) {
        this.retire(car, this.rng.pick(['engine failure', 'gearbox failure', 'hydraulics', 'electrical issue', 'brake failure']))
        this.maybeDeploySafetyCar(this.rng.chance(0.45))
        continue
      }

      // --- Lap time ---
      const lt = liveLapTime(car, driver, this.trackWetness, this.rng, this.scLaps > 0, this.vscLaps > 0)
      car.lastLapTime = lt.time
      car.totalTime += lt.time
      car.lapStartTime = car.totalTime
      car.bestLapTime = Math.min(car.bestLapTime, lt.time)
      for (const e of lt.events) {
        before.push(this.mkEvent(car.totalTime, e.type, car, e.detail))
        if (e.type === 'spin') {
          if (e.data?.crash) {
            this.retire(car, 'crashed')
            this.maybeDeploySafetyCar(true)
            break
          }
          car.damage = clamp(car.damage + this.rng.range(0.02, 0.09), 0, 1)
        }
      }
      if (car.retired) continue

      if (!this.scLaps && !this.vscLaps && leaderLap >= 3 && car.lastLapTime < this.fastestLapTime) {
        this.fastestLapTime = car.lastLapTime
        if (this.fastestLapHolder !== null) {
          before.push(this.mkEvent(car.totalTime, 'fastestLap', car, `Fastest lap ${fmtLap(car.lastLapTime)} — ${this.name(car.driverId)}`))
        }
        this.fastestLapHolder = car.driverId
      }

      // Tyres, fuel, wear
      const comp = TYRES[car.tyre]
      let wearRate = comp.degradationPerLap
      wearRate *= 1 + (c.tyreStress - 50) / 160
      wearRate *= car.strategy.tyreUsage === 'aggressive' ? 1.35 : car.strategy.tyreUsage === 'conserve' ? 0.72 : 1
      if (this.trackWetness > 0.3) wearRate *= 0.55
      car.tyreWear += wearRate
      car.tyreAge++
      car.fuelKg = Math.max(0, car.fuelKg - 2.2)
      car.lapsDone++

      // Overtakes (with team-order influence on teammate fights)
      this.tryOvertakes(ordered, car)

      if (car.lapsDone >= totalLaps && !car.finished) {
        car.finished = true
        this.finishOrder.push(car)
        before.push(this.mkEvent(car.totalTime, 'finish', car, `${this.name(car.driverId)} takes the flag in P${this.finishOrder.length}`))
      }
      before.push(this.mkEvent(car.totalTime, 'lapComplete', car, `Lap ${car.lapsDone}/${totalLaps}`))
      car.componentCondition = clamp(car.componentCondition - 0.0025 * (1 + c.brakingStress / 150), 0.4, 1)
    }

    // SC/VSC countdown
    if (this.vscLaps > 0) {
      this.vscLaps--
      if (this.vscLaps === 0) before.push(this.mkEvent(this.simTime, 'restart', null, 'VSC has ended — back to racing'))
    } else if (this.scLaps > 0) {
      this.scLaps--
      if (this.scLaps === 0) before.push(this.mkEvent(this.simTime, 'restart', null, 'Safety Car is in — racing resumes'))
    }
    if (this.scLaps <= 0 && this.vscLaps <= 0 && leaderLap < totalLaps - 2) {
      this.maybeDeploySafetyCar(this.rng.chance(c.safetyCarProbability / (totalLaps * 1.8)))
    }

    // Advance clock to leader elapsed time
    const leaderCar = this.orderedCars()[0]
    if (leaderCar) this.simTime = Math.max(this.simTime + 1, leaderCar.totalTime)

    // Lead change
    const leader = this.orderedCars()[0]
    if (leader) {
      const last = this.events.filter((e) => e.type === 'leadChange').pop()
      const lastLeader = last?.driverId ?? this.packages[0]?.driverId
      if (lastLeader && leader.driverId !== lastLeader) {
        before.push(this.mkEvent(this.simTime, 'leadChange', leader, `New race leader: ${this.name(leader.driverId)}`))
      }
    }

    this.events.push(...before)

    if (leaderLap >= totalLaps || this.orderedCars().length === 0) {
      this.finished = true
      before.push(this.mkEvent(this.simTime, 'finish', null, 'Chequered flag'))
    }
    return before
  }

  /**
   * Presentation-level sub-step. Advances `simTime` by `dtSec`
   * real seconds and increments each active car's `totalTime`
   * and `lapStartTime` by the same amount. This keeps the
   * lap-fraction math smooth every render frame without ever
   * firing `stepLap` from the broadcast loop. `stepLap` is
   * still the single source of truth for cross-line state
   * (lapsDone, pit, fail, fastest lap, results) and is
   * invoked once at the end of the broadcast loop after a
   * `frameAdvance` if the sim has reached the next boundary.
   *
   * Determinism note: the same starting state and the same
   * cumulative dt always fires the boundary crossing on the
   * same car in the same order, so multiplayer regressions
   * still pass.
   */
  frameAdvance(dtSec: number): RaceEvent[] {
    if (this.finished || dtSec <= 0) return []
    const events: RaceEvent[] = []
    this.simTime += dtSec
    // For every still-running car, shift totalTime and
    // lapStartTime by exactly dtSec. The (total - start) delta
    // grows by dtSec, which makes `lapFractionOf` advance by
    // dtSec / lastLapTime each call. The next `stepLap` will
    // reconcile lapsDone, pit state, fail state, etc.
    for (const car of this.cars) {
      if (car.retired || car.finished) continue
      if (car.lastLapTime <= 0) continue
      car.totalTime += dtSec
      car.lapStartTime += dtSec
    }
    return events
  }

  /** Results — valid after finish; classified DNFs at 90% distance. */
  results(): Array<{ driverId: string; teamId: string; finishPosition: number; classified: boolean; lapsCompleted: number; bestLapTime?: number; pitStops: number; points: number; fastestLap: boolean; dnfReason?: string }> {
    const totalLaps = this.circuit.characteristics.laps
    const pointsTable = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
    const classified = [
      ...this.finishOrder,
      ...this.cars.filter((c) => c.retired && c.lapsDone >= Math.ceil(totalLaps * 0.9)).sort((a, b) => b.lapsDone - a.lapsDone),
    ]
    const out: ReturnType<LiveRaceEngine['results']> = []
    classified.forEach((car, i) => {
      const pos = i + 1
      out.push({
        driverId: car.driverId,
        teamId: car.teamId,
        finishPosition: pos,
        classified: true,
        lapsCompleted: car.lapsDone,
        bestLapTime: car.bestLapTime === Infinity ? undefined : round3(car.bestLapTime),
        pitStops: car.pitStops,
        points: (pos <= pointsTable.length ? pointsTable[pos - 1] : 0) + (car.driverId === this.fastestLapHolder && pos <= 10 ? 1 : 0),
        fastestLap: car.driverId === this.fastestLapHolder,
      })
    })
    for (const car of this.cars.filter((c) => c.retired && c.lapsDone < Math.ceil(totalLaps * 0.9))) {
      out.push({ driverId: car.driverId, teamId: car.teamId, finishPosition: 0, classified: false, lapsCompleted: car.lapsDone, pitStops: car.pitStops, points: 0, fastestLap: false, dnfReason: car.dnfReason })
    }
    return out
  }

  // ---- internals ----

  private playbookWantsPit(car: LiveCar, leaderLap: number): boolean {
    // Deterministic fallback logic when the player has not issued live commands
    const s = car.strategy
    const lapsLeft = this.circuit.characteristics.laps - car.lapsDone
    const comp = TYRES[car.tyre]

    if (isDry(car.tyre) && this.trackWetness > 0.22) {
      const dryDelta = tyreWetnessDelta(car.tyre, this.trackWetness)
      const bestWet = this.trackWetness > 0.65 ? 'wet' : 'inter'
      const gain = dryDelta - tyreWetnessDelta(bestWet, this.trackWetness)
      if (gain > 0.6 && lapsLeft * gain > this.circuit.characteristics.pitLossSeconds * 1.1) {
        car.requestedCompound = bestWet
        return true
      }
    }
    if (!isDry(car.tyre) && this.trackWetness < 0.12) {
      const gain = tyreWetnessDelta(car.tyre, this.trackWetness) - tyreWetnessDelta('medium', this.trackWetness)
      if (gain > 1.2) { car.requestedCompound = 'medium'; return true }
    }
    if (car.tyreWear > comp.wearCliff + 0.07 && lapsLeft > 2) return true
    if (this.scLaps > 0 || this.vscLaps > 0) {
      for (const rule of s.safetyCarRules) {
        if (rule.enabled && rule.kind === 'safetyCarPit' && car.tyreAge >= (rule.params.minTyreAge ?? 6) && leaderLap <= (rule.params.maxLapFraction ?? 0.7) * this.circuit.characteristics.laps) {
          return true
        }
      }
    }
    for (let i = 0; i < s.plannedStints.length; i++) {
      if (car.stintPlansUsed.has(i)) continue
      const stint = s.plannedStints[i]
      if (car.lapsDone >= stint.fromLap && car.lapsDone <= stint.fromLap + 4) {
        car.stintPlansUsed.add(i)
        car.requestedCompound = stint.compound
        return true
      }
    }
    if (car.pitStops === 0 && lapsLeft > 12) {
      const projected = car.tyreWear + comp.degradationPerLap * (1 + (this.circuit.characteristics.tyreStress - 50) / 160) * lapsLeft
      if (projected > comp.wearCliff + 0.05 && car.lapsDone > this.circuit.characteristics.laps * 0.33) return true
    }
    return false
  }

  private tryOvertakes(ordered: LiveCar[], car: LiveCar) {
    const idx = ordered.indexOf(car)
    if (idx <= 0) return
    const ahead = ordered[idx - 1]
    if (!ahead || ahead.retired) return
    // Team order: don't fight teammate
    if (ahead.driverId === car.teammateId) {
      if (car.teamOrder === 'doNotFightTeammate' || car.teamOrder === 'holdPosition') return
      if (car.teamOrder === 'prioritizeChampionshipContender' || car.teamOrder === 'prioritizeDriverA') {
        // car is the beneficiary? then allowed, otherwise hold
        const target = car.orderTargetDriverId ?? car.teammateId
        if (target === ahead.driverId) return
      }
    }
    const gapSec = ahead.totalTime - car.totalTime
    if (gapSec <= 0 || gapSec > 2.8) return
    const closeness = 1 - gapSec / 3.0
    const c = this.circuit.characteristics
    const sectorOvt = this.circuit.sectors[(car.lapsDone + car.gridPos) % this.circuit.sectors.length].overtakingChance
    const attacker = this.drivers[car.driverId]!
    const defender = this.drivers[ahead.driverId]!
    const chance =
      closeness *
      (1 - c.overtakingDifficulty / 130) *
      (0.35 + sectorOvt * 0.65) *
      (0.6 + (attacker.visible.overtaking - 60) / 90) *
      (0.9 - (defender.visible.defending - 60) / 160) *
      (car.damage > 0.25 ? 0.6 : 1) *
      (ahead.damage > 0.25 ? 1.5 : 1) *
      (this.trackWetness > 0.4 ? 1.2 : 1) *
      (this.scLaps > 0 || this.vscLaps > 0 ? 0 : 1)
    if (chance > 0 && this.rng.chance(clamp(chance, 0, 0.9))) {
      ;[ordered[idx - 1], ordered[idx]] = [ordered[idx], ordered[idx - 1]]
      ahead.position = idx + 1
      car.position = idx
      this.events.push(this.mkEvent(car.totalTime, 'overtake', car, `${this.name(car.driverId)} passes ${this.name(ahead.driverId)}`, { newPosition: car.position }))
    }
  }

  private retire(car: LiveCar, reason: string) {
    car.retired = true
    car.dnfReason = reason
    this.events.push(this.mkEvent(car.totalTime, 'retirement', car, `${this.name(car.driverId)} retires — ${reason}`))
  }

  private maybeDeploySafetyCar(hit: boolean) {
    if (!hit || this.scLaps > 0 || this.vscLaps > 0) return
    if (this.rng.chance(0.62)) {
      this.scLaps = this.rng.int(3, 6)
      this.scCount++
      this.events.push(this.mkEvent(this.simTime, 'safetyCar', null, 'Safety Car deployed'))
    } else {
      this.vscLaps = this.rng.int(2, 4)
      this.vscCount++
      this.events.push(this.mkEvent(this.simTime, 'virtualSafetyCar', null, 'Virtual Safety Car deployed'))
    }
  }

  private pushEvent(type: RaceEventType, car: LiveCar | null, detail: string, data?: Record<string, number | string>) {
    this.events.push(this.mkEvent(this.simTime, type, car, detail, data))
  }

  private mkEvent(t: number, type: RaceEventType, car: LiveCar | null, detail: string, data?: Record<string, number | string>): RaceEvent {
    return { t, type, driverId: car?.driverId, teamId: car?.teamId, detail, data }
  }
}

// ---------------------------------------------------------------------------
// Team order application with driver agency hook
// ---------------------------------------------------------------------------

export interface ComplianceContext {
  /** 0..100 — computed by the driver agency system. */
  compliance: number
  reasons: string[]
}

/** Overridable compliance calculator (set by driver-agency module). */
export let complianceCalculator: (car: LiveCar, cmd: Omit<LiveCommand, 't' | 'applied' | 'note'>, engine: LiveRaceEngine) => ComplianceContext = () => ({ compliance: 100, reasons: [] })

export function setComplianceCalculator(fn: typeof complianceCalculator) {
  complianceCalculator = fn
}

function applyTeamOrder(car: LiveCar, cmd: Omit<LiveCommand, 't' | 'applied' | 'note'>, engine: LiveRaceEngine, entry: LiveCommand): { ok: boolean; response: string } {
  const ctx = complianceCalculator(car, cmd, engine)
  const roll = engine['rng'].next() * 100
  const compliant = roll < ctx.compliance
  const name = engine.name(car.driverId)

  switch (cmd.command) {
    case 'TEAM_ORDER_FREE':
      car.teamOrder = 'freeToRace'
      car.orderTargetDriverId = undefined
      engine['commandLog'].push(entry)
      return { ok: true, response: 'Free to race.' }
    case 'TEAM_ORDER_HOLD':
      car.teamOrder = 'holdPosition'
      engine['commandLog'].push(entry)
      return { ok: true, response: 'Holding position.' }
    case 'TEAM_ORDER_DO_NOT_FIGHT':
      car.teamOrder = 'doNotFightTeammate'
      engine['commandLog'].push(entry)
      if (compliant) {
        engine['radio'](car, "Understood — I'll back off.", 'confirm')
        return { ok: true, response: `${name} acknowledges: don't fight teammate.` }
      }
      engine['radio'](car, "Why? I'm faster than him!", 'refusal')
      return { ok: true, response: `${name} refuses — ${ctx.reasons.join('; ') || 'no reason given'}` }
    case 'TEAM_ORDER_SWAP': {
      car.teamOrder = 'prioritizeDriverA'
      car.orderTargetDriverId = cmd.targetDriverId ?? car.teammateId
      engine['commandLog'].push(entry)
      if (compliant) {
        engine['radio'](car, "…fine. I'll let him by at the end of the straight.", 'confirm')
        return { ok: true, response: `${name} will yield position.` }
      }
      engine['radio'](car, "No. I'm not moving over.", 'refusal')
      return { ok: true, response: `${name} REFUSES to swap — ${ctx.reasons.join('; ') || 'no reason given'}` }
    }
    case 'TEAM_ORDER_PRIORITY_DRIVER': {
      car.teamOrder = 'prioritizeDriverA'
      car.orderTargetDriverId = cmd.targetDriverId ?? car.teammateId
      engine['commandLog'].push(entry)
      return { ok: true, response: 'Priority acknowledged.' }
    }
    default:
      return { ok: false, response: 'Unknown team order.' }
  }
}

// ---------------------------------------------------------------------------
// Shared helpers (mirror race-sim model)
// ---------------------------------------------------------------------------

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function computePace(pkg: RacePackage, driver: Driver, circuit: Circuit): number {
  const perf = applySetup(pkg.carPerformance, pkg.setup)
  const carPace = carPaceForCircuitLive(perf, circuit)
  const driverFactor = driver.visible.pace + driver.dynamic.form * 3 + (driver.dynamic.morale - 60) * 0.06 + (driver.dynamic.confidence - 60) * 0.04
  return clamp(carPace * 0.62 + driverFactor * 0.38, 20, 110)
}

function applySetup(perf: import('../core/types').CarPerformance, setup: SetupChoice): import('../core/types').CarPerformance {
  const p = { ...perf }
  const df = setup.downforceBias
  p.lowSpeedAero += df * 1.1
  p.mediumSpeedAero += df * 1.4
  p.highSpeedAero += df * 1.2
  p.drag += df * 1.5
  p.straightLineSpeed -= df * 1.3
  const mg = setup.mechanicalGripBias
  p.traction += mg * 1.4
  p.braking += mg * 1.0
  p.straightLineSpeed -= mg * 0.6
  return p
}

function carPaceForCircuitLive(car: import('../core/types').CarPerformance, circuit: Circuit): number {
  const c = circuit.characteristics
  const w = (x: number) => x / 100
  const totalW = w(c.lowSpeed) + w(c.mediumSpeed) + w(c.highSpeed)
  const aeroAvg = (car.lowSpeedAero * w(c.lowSpeed) + car.mediumSpeedAero * w(c.mediumSpeed) + car.highSpeedAero * w(c.highSpeed)) / Math.max(totalW, 0.01)
  const straight = (car.straightLineSpeed - car.drag * 0.6) * w(c.straightLine)
  const mech = car.braking * w(c.brakingStress) + car.traction * (1 - w(c.brakingStress))
  return clamp(aeroAvg * 0.55 + straight * 0.2 + mech * 0.15 + car.energyEfficiency * 0.05 + car.reliability * 0.05, 0, 100)
}

function liveLapTime(
  car: LiveCar,
  driver: Driver,
  trackWetness: number,
  rng: Rng,
  safetyCar: boolean,
  vsc: boolean,
): { time: number; events: Array<{ type: RaceEventType; detail: string; data?: Record<string, number | string> }> } {
  const events: Array<{ type: RaceEventType; detail: string; data?: Record<string, number | string> }> = []
  const BASE = 88
  let t = BASE - (car.paceScore - 70) * 0.42
  t += tyreWetnessDelta(car.tyre, trackWetness)
  const comp = TYRES[car.tyre]
  if (car.tyreAge < comp.warmupLaps) t += (comp.warmupLaps - car.tyreAge) * 0.9
  if (car.tyreWear > comp.wearCliff) t += (car.tyreWear - comp.wearCliff) * 26
  t += car.fuelKg * 0.03
  t += car.strategy.paceMode === 'attack' ? -0.65 : car.strategy.paceMode === 'push' ? -0.3 : car.strategy.paceMode === 'conserve' ? 0.75 : 0
  // Practice bonus: positive number is seconds removed per lap (faster),
  // negative is added per lap. Scale conservatively.
  t -= car.practiceBonus
  t += car.strategy.energy === 'deploy' ? -0.15 : car.strategy.energy === 'harvest' ? 0.18 : 0
  t += car.damage * 6
  t += (1 - car.componentCondition) * 2.2
  const sigma = (100 - driver.visible.consistency) * 0.026 + 0.12
  t += rng.gauss(0, sigma)
  if (rng.chance(clamp((100 - driver.visible.consistency) * 0.0007 + (car.aggression - 50) * 0.0003 + trackWetness * 0.003, 0.001, 0.04))) {
    t += rng.range(0.4, 2.2)
    events.push({ type: 'lockup', detail: `${driver.lastName} locks up into turn one` })
  }
  const spinChance = clamp(
    (car.aggression - 45) * 0.00016 + (100 - driver.visible.consistency) * 0.00015 +
    trackWetness * (driver.visible.wetSkill < 78 ? 0.0035 : 0.0012) + car.damage * 0.002 +
    (88 - car.componentCondition * 100) * 0.00004,
    0.0003, 0.016,
  )
  if (rng.chance(spinChance)) {
    if (rng.chance(0.22 + car.damage * 0.3)) {
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

function isDryCompound(t: TyreCompoundId): boolean {
  return t === 'soft' || t === 'medium' || t === 'hard'
}

function isDry(t: TyreCompoundId): boolean {
  return isDryCompound(t)
}

function pickFreshCompound(currentWetness: number, rng: Rng): TyreCompoundId {
  if (currentWetness > 0.7) return 'wet'
  if (currentWetness > 0.25) return 'inter'
  return rng.chance(0.5) ? 'medium' : 'hard'
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function fmtLap(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}
