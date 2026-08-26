import { createRng, fnv1a } from '../core/rng'
import { SPONSORS } from '../core/content'
import {
  PART_SLOTS,
  PART_SLOT_NAMES,
  type Championship,
  type DevelopmentProject,
  type Driver,
  type DriverId,
  type FacilityUpgrade,
  type PartSlotId,
  type RacePackage,
  type QualifyingPackage,
  type RoundState,
  type SetupChoice,
  type StaffMember,
  type StaffRoleId,
  type StrategyPlaybook,
  type Team,
  type TeamId,
} from '../core/types'

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

// ---------------------------------------------------------------------------
// Race packages — immutable snapshots at lock time
// ---------------------------------------------------------------------------

export function buildRacePackage(champ: Championship, team: Team, round: RoundState): RacePackage {
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const perf = structuredClone(team.carPerformance)
  const setup = defaultSetup()
  return finalizePackage({
    championshipId: champ.id,
    roundId: `${round.index}`,
    teamId: team.id,
    drivers: team.driverIds.map((d) => ({ driverId: d, instructions: '' })),
    selectedParts: Object.fromEntries(PART_SLOTS.map((s) => [s, team.parts[s]?.name ?? `Standard ${PART_SLOT_NAMES[s]}`])) as RacePackage['selectedParts'],
    carPerformance: perf,
    componentWear: Object.fromEntries(PART_SLOTS.map((s) => [s, 0])) as RacePackage['componentWear'],
    setup,
    tyreAllocation: { soft: 4, medium: 4, hard: 3, inter: 3, wet: 2 },
    strategy: defaultStrategy(circuit.characteristics.laps),
    reliability: clamp(perf.reliability + staffBonusFor(team, 'raceEngineer') * 0.1, 10, 99),
    staffModifiers: {
      strategySkill: staffSkill(team, 'strategist'),
      pitCrewSkill: staffSkill(team, 'pitOperations'),
      engineerSkill: staffSkill(team, 'raceEngineer'),
    },
    weatherForecast: forecastForRound(champ, round),
    version: 1,
    lockedAt: Date.now(),
  })
}

export function finalizePackage(pkg: Omit<RacePackage, 'hash'>): RacePackage {
  // Deterministic hash of the package content
  const hash = fnv1a(JSON.stringify({ ...pkg, hash: '' }))
  return { ...pkg, hash }
}

export function buildQualifyingPackage(champ: Championship, team: Team, round: RoundState): QualifyingPackage {
  const perf = structuredClone(team.carPerformance)
  return {
    championshipId: champ.id,
    roundId: `${round.index}`,
    teamId: team.id,
    driverIds: [...team.driverIds],
    carPerformance: perf,
    setup: defaultSetup(),
    qualiTyre: 'soft',
    version: 1,
    hash: fnv1a(`${champ.id}|${round.index}|${team.id}|quali|${JSON.stringify(perf)}`),
  }
}

export function defaultSetup(): SetupChoice {
  return { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 }
}

export function defaultStrategy(laps: number): StrategyPlaybook {
  return {
    startingTyre: 'medium',
    plannedStints: [{ fromLap: Math.max(8, Math.floor(laps * 0.45)), compound: 'hard' }],
    weatherRules: [{ id: 'wet-auto', description: 'Switch to rain tyres when track wetness crosses threshold', kind: 'wetSwitch', enabled: true, params: { threshold: 25 } }],
    safetyCarRules: [{ id: 'sc-pit', description: 'Pit under Safety Car if tyres are old enough', kind: 'safetyCarPit', enabled: true, params: { minTyreAge: 6, maxLapFraction: 0.7 } }],
    lateRaceRules: [],
    paceMode: 'normal',
    tyreUsage: 'standard',
    energy: 'balanced',
    teamOrder: 'freeToRace',
  }
}

