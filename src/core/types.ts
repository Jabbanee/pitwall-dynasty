/** Stable string IDs are authoritative everywhere. Names are display-only. */
export type Id = string

export type TeamId = Id
export type DriverId = Id
export type StaffId = Id
export type CircuitId = Id
export type SponsorId = Id

// ---------- Car performance model ----------

export interface CarPerformance {
  lowSpeedAero: number // 0..100
  mediumSpeedAero: number
  highSpeedAero: number
  drag: number // lower is better, 0..100
  straightLineSpeed: number
  braking: number
  traction: number
  tyreWear: number // lower is better
  tyreHeating: number // lower is better (overheating tyres degrade faster)
  cooling: number
  reliability: number
  energyEfficiency: number
}

// ---------- Circuits ----------

export interface CircuitCharacteristics {
  /** km */
  lengthKm: number
  laps: number
  lowSpeed: number // 0..100 emphasis
  mediumSpeed: number
  highSpeed: number
  straightLine: number
  overtakingDifficulty: number // 0 easy .. 100 hard
  tyreStress: number
  brakingStress: number
  rainProbability: number // 0..1 chance of a wet-weather event during the race
  pitLossSeconds: number
  safetyCarProbability: number // per-race base probability
  trackEvolution: number // 0..1 how much grip improves over sessions
}

export interface SectorInfo {
  name: string
  speedType: 'low' | 'medium' | 'high'
  overtakingChance: number // relative weight for overtakes in this sector
}

export interface Circuit {
  id: CircuitId
  name: string
  country: string
  characteristics: CircuitCharacteristics
  sectors: SectorInfo[]
}

// ---------- Tyres ----------

export type TyreCompoundId = 'soft' | 'medium' | 'hard' | 'inter' | 'wet'

export interface TyreCompound {
  id: TyreCompoundId
  name: string
  color: string
  /** Base pace delta vs reference compound, seconds per lap (negative = faster) */
  basePaceDelta: number
  /** Laps to reach optimal temperature */
  warmupLaps: number
  idealWetness: number // 0 dry .. 1 flooded; performance falls off as |wetness - ideal| grows
  wetGrip: number // 0..1 grip when track fully wet
  degradationPerLap: number // fraction of wear added per lap at normal pace
  wearCliff: number // wear fraction where pace drops sharply
}

// ---------- Drivers ----------

export interface DriverVisibleAbilities {
  pace: number // 0..100
  qualifying: number
  racecraft: number
  overtaking: number
  defending: number
  consistency: number
  wetSkill: number
  tyreManagement: number
  feedback: number // helps development direction
}

export interface DriverHiddenTraits {
  potential: number // 0..100 ceiling for pace growth
  pressureResistance: number
  aggression: number
  adaptability: number
  loyalty: number
  ego: number
  confidenceSensitivity: number
  developmentRate: number
  declineRate: number
}

export interface DriverDynamicState {
  morale: number // 0..100
  confidence: number
  form: number // -1..1 recent-performance modifier
  fatigue: number
  seasonsWithTeam: number
}

export interface Driver {
  id: DriverId
  firstName: string
  lastName: string
  nationality: string
  age: number
  visible: DriverVisibleAbilities
  hidden: DriverHiddenTraits
  dynamic: DriverDynamicState
  salaryDemandBase: number // thousands per season, adjusted by market
  contract?: DriverContract
  retired?: boolean
  history: { season: number; teamId: TeamId; points: number; wins: number }[]
}

export interface DriverContract {
  teamId: TeamId
  salaryPerSeason: number // thousands
  seasonsRemaining: number
  signedSeason: number
}

// ---------- Staff ----------

export type StaffRoleId =
  | 'teamPrincipal'
  | 'technicalDirector'
  | 'headOfAero'
  | 'chiefDesigner'
  | 'raceEngineer'
  | 'strategist'
  | 'pitOperations'

export const STAFF_ROLES: StaffRoleId[] = [
  'teamPrincipal',
  'technicalDirector',
  'headOfAero',
  'chiefDesigner',
  'raceEngineer',
  'strategist',
  'pitOperations',
]

