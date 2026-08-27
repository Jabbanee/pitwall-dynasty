import type { Driver, Team } from '../core/types'
import { clamp } from '../sim/live-race'
import { createRng } from '../core/rng'

/**
 * Driver Agency — drivers are autonomous characters with championship-scoped
 * dynamic state. In multiplayer every championship starts from a CLEAN
 * baseline: no grudges, no inherited morale, no history.
 */

// ---------- Memory events ----------

export type MemoryEventType =
  | 'PROMISED_EQUAL_STATUS'
  | 'PROMISE_BROKEN'
  | 'PROMISE_KEPT'
  | 'TEAM_ORDER_AGAINST_DRIVER'
  | 'TEAM_ORDER_FAVOURED_DRIVER'
  | 'PUBLIC_CRITICISM'
  | 'PUBLIC_PRAISE'
  | 'TEAMMATE_COLLISION'
  | 'TEAMMATE_HELPED_DRIVER'
  | 'FIRST_WIN'
  | 'CHAMPIONSHIP_SACRIFICE'
  | 'DRIVER_REPLACED'
  | 'DRIVER_PRIORITIZED'

export interface MemoryEvent {
  type: MemoryEventType
  /** 1 minor .. 5 severe */
  severity: number
  /** Championship round when it happened. */
  round: number
  /** Relationship/trust impact per event type at creation. */
  trustDelta: number
  moraleDelta: number
  /** Decays over rounds; removed below threshold. */
  decayPerRound: number
}

const MEMORY_TEMPLATES: Record<MemoryEventType, Omit<MemoryEvent, 'type' | 'round'>> = {
  PROMISED_EQUAL_STATUS: { severity: 2, trustDelta: 4, moraleDelta: 4, decayPerRound: 0.1 },
  PROMISE_BROKEN: { severity: 5, trustDelta: -25, moraleDelta: -18, decayPerRound: 0.05 },
  PROMISE_KEPT: { severity: 2, trustDelta: 10, moraleDelta: 8, decayPerRound: 0.08 },
  TEAM_ORDER_AGAINST_DRIVER: { severity: 3, trustDelta: -10, moraleDelta: -8, decayPerRound: 0.15 },
  TEAM_ORDER_FAVOURED_DRIVER: { severity: 2, trustDelta: 3, moraleDelta: 5, decayPerRound: 0.2 },
  PUBLIC_CRITICISM: { severity: 3, trustDelta: -8, moraleDelta: -10, decayPerRound: 0.12 },
  PUBLIC_PRAISE: { severity: 1, trustDelta: 4, moraleDelta: 6, decayPerRound: 0.2 },
  TEAMMATE_COLLISION: { severity: 4, trustDelta: -5, moraleDelta: -5, decayPerRound: 0.1 },
  TEAMMATE_HELPED_DRIVER: { severity: 2, trustDelta: 2, moraleDelta: 3, decayPerRound: 0.15 },
  FIRST_WIN: { severity: 3, trustDelta: 5, moraleDelta: 15, decayPerRound: 0 },
  CHAMPIONSHIP_SACRIFICE: { severity: 4, trustDelta: 8, moraleDelta: -12, decayPerRound: 0.08 },
  DRIVER_REPLACED: { severity: 5, trustDelta: -30, moraleDelta: -25, decayPerRound: 0 },
  DRIVER_PRIORITIZED: { severity: 3, trustDelta: -6, moraleDelta: -6, decayPerRound: 0.12 },
}

// ---------- Teammate relationship ----------

export type RelationshipState =
  | 'Close Friends' | 'Friendly' | 'Professional' | 'Neutral'
  | 'Tense' | 'Rivals' | 'Hostile'

export function relationshipLabel(score: number): RelationshipState {
  if (score >= 80) return 'Close Friends'
  if (score >= 65) return 'Friendly'
  if (score >= 50) return 'Professional'
  if (score >= 35) return 'Neutral'
  if (score >= 20) return 'Tense'
  if (score >= 8) return 'Rivals'
  return 'Hostile'
}