export function forecastForRound(champ: Championship, round: RoundState): { condition: 'dry' | 'cloud' | 'lightRain' | 'heavyRain'; rainProbability: number; confidence: number } {
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)
  const baseRain = circuit?.characteristics.rainProbability ?? 0.15
  const rng = createRng((champ.rngSeed ^ (round.index * 7919)) >>> 0)
  const jitter = rng.gauss(0, 0.06)
  const rainProbability = Math.max(0, Math.min(0.95, baseRain + jitter))
  const condition =
    rainProbability > 0.5 ? 'lightRain' : rainProbability > 0.25 ? 'cloud' : 'dry'
  return { condition, rainProbability, confidence: 0.7 }
}

// ---------------------------------------------------------------------------
// Staff helpers
// ---------------------------------------------------------------------------

export function staffOfRole(team: Team, role: StaffRoleId, pool: StaffMember[]): StaffMember | undefined {
  return team.staffIds
    .map((id) => pool.find((s) => s.id === id))
    .filter((s): s is StaffMember => !!s && s.role === role && !s.retired)
    .sort((a, b) => b.skill - a.skill)[0]
}

export function staffSkill(team: Team, role: StaffRoleId): number {
  const s = staffOfRole(team, role, [])
  void s
  return 70 // fallback; real lookup needs the pool
}

export function staffSkillWithPool(team: Team, role: StaffRoleId, pool: StaffMember[]): number {
  const s = staffOfRole(team, role, pool)
  return s ? s.skill : 50
}

export function staffBonusFor(_team: Team, _role: string): number {
  return 0
}

// ---------------------------------------------------------------------------
// Standings & points
// ---------------------------------------------------------------------------

export interface PointsAccumulator {
  driverPoints: Map<DriverId, number>
  teamPoints: Map<TeamId, number>
  driverWins: Map<DriverId, number>
  teamWins: Map<TeamId, number>
  driverPodiums: Map<DriverId, number>
  teamPodiums: Map<TeamId, number>
}

export function computeStandings(champ: Championship): PointsAccumulator & { driverRows: Array<{ driverId: string; points: number; wins: number; podiums: number }>; teamRows: Array<{ teamId: string; points: number; wins: number; podiums: number }> } {
  const acc: PointsAccumulator = {
    driverPoints: new Map(), teamPoints: new Map(), driverWins: new Map(), teamWins: new Map(), driverPodiums: new Map(), teamPodiums: new Map(),
  }
  for (const t of champ.teams) {
    acc.teamPoints.set(t.id, 0); acc.teamWins.set(t.id, 0); acc.teamPodiums.set(t.id, 0)
  }
  for (const dId of Object.keys(champ.drivers)) {
    acc.driverPoints.set(dId, 0); acc.driverWins.set(dId, 0); acc.driverPodiums.set(dId, 0)
  }
  for (const round of champ.rounds) {
    if (!round.raceDone || !round.raceResult) continue
    for (const r of round.raceResult.results) {
      if (!r.classified) continue
      acc.driverPoints.set(r.driverId, (acc.driverPoints.get(r.driverId) ?? 0) + r.points)
      acc.teamPoints.set(r.teamId, (acc.teamPoints.get(r.teamId) ?? 0) + r.points)
      if (r.finishPosition === 1) {
        acc.driverWins.set(r.driverId, (acc.driverWins.get(r.driverId) ?? 0) + 1)
        acc.teamWins.set(r.teamId, (acc.teamWins.get(r.teamId) ?? 0) + 1)
      }
      if (r.finishPosition >= 1 && r.finishPosition <= 3) {
        acc.driverPodiums.set(r.driverId, (acc.driverPodiums.get(r.driverId) ?? 0) + 1)
        acc.teamPodiums.set(r.teamId, (acc.teamPodiums.get(r.teamId) ?? 0) + 1)
      }
    }
  }
  const driverRows = [...acc.driverPoints.entries()]
    .map(([driverId, points]) => ({ driverId, points, wins: acc.driverWins.get(driverId) ?? 0, podiums: acc.driverPodiums.get(driverId) ?? 0 }))
    .filter((r) => champ.drivers[r.driverId])
    .sort((a, b) => b.points - a.points || b.wins - a.wins)
  const teamRows = [...acc.teamPoints.entries()]
    .map(([teamId, points]) => ({ teamId, points, wins: acc.teamWins.get(teamId) ?? 0, podiums: acc.teamPodiums.get(teamId) ?? 0 }))
    .filter((r) => champ.teams.some((t) => t.id === r.teamId))
    .sort((a, b) => b.points - a.points || b.wins - a.wins)
  return { ...acc, driverRows, teamRows }
}