export const STAFF_ROLE_NAMES: Record<StaffRoleId, string> = {
  teamPrincipal: 'Team Principal',
  technicalDirector: 'Technical Director',
  headOfAero: 'Head of Aerodynamics',
  chiefDesigner: 'Chief Designer',
  raceEngineer: 'Race Engineer',
  strategist: 'Head of Strategy',
  pitOperations: 'Pit Operations Chief',
}

export interface StaffMember {
  id: StaffId
  name: string
  nationality: string
  role: StaffRoleId
  /** Overall skill 0..100; effect depends on role */
  skill: number
  hiddenPotential: number
  salaryDemandBase: number
  contract?: StaffContract
  retired?: boolean
}

export interface StaffContract {
  teamId: TeamId
  salaryPerSeason: number
  seasonsRemaining: number
  signedSeason: number
}

// ---------- Sponsors ----------

export interface SponsorContract {
  sponsorId: SponsorId
  basePaymentPerRace: number // thousands
  positionBonus: number // per finishing position better than expectation
  expectationPosition: number // e.g. pay bonus if finish <= this
  championshipBonus: number // thousands if team wins championship
  reputationRequirement: number // min team reputation to sign
  seasonsRemaining: number
}

export interface Sponsor {
  id: SponsorId
  name: string
  industry: string
  tier: 'title' | 'major' | 'minor'
}

// ---------- Teams ----------

export interface TeamColors {
  primary: string
  secondary: string
}

export interface Team {
  id: TeamId
  name: string
  shortName: string
  colors: TeamColors
  reputation: number // 0..100
  money: number // thousands
  driverIds: DriverId[]
  staffIds: StaffId[]
  carPerformance: CarPerformance
  parts: Record<PartSlotId, PartDesign | null>
  facilities: Partial<Record<FacilityId, number>> // level 0..5
  sponsors: SponsorContract[]
  isPlayerControlled?: boolean
  aiProfile?: 'balanced' | 'aggressive-developer' | 'financial-conservative'
}

// ---------- Parts / development ----------

export type PartSlotId =
  | 'frontWing'
  | 'rearWing'
  | 'floor'
  | 'chassis'
  | 'suspension'
  | 'cooling'

export const PART_SLOTS: PartSlotId[] = ['frontWing', 'rearWing', 'floor', 'chassis', 'suspension', 'cooling']

export const PART_SLOT_NAMES: Record<PartSlotId, string> = {
  frontWing: 'Front Wing',
  rearWing: 'Rear Wing',
  floor: 'Floor',
  chassis: 'Chassis',
  suspension: 'Suspension',
  cooling: 'Cooling Package',
}

export interface PartStatModifiers {
  lowSpeedAero?: number
  mediumSpeedAero?: number
  highSpeedAero?: number
  drag?: number // positive adds drag (bad)
  straightLineSpeed?: number
  braking?: number
  traction?: number
  tyreWear?: number // positive worsens
  cooling?: number
  reliability?: number
}

export interface PartDesign {
  slot: PartSlotId
  name: string
  modifiers: PartStatModifiers
  costToProduce: number // thousands
  buildWeeks: number
  riskOfFailure: number // 0..1 design risk baked at production start
  seasonDesigned: number
}

export interface DevelopmentProject {
  id: Id
  slot: PartSlotId
  name: string
  modifiers: PartStatModifiers
  costTotal: number
  weeksRemaining: number
  weeksTotal: number
  produced: boolean // false while designing, true once parts built and ready to fit
  failed?: boolean
}

// ---------- Facilities ----------

export type FacilityId =
  | 'designCentre'
  | 'windTunnel'
  | 'simulator'
  | 'factory'
  | 'cfd'
  | 'driverDevelopment'
  | 'scoutingNetwork'
  | 'pitOperationsCentre'

export const FACILITY_IDS: FacilityId[] = [
  'designCentre',
  'windTunnel',
  'simulator',
  'factory',
  'cfd',
  'driverDevelopment',
  'scoutingNetwork',
  'pitOperationsCentre',
]