// ---------- Driver agency state (championship-scoped) ----------

export interface DriverDemand {
  kind:
    | 'number1Status' | 'equalStatus' | 'competitiveCar'
    | 'salary' | 'contractLength' | 'championshipTarget'
    | 'facilityStandard' | 'developmentInvestment'
  description: string
  satisfied: boolean
  /** Promise made at signing — breaking it has severe consequences. */
  promised: boolean
}

export interface DriverAgencyState {
  morale: number // 0..100
  trustInTeam: number // 0..100
  /** -100 (hostile) .. +100 (close), mapped to RelationshipState */
  teammateRelationship: number
  roleSatisfaction: number // 0..100 (Number 1 vs equal vs 2nd driver)
  contractSatisfaction: number
  championshipAmbition: number
  promises: Array<{ description: string; broken: boolean; round: number }>
  memory: MemoryEvent[]
  demands: DriverDemand[]
  mediaSentiment: number // -100..100
}

/** Fresh baseline for a new championship — multiplayer starts from zero. */
export function freshAgencyState(driver: Driver): DriverAgencyState {
  return {
    morale: clamp(driver.dynamic.morale, 30, 85),
    trustInTeam: 65,
    teammateRelationship: 50,
    roleSatisfaction: 60,
    contractSatisfaction: 65,
    championshipAmbition: 50 + Math.round((driver.hidden.potential - 75) * 0.8),
    promises: [],
    memory: [],
    demands: [],
    mediaSentiment: 0,
  }
}

// ---------- Agency store (per championship) ----------

export class DriverAgencyStore {
  /** driverId -> agency state. Scoped to ONE championship instance. */
  private states = new Map<string, DriverAgencyState>()
  private currentRound = 0

  ensure(driverId: string, driver: Driver): DriverAgencyState {
    let s = this.states.get(driverId)
    if (!s) {
      s = freshAgencyState(driver)
      this.states.set(driverId, s)
    }
    return s
  }

  get(driverId: string): DriverAgencyState | undefined {
    return this.states.get(driverId)
  }

  setRound(round: number) {
    this.currentRound = round
  }

  addMemory(driverId: string, driver: Driver, type: MemoryEventType, severityScale = 1) {
    const s = this.ensure(driverId, driver)
    const tpl = MEMORY_TEMPLATES[type]
    const ev: MemoryEvent = {
      type,
      severity: clamp(Math.round(tpl.severity * severityScale), 1, 5),
      round: this.currentRound,
      trustDelta: tpl.trustDelta * severityScale,
      moraleDelta: tpl.moraleDelta * severityScale,
      decayPerRound: tpl.decayPerRound,
    }
    s.memory.push(ev)
    s.trustInTeam = clamp(s.trustInTeam + ev.trustDelta, 0, 100)
    s.morale = clamp(s.morale + ev.moraleDelta, 0, 100)
    // Cap memory: keep the 12 most significant events
    if (s.memory.length > 12) {
      s.memory.sort((a, b) => b.severity - a.severity || b.round - a.round)
      s.memory.length = 12
    }
  }

  /** Teammate relationship changes flow through here for both drivers. */
  adjustTeammateRelationship(driverA: string, driverB: string, delta: number) {
    for (const id of [driverA, driverB]) {
      const s = this.states.get(id)
      if (s) s.teammateRelationship = clamp(s.teammateRelationship + delta, -100, 100)
    }
  }

  /** Advance decay between rounds; prune stale minor events. */
  tickRound() {
    for (const s of this.states.values()) {
      for (const ev of s.memory) {
        ev.severity = Math.max(0, ev.severity - ev.decayPerRound)
      }
      s.memory = s.memory.filter((ev) => ev.severity > 0.3)
      // Morale drifts toward a neutral 60 over time
      s.morale = clamp(s.morale + (60 - s.morale) * 0.08, 0, 100)
    }
  }

  /** Human-readable teammate relationship between a driver and their teammate. */
  teammateState(driverId: string): RelationshipState {
    const s = this.states.get(driverId)
    return relationshipLabel(s?.teammateRelationship ?? 50)
  }