// ---------------------------------------------------------------------------
// Economy — per-round settlement
// ---------------------------------------------------------------------------

export function settleRoundFinances(champ: Championship, roundIndex: number): string[] {
  const news: string[] = []
  for (const team of champ.teams) {
    let income = 0
    let expenses = 0
    // Sponsor payments with position bonuses
    const result = champ.rounds[roundIndex].raceResult
    for (const sc of team.sponsors) {
      income += sc.basePaymentPerRace
      const bestFinish = result
        ? result.results.filter((r) => r.teamId === team.id && r.classified).map((r) => r.finishPosition).sort((a, b) => a - b)[0]
        : undefined
      if (bestFinish !== undefined && bestFinish <= sc.expectationPosition) {
        income += sc.positionBonus * (sc.expectationPosition - bestFinish + 1)
      }
    }
    // Prize money by constructors position proxy: use per-race points
    const roundPoints = result
      ? result.results.filter((r) => r.teamId === team.id).reduce((sum, r) => sum + r.points, 0)
      : 0
    income += roundPoints * 45

    // Salaries (per-round fraction of season)
    for (const dId of team.driverIds) {
      const drv = champ.drivers[dId]
      if (drv?.contract) expenses += drv.contract.salaryPerSeason / champ.config.numberOfRaces
    }
    const staffPool = champ.staffPool
    for (const sid of team.staffIds) {
      const st = staffPool.find((s) => s.id === sid)
      if (st?.contract) expenses += st.contract.salaryPerSeason / champ.config.numberOfRaces
    }

    // Operations baseline
    expenses += 120

    team.money += Math.round((income - expenses) * champ.config.economySpeed)

    if (team.money < 0 && !news.some((n) => n.includes(team.name))) {
      news.push(`⚠ ${team.name} is in financial trouble (${fmtMoney(team.money)})`)
    }
  }
  return news
}

export function fmtMoney(thousands: number): string {
  if (Math.abs(thousands) >= 1000) {
    const m = thousands / 1000
    return `$${m.toFixed(1)}M`
  }
  return `$${thousands.toFixed(0)}K`
}

// ---------------------------------------------------------------------------
// Development
// ---------------------------------------------------------------------------

const DEV_BASE_COST: Record<string, number> = {
  frontWing: 900, rearWing: 900, floor: 1400, chassis: 2000, suspension: 700, cooling: 800,
}
const DEV_BASE_WEEKS = 6

let devCounter = 0

export function startDevelopment(
  team: Team,
  slot: PartSlotId,
  modifiers: import('../core/types').PartStatModifiers,
  opts?: { costScale?: number },
): DevelopmentProject | null {
  const cost = Math.round((DEV_BASE_COST[slot] ?? 1000) * (opts?.costScale ?? 1))
  if (team.money < cost) return null
  team.money -= cost
  const weeks = DEV_BASE_WEEKS
  const project: DevelopmentProject = {
    id: `dev.${Date.now().toString(36)}.${(devCounter++).toString(36)}`,
    slot,
    name: `${PART_SLOT_NAMES[slot]} Mk${seasonLetter()}`,
    modifiers,
    costTotal: cost,
    weeksRemaining: weeks,
    weeksTotal: weeks,
    produced: false,
  }
  return project
}