export const FACILITY_NAMES: Record<FacilityId, string> = {
  designCentre: 'Design Centre',
  windTunnel: 'Wind Tunnel',
  simulator: 'Simulator',
  factory: 'Factory',
  cfd: 'CFD Cluster',
  driverDevelopment: 'Driver Development Centre',
  scoutingNetwork: 'Scouting Network',
  pitOperationsCentre: 'Pit Operations Centre',
}

export interface FacilityUpgrade {
  facilityId: FacilityId
  targetLevel: number
  costTotal: number
  weeksRemaining: number
  weeksTotal: number
}

// ---------- Race weekend configuration ----------

export type PaceMode = 'conserve' | 'normal' | 'push' | 'attack'
export type TyreUsageMode = 'conserve' | 'standard' | 'aggressive'
export type EnergyMode = 'harvest' | 'balanced' | 'deploy'

export type TeamOrder =
  | 'freeToRace'
  | 'holdPosition'
  | 'doNotFightTeammate'
  | 'prioritizeDriverA'
  | 'prioritizeChampionshipContender'

export interface PlannedStint {
  fromLap: number
  compound: TyreCompoundId
}

export interface ConditionalRule {
  id: Id
  description: string
  kind:
    | 'wetSwitch'
    | 'safetyCarPit'
    | 'lateAttack'
    | 'undercutWindow'
  enabled: boolean
  params: Record<string, number>
}

export interface StrategyPlaybook {
  startingTyre: TyreCompoundId
  plannedStints: PlannedStint[] // stints after the opening one
  alternatePlan?: {
    triggerDescription: string
    plannedStints: PlannedStint[]
  }
  weatherRules: ConditionalRule[]
  safetyCarRules: ConditionalRule[]
  lateRaceRules: ConditionalRule[]
  paceMode: PaceMode
  tyreUsage: TyreUsageMode
  energy: EnergyMode
  teamOrder: TeamOrder
}

export interface SetupChoice {
  /** -3..3 slider bias between aero efficiency and top speed */
  downforceBias: number
  /** -3..3 gearing/grip bias toward traction or straights */
  mechanicalGripBias: number
  /** 0..100 brake bias front; affects lockup risk vs braking power */
  brakeBias: number
}

export interface RacePackageDriverEntry {
  driverId: DriverId
  instructions: string
}

/** Immutable snapshot of everything needed to simulate one car's race. */
export interface RacePackage {
  championshipId: Id
  roundId: Id
  teamId: TeamId
  drivers: RacePackageDriverEntry[]
  selectedParts: Record<PartSlotId, string> // part name per slot (fitted designs)
  carPerformance: CarPerformance
  componentWear: Record<PartSlotId, number> // 0 fresh .. 1 worn
  setup: SetupChoice
  tyreAllocation: Partial<Record<TyreCompoundId, number>>
  strategy: StrategyPlaybook
  reliability: number // effective reliability 0..100 incl. staff/parts
  staffModifiers: {
    strategySkill: number
    pitCrewSkill: number
    engineerSkill: number
  }
  weatherForecast: WeatherForecast
  aggressionOverride?: number
  version: number
  hash: string
  lockedAt: number
}

export interface QualifyingPackage {
  championshipId: Id
  roundId: Id
  teamId: TeamId
  driverIds: DriverId[]
  carPerformance: CarPerformance
  setup: SetupChoice
  qualiTyre: TyreCompoundId
  version: number
  hash: string
}

// ---------- Weather ----------

export type WeatherCondition = 'dry' | 'cloud' | 'lightRain' | 'heavyRain'

export interface WeatherForecast {
  condition: WeatherCondition
  rainProbability: number
  confidence: number // 0..1
}

export interface WeatherStatePoint {
  simTime: number
  condition: WeatherCondition
  trackWetness: number // 0 dry .. 1 soaked
}

// ---------- Simulation output ----------