  /**
   * Add a new promise made by the team to the driver (or vice-versa).
   * A broken promise causes severe morale/trust damage and a public
   * memory event.
   */
  addPromise(driverId: string, description: string) {
    const s = this.ensure(driverId, this.dummyDriver(driverId))
    s.promises.push({ description, broken: false, round: this.currentRound })
  }

  /**
   * Mark a promise as broken. Applies trust + morale penalty via memory
   * events. Idempotent — broken twice has no extra effect.
   */
  breakPromise(driverId: string, descriptionMatch: string) {
    const s = this.states.get(driverId)
    if (!s) return false
    const p = s.promises.find((x) => !x.broken && x.description.includes(descriptionMatch))
    if (!p) return false
    p.broken = true
    this.addMemory(driverId, this.dummyDriver(driverId), 'PROMISE_BROKEN', 1)
    return true
  }

  /** Issue a positive memory event (e.g. PROMISE_KEPT, PUBLIC_PRAISE). */
  recordPositive(driverId: string, type: MemoryEventType) {
    this.addMemory(driverId, this.dummyDriver(driverId), type, 1)
  }

  /** Record a sponsor/team-order decision that went against this driver. */
  recordNegative(driverId: string, type: MemoryEventType) {
    this.addMemory(driverId, this.dummyDriver(driverId), type, 1)
  }

  /** Driver demands that have been raised but not yet resolved. */
  demands(driverId: string): DriverDemand[] {
    return this.ensure(driverId, this.dummyDriver(driverId)).demands
  }

  private dummyDriver(id: string): Driver {
    return {
      id,
      firstName: id, lastName: id, nationality: '?', age: 25,
      gender: 'male',
      visible: { pace: 60, qualifying: 60, racecraft: 60, overtaking: 60, defending: 60, consistency: 60, wetSkill: 60, tyreManagement: 60, feedback: 60 },
      hidden: { potential: 60, pressureResistance: 60, aggression: 50, adaptability: 60, loyalty: 50, ego: 50, confidenceSensitivity: 50, developmentRate: 50, declineRate: 30 },
      dynamic: { morale: 60, confidence: 60, form: 0, fatigue: 0, seasonsWithTeam: 1 },
      salaryDemandBase: 0,
      history: [],
      eligibility: { driverId: id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: ['Insufficient points.'] },
    }
  }
}

/**
 * Build a fresh set of driver demands for a new championship based on the
 * driver's personality + market standing. Stable for a given driverId+seed.
 */