function seasonLetter(): string {
  return String.fromCharCode(65 + ((Date.now() / 60000) | 0) % 26)
}

export function tickDevelopment(teams: Team[]): string[] {
  const done: string[] = []
  for (const team of teams) {
    const projects = getProjects(team)
    for (const p of projects) {
      p.weeksRemaining -= 1
      if (p.weeksRemaining <= 0) {
        p.produced = true
        applyPartToTeam(team, p)
        done.push(`${team.name}: ${p.name} is ready to fit`)
      }
    }
    setProjects(team, projects.filter((p) => !p.produced))
  }
  return done
}

/** Projects live on the team object under a hidden key for simplicity. */
const PROJECTS_KEY = '__devProjects'
export function getProjects(team: Team): DevelopmentProject[] {
  return ((team as unknown as Record<string, unknown>)[PROJECTS_KEY] as DevelopmentProject[]) ?? []
}
export function setProjects(team: Team, list: DevelopmentProject[]) {
  ;(team as unknown as Record<string, unknown>)[PROJECTS_KEY] = list
}

export function applyPartToTeam(team: Team, project: DevelopmentProject) {
  team.parts[project.slot] = {
    slot: project.slot,
    name: project.name,
    modifiers: project.modifiers,
    costToProduce: project.costTotal,
    buildWeeks: project.weeksTotal,
    riskOfFailure: 0.05,
    seasonDesigned: 1,
  }
  recalcTeamPerformance(team)
}

export function fitBestParts(team: Team) {
  recalcTeamPerformance(team)
}

export function recalcTeamPerformance(team: Team) {
  // Start from a stored base performance and add part modifiers.
  const BASE_KEY = '__basePerf'
  const self = team as unknown as Record<string, unknown>
  if (!self[BASE_KEY]) self[BASE_KEY] = structuredClone(team.carPerformance)
  const base = structuredClone(self[BASE_KEY]) as Team['carPerformance']
  for (const slot of PART_SLOTS) {
    const part = team.parts[slot]
    if (!part) continue
    for (const [k, v] of Object.entries(part.modifiers)) {
      base[k as keyof typeof base] = clampStat(base[k as keyof typeof base] + (v ?? 0))
    }
  }
  team.carPerformance = base
}