export type RaceEventType =
  | 'raceStart'
  | 'lapComplete'
  | 'sectorChange'
  | 'positionChange'
  | 'overtake'
  | 'pitEntry'
  | 'pitStop'
  | 'pitExit'
  | 'tyreChange'
  | 'lockup'
  | 'spin'
  | 'collision'
  | 'puncture'
  | 'mechanicalFailure'
  | 'retirement'
  | 'yellowFlag'
  | 'virtualSafetyCar'
  | 'safetyCar'
  | 'restart'
  | 'penalty'
  | 'weatherChange'
  | 'leadChange'
  | 'fastestLap'
  | 'finish'
  | 'strategyDecision'

export interface RaceEvent {
  t: number // simulation time seconds
  type: RaceEventType
  driverId?: DriverId
  teamId?: TeamId
  detail: string
  data?: Record<string, number | string>
}

export interface CarRaceResult {
  driverId: DriverId
  teamId: TeamId
  startPosition: number
  finishPosition: number // 0 = DNF
  classified: boolean
  lapsCompleted: number
  totalTime?: number
  bestLapTime?: number
  pitStops: number
  penaltiesSeconds: number
  dnfReason?: string
  points: number
  fastestLap?: boolean
}

export interface RaceResult {
  roundId: Id
  circuitId: CircuitId
  simulationVersion: string
  seed: number
  rulesHash: string
  events: RaceEvent[]
  results: CarRaceResult[]
  fastestLapDriverId?: DriverId
  totalSimTime: number
  safetyCarCount: number
  vscCount: number
}

export interface QualifyingResultRow {
  driverId: DriverId
  teamId: TeamId
  lapTime: number
  gridPosition: number
}

export interface QualifyingResult {
  roundId: Id
  simulationVersion: string
  seed: number
  rows: QualifyingResultRow[]
}

// ---------- Championship state ----------

export type ChampionshipPhase =
  | 'lobby'
  | 'management'
  | 'locked'
  | 'qualifying'
  | 'raceBroadcast'
  | 'roundResults'
  | 'seasonComplete'
  | 'offseason'

export interface ChampionshipConfig {
  numberOfRaces: number
  managementPhaseSeconds: number
  equalTeams: boolean
  aiCount: number
  developmentSpeed: number
  economySpeed: number
  weatherEnabled: boolean
  difficulty: 'easy' | 'normal' | 'hard'
  votingRules: {
    twoX: 'majority' | 'unanimous'
    fourXPlus: 'majority' | 'unanimous'
    rewind: 'majority' | 'unanimous'
    pause: 'majority' | 'unanimous'
  }
  season: number
}

export interface RoundState {
  index: number
  circuitId: CircuitId
  phase: ChampionshipPhase
  packagesLocked: boolean
  qualifyingDone: boolean
  raceDone: boolean
  qualifyingResult?: QualifyingResult
  raceResult?: RaceResult
  practiceBonus: Partial<Record<TeamId, number>> // setup confidence bonus per team
}

export interface StandingsRow {
  teamId?: TeamId
  driverId?: DriverId
  points: number
  wins: number
  podiums: number
}

export interface NewsItem {
  id: Id
  season: number
  roundIndex: number
  headline: string
  body: string
}

export interface SeasonHistory {
  season: number
  championTeamId: TeamId
  championDriverId: DriverId
  driverStandings: { driverId: DriverId; points: number }[]
  teamStandings: { teamId: TeamId; points: number }[]
  raceWinners: { roundIndex: number; circuitId: CircuitId; driverId: DriverId; teamId: TeamId }[]
}

export interface Championship {
  id: Id
  mode: 'fast' | 'league' | 'career'
  name: string
  createdAt: number
  config: ChampionshipConfig
  teams: Team[]
  drivers: Record<DriverId, Driver>
  staffPool: StaffMember[]
  circuits: Circuit[]
  rounds: RoundState[]
  currentRoundIndex: number
  phase: ChampionshipPhase
  playerTeamId?: TeamId
  joinCode?: string
  newsFeed: NewsItem[]
  history: SeasonHistory[]
  rngSeed: number
  nextIds: Record<string, number>
}