export function generateDriverDemands(driver: Driver, seed: number): DriverDemand[] {
  const rng = createRng((hashStr(driver.id + '|' + seed) >>> 0))
  const demands: DriverDemand[] = []
  // Ego drivers want number-1 status
  if (driver.hidden.ego > 70 && rng.chance(0.55)) {
    demands.push({ kind: 'number1Status', description: 'Number 1 driver status at the team', satisfied: false, promised: rng.chance(0.4) })
  }
  // Highly loyal + low ego drivers are happy with equal status
  if (driver.hidden.loyalty > 60 && driver.hidden.ego < 60 && rng.chance(0.4)) {
    demands.push({ kind: 'equalStatus', description: 'Equal status with teammate — no number 1', satisfied: false, promised: rng.chance(0.3) })
  }
  // Ambitious drivers want a competitive car / championship target
  if (driver.hidden.potential > 75 && rng.chance(0.6)) {
    demands.push({ kind: 'championshipTarget', description: 'Championship-contending car next season', satisfied: false, promised: rng.chance(0.3) })
  }
  // High salary expectations
  if (driver.visible.pace > 80 && rng.chance(0.5)) {
    demands.push({ kind: 'salary', description: 'Salary top-up to match market value', satisfied: false, promised: false })
  }
  return demands
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ---------------------------------------------------------------------------
// Compliance calculation
// ---------------------------------------------------------------------------

export interface ComplianceAssessment {
  /** 0..100 chance the driver follows the order. */
  compliance: number
  verdict: 'Very Likely' | 'Likely' | 'Uncertain' | 'Unlikely' | 'Very Unlikely'
  reasons: string[]
}

export function assessCompliance(
  driver: Driver,
  agency: DriverAgencyState,
  order: 'swap' | 'hold' | 'doNotFight' | 'priority',
  context: { teammateRelationship: number; isChampionshipContender: boolean; positionGap: number },
): ComplianceAssessment {
  const reasons: string[] = []
  let score = 70

  // Professionalism strongly drives compliance
  const professionalism = (driver.visible.feedback + driver.hidden.pressureResistance) / 2
  score += (professionalism - 60) * 0.5
  if (professionalism >= 80) reasons.push('high professionalism')
  if (professionalism < 45) reasons.push('low professionalism')

  // Ego and aggression resist yielding
  score -= (driver.hidden.ego - 50) * 0.4
  if (driver.hidden.ego > 75) reasons.push('large ego')
  score -= (driver.hidden.aggression - 50) * 0.25

  // Trust in team
  score += (agency.trustInTeam - 60) * 0.35
  if (agency.trustInTeam < 35) reasons.push('low trust in team')

  // Teammate relationship
  score += (context.teammateRelationship - 50) * 0.3
  if (context.teammateRelationship < 25) reasons.push('poor teammate relationship')
  if (context.teammateRelationship > 75) reasons.push('close teammate bond')

  // Promises: equal status promised → swap/hold against driver = near-refusal
  const equalPromise = agency.promises.find((p) => p.description.includes('equal status') && !p.broken)
  if (equalPromise && (order === 'swap' || order === 'priority')) {
    score -= 45
    reasons.push('promised equal status')
  }

  // Championship contention
  if (context.isChampionshipContender && order !== 'doNotFight') {
    score -= 30
    reasons.push('still in championship contention')
  }

  // Recent grievances
  const recentAgainst = agency.memory.filter((m) => m.type === 'TEAM_ORDER_AGAINST_DRIVER' || m.type === 'PROMISE_BROKEN').length
  if (recentAgainst >= 2) {
    score -= 15 * recentAgainst
    reasons.push('recent grievances against the team')
  }

  // Role satisfaction
  score += (agency.roleSatisfaction - 55) * 0.2

  score = clamp(Math.round(score), 0, 100)
  const verdict: ComplianceAssessment['verdict'] =
    score >= 85 ? 'Very Likely' : score >= 65 ? 'Likely' : score >= 40 ? 'Uncertain' : score >= 20 ? 'Unlikely' : 'Very Unlikely'
  return { compliance: score, verdict, reasons }
}

/** Convenience: wire the agency store into the live race engine. */
export function installAgencyCompliance(store: DriverAgencyStore, champ: { drivers: Record<string, Driver>; teams: Team[]; currentRoundIndex: number }) {
  // Lazy import avoided: setComplianceCalculator is sync
  const { setComplianceCalculator } = require_live()
  setComplianceCalculator((car, cmd, _engine) => {
    const driver = champ.drivers[car.driverId]
    if (!driver) return { compliance: 100, reasons: [] }
    const agency = store.ensure(car.driverId, driver)
    const order = cmd.command.includes('SWAP') ? 'swap' : cmd.command.includes('HOLD') ? 'hold' : cmd.command.includes('DO_NOT_FIGHT') ? 'doNotFight' : 'priority'
    // Championship contention: within 25 points of teammate in standings —
    // simplified here to championshipAmbition + morale proxy.
    const contender = agency.championshipAmbition > 70 && agency.morale > 55
    const assessment = assessCompliance(driver, agency, order, {
      teammateRelationship: agency.teammateRelationship,
      isChampionshipContender: contender,
      positionGap: 0,
    })
    return { compliance: assessment.compliance, reasons: assessment.reasons }
  })
}

function require_live(): typeof import('../sim/live-race') {
  // Circular-import-safe accessor
  return liveModule
}
import * as liveModule from '../sim/live-race'