function clampStat(v: number): number {
  return Math.max(5, Math.min(99, v))
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

export function facilityUpgradeCost(level: number): number {
  return Math.round(2200 * Math.pow(1.75, level))
}

const UPGRADES_KEY = '__facilityUpgrades'
export function getFacilityUpgrades(team: Team): FacilityUpgrade[] {
  return ((team as unknown as Record<string, unknown>)[UPGRADES_KEY] as FacilityUpgrade[]) ?? []
}
export function setFacilityUpgrades(team: Team, list: FacilityUpgrade[]) {
  ;(team as unknown as Record<string, unknown>)[UPGRADES_KEY] = list
}

export function startFacilityUpgrade(team: Team, facilityId: string, currentLevel: number): boolean {
  if (currentLevel >= 5) return false
  const cost = facilityUpgradeCost(currentLevel)
  if (team.money < cost) return false
  team.money -= cost
  const list = getFacilityUpgrades(team)
  list.push({
    facilityId: facilityId as never,
    targetLevel: currentLevel + 1,
    costTotal: cost,
    weeksRemaining: 4,
    weeksTotal: 4,
  })
  setFacilityUpgrades(team, list)
  return true
}

export function tickFacilities(teams: Team[], rngSeed: number): string[] {
  const rng = createRng(rngSeed)
  const news: string[] = []
  for (const team of teams) {
    const upgrades = getFacilityUpgrades(team)
    for (const u of upgrades) {
      u.weeksRemaining -= 1
      if (u.weeksRemaining <= 0) {
        team.facilities[u.facilityId] = u.targetLevel
        news.push(`${team.name} completed ${u.facilityId} upgrade to level ${u.targetLevel}`)
      }
    }
    setFacilityUpgrades(team, upgrades.filter((u) => u.weeksRemaining > 0))
    void rng
  }
  return news
}

// ---------------------------------------------------------------------------
// Contracts & driver market
// ---------------------------------------------------------------------------

export interface OfferInput {
  fromTeamId: TeamId
  toDriverId: DriverId
  salaryPerSeason: number
  seasons: number
}

/**
 * Deterministic multi-team resolution: the driver evaluates ALL offers and
 * picks by weighted preference. Returns the winning offer + reasons.
 */
export function resolveDriverOffers(
  champ: Championship,
  offers: OfferInput[],
  season: number,
): { winner?: OfferInput; reason: string; evaluated: Array<{ offer: OfferInput; score: number }> } {
  const evaluated = offers.map((offer) => {
    const team = champ.teams.find((t) => t.id === offer.fromTeamId)
    const driver = champ.drivers[offer.toDriverId]
    if (!team || !driver) return { offer, score: -Infinity }
    let score = 0
    score += (offer.salaryPerSeason / Math.max(driver.salaryDemandBase, 1)) * 40
    score += (team.reputation - 50) * 0.6
    score += (avgCarPaceOf(team) - 60) * 1.2
    score -= offer.seasons <= 1 ? 5 : 0
    score += driver.hidden.loyalty > 65 && driver.contract?.teamId === offer.fromTeamId ? 12 : 0
    const rng = createRng(fnv1aInt(`${offer.toDriverId}|${offer.fromTeamId}|${season}`))
    score += rng.gauss(0, 6)
    return { offer, score: Math.round(score * 10) / 10 }
  })
  const sorted = [...evaluated].sort((a, b) => b.score - a.score)
  const winner = sorted[0]?.score > -Infinity ? sorted[0].offer : undefined
  return {
    winner,
    reason: winner
      ? `Signed with ${champ.teams.find((t) => t.id === winner.fromTeamId)?.name} — best combination of salary, competitiveness and project appeal`
      : 'No acceptable offer received',
    evaluated,
  }
}

function avgCarPaceOf(team: Team): number {
  const vals = Object.values(team.carPerformance)
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function fnv1aInt(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function signDriver(champ: Championship, team: Team, driverId: DriverId, salary: number, seasons: number, season: number): string | null {
  const driver = champ.drivers[driverId]
  if (!driver) return 'Driver not found'
  if (driver.contract) releaseDriver(champ, driverId)
  // Replace weakest current driver if the team already has two
  if (team.driverIds.length >= 2) {
    const weakest = team.driverIds
      .map((id) => champ.drivers[id])
      .filter(Boolean)
      .sort((a, b) => paceOf(a) - paceOf(b))[0]
    if (weakest) releaseDriver(champ, weakest.id)
    team.driverIds = team.driverIds.filter((id) => id !== weakest?.id)
  }
  driver.contract = { teamId: team.id, salaryPerSeason: salary, seasonsRemaining: seasons, signedSeason: season }
  team.driverIds.push(driverId)
  return null
}

export function releaseDriver(champ: Championship, driverId: DriverId) {
  const driver = champ.drivers[driverId]
  if (!driver) return
  for (const team of champ.teams) {
    team.driverIds = team.driverIds.filter((id) => id !== driverId)
  }
  driver.contract = undefined
}

export function paceOf(d: Driver): number {
  return d.visible.pace + d.dynamic.form * 3 + (d.dynamic.morale - 60) * 0.05
}

// ---------------------------------------------------------------------------
// Season progression
// ---------------------------------------------------------------------------

export function endSeason(champ: Championship): { championDriver: string; championTeam: string } {
  const standings = computeStandings(champ)
  const championDriver = standings.driverRows[0]?.driverId ?? ''
  const championTeam = standings.teamRows[0]?.teamId ?? ''
  champ.history.push({
    season: champ.config.season,
    championTeamId: championTeam,
    championDriverId: championDriver,
    driverStandings: standings.driverRows.map((r) => ({ driverId: r.driverId, points: r.points })),
    teamStandings: standings.teamRows.map((r) => ({ teamId: r.teamId, points: r.points })),
    raceWinners: champ.rounds.filter((r) => r.raceResult).map((r) => ({
      roundIndex: r.index,
      circuitId: r.circuitId,
      driverId: r.raceResult!.results[0].driverId,
      teamId: r.raceResult!.results[0].teamId,
    })),
  })

  // Contract countdown, retirements, sponsor renewals
  for (const driver of Object.values(champ.drivers)) {
    if (driver.contract) driver.contract.seasonsRemaining--
    driver.age++
    // Development/decline
    developDriver(champ, driver)
    if (driver.age > 38 || (driver.age > 34 && driver.visible.pace < 68)) {
      driver.retired = true
      if (driver.contract) releaseDriver(champ, driver.id)
    }
  }
  // Replace retirees with generated rookies so grids stay full
  const retiredList = Object.values(champ.drivers).filter((d) => d.retired)
  for (const ret of retiredList) {
    delete champ.drivers[ret.id]
  }
  const missingSeats: Array<{ team: Team; seat: number }> = []
  for (const team of champ.teams) {
    while (team.driverIds.length < 2) missingSeats.push({ team, seat: team.driverIds.length })
  }
  let rookieSeed = champ.rngSeed ^ (champ.config.season * 2654435761)
  for (const seat of missingSeats) {
    const rookie = generateRookieDeterministic(rookieSeed, champ.config.season)
    champ.drivers[rookie.id] = rookie
    rookie.contract = { teamId: seat.team.id, salaryPerSeason: rookie.salaryDemandBase, seasonsRemaining: 2, signedSeason: champ.config.season }
    seat.team.driverIds.push(rookie.id)
    rookieSeed = (rookieSeed * 1103515245 + 12345) >>> 0
  }

  for (const st of champ.staffPool) {
    if (st.contract) st.contract.seasonsRemaining--
    if (st.contract && st.contract.seasonsRemaining <= 0) {
      st.contract.seasonsRemaining = 1 // auto-renew short deals for now
    }
  }
  for (const team of champ.teams) {
    for (const sc of team.sponsors) sc.seasonsRemaining--
    team.sponsors = team.sponsors.filter((s) => {
      if (s.seasonsRemaining > 0) return true
      // Try to replace with a fresh minor sponsor
      const candidates = SPONSORS.filter((sp) => sp.tier === 'minor' && !team.sponsors.some((x) => x.sponsorId === sp.id))
      if (candidates.length) {
        const next = candidates[0]
        team.sponsors.push({ sponsorId: next.id, basePaymentPerRace: 180, positionBonus: 12, expectationPosition: 10, championshipBonus: 800, reputationRequirement: 0, seasonsRemaining: 2 })
      }
      return false
    })
  }

  // New calendar
  champ.config.season++
  const rng = createRng((champ.rngSeed ^ (champ.config.season * 7717)) >>> 0)
  const ids: string[] = rng.shuffle([...champ.circuits.map((c) => c.id)])
  const rounds: string[] = []
  while (rounds.length < champ.config.numberOfRaces) rounds.push(...ids)
  champ.rounds = rounds.slice(0, champ.config.numberOfRaces).map((circuitId, index) => ({
    index,
    circuitId,
    phase: 'management',
    packagesLocked: false,
    qualifyingDone: false,
    raceDone: false,
    practiceBonus: {},
  }))
  champ.currentRoundIndex = 0
  champ.phase = 'management'

  addNews(champ, 'SEASON COMPLETE', `The ${champ.config.season - 1} season has concluded. A new campaign begins.`)
  return { championDriver, championTeam }
}

function developDriver(champ: Championship, d: Driver) {
  const ageFactor = d.age < 24 ? 1.2 : d.age < 29 ? 0.9 : d.age < 33 ? 0.35 : -(d.age - 32) * (d.hidden.declineRate / 55)
  const growth = (d.hidden.potential - d.visible.pace) * 0.09 * ageFactor * (d.hidden.developmentRate / 65) * (0.7 + d.dynamic.morale / 160)
  d.visible.pace = Math.round(clampN(d.visible.pace + growth, 30, d.hidden.potential))
  for (const k of ['racecraft', 'overtaking', 'defending', 'consistency'] as const) {
    const drift = ageFactor > 0 ? (growth / 2) * 0.6 : growth / 2.5
    d.visible[k] = Math.round(clampN(d.visible[k] + drift, 20, 99))
  }
  void champ
}

function clampN(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function generateRookieDeterministic(seed: number, season: number): import('../core/types').Driver {
  // Local deterministic rookie generator (mirrors core/content.generateRookie but standalone to avoid cycles)
  const rng = createRng(seed)
  const FIRST = ['Noah', 'Liam', 'Oscar', 'Hugo', 'Ravi', 'Kaito', 'Mateus', 'Viktor', 'Amir', 'Bruno', 'Theo', 'Elias']
  const LAST = ['Reyes', 'Kowalski', 'Tanaka', 'Duarte', 'Sharma', 'Yamada', 'Costa', 'Volkov', 'Nazari', 'Berg', 'Almeida', 'Moreau']
  const NATS = ['ESP', 'POL', 'JPN', 'POR', 'IND', 'BRA', 'SWE', 'FRA', 'USA', 'GER', 'MEX', 'AUS']
  const paceBase = rng.range(62, 74)
  const pot = Math.min(97, paceBase + rng.range(8, 26))
  const id = `gen.driver.${season}.${seed.toString(36)}`
  return {
    id,
    firstName: rng.pick(FIRST),
    lastName: rng.pick(LAST),
    nationality: rng.pick(NATS),
    age: rng.int(18, 23),
    visible: {
      pace: Math.round(paceBase), qualifying: Math.round(paceBase + rng.gauss(1)),
      racecraft: Math.round(paceBase - rng.range(2, 6)), overtaking: Math.round(paceBase + rng.gauss(0)),
      defending: Math.round(paceBase - rng.range(3, 8)), consistency: Math.round(paceBase - rng.range(2, 7)),
      wetSkill: Math.round(rng.range(58, 80)), tyreManagement: Math.round(paceBase - rng.range(1, 5)),
      feedback: Math.round(rng.range(58, 78)),
    },
    hidden: {
      potential: Math.round(pot), pressureResistance: Math.round(rng.range(52, 80)),
      aggression: Math.round(rng.range(40, 85)), adaptability: Math.round(rng.range(50, 85)),
      loyalty: Math.round(rng.range(35, 80)), ego: Math.round(rng.range(30, 80)),
      confidenceSensitivity: Math.round(rng.range(40, 80)), developmentRate: Math.round(rng.range(55, 90)),
      declineRate: Math.round(rng.range(35, 60)),
    },
    dynamic: { morale: 65, confidence: 55, form: 0, fatigue: 0, seasonsWithTeam: 0 },
    salaryDemandBase: Math.round(rng.range(900, 2400)),
    history: [],
  }
}

// ---------------------------------------------------------------------------
// News feed
// ---------------------------------------------------------------------------

export function addNews(champ: Championship, headline: string, body: string) {
  champ.newsFeed.unshift({
    id: `news.${Date.now().toString(36)}.${champ.newsFeed.length}`,
    season: champ.config.season,
    roundIndex: champ.currentRoundIndex,
    headline,
    body,
  })
  if (champ.newsFeed.length > 200) champ.newsFeed.pop()
}
