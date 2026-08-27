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

/** Identity-only field. MUST NOT modify driving ability. */
export type DriverGender = 'male' | 'female' | 'nonbinary'

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

/** Per-season record in any series (top or feeder). */
export interface DriverSeasonRecord {
  season: number
  seriesId: SeriesId
  teamId: TeamId | null
  starts: number
  wins: number
  podiums: number
  poles: number
  fastestLaps: number
  points: number
  championshipPosition: number
}

/** A reserve role with a top-series team. Promotes into race seat
 *  when the player chooses. */
export interface ReserveContract {
  teamId: TeamId
  signedSeason: number
  seasonsRemaining: number
  salaryPerSeason: number
  expectedRaceSeatBy: number // season number; breach beyond this is severe
  /** Optional promise; broken promise is severe. */
  promises?: Array<{ description: string; broken: boolean; round: number }>
}

/** A driver-academy place. Light contract. Promotes to reserve
 *  (and eventually to race seat) when the player chooses. */
export interface AcademyContract {
  teamId: TeamId
  signedSeason: number
  seasonsRemaining: number
  stipendPerSeason: number
  /** Optional future-seat commitment. */
  seatEvaluationBy?: number
  testSessionsPromised?: number
  promises?: Array<{ description: string; broken: boolean; round: number }>
}

/** Player-facing scouting tier. Hidden potential is NEVER shown
 *  numerically to the player. */
export type PotentialTier =
  | 'Limited'
  | 'Developing'
  | 'Good Prospect'
  | 'High Potential'
  | 'Elite Prospect'
  | 'Generational Talent'

/** Player-facing scout report. The visible ranges are guaranteed
 *  to contain the true visible score; the true hidden.potential is
 *  only exposed via the `potentialTier` label. */
export interface ScoutReport {
  driverId: DriverId
  confidence: number // 0..1
  visible: {
    pace: [number, number]
    qualifying: [number, number]
    racecraft: [number, number]
    wetSkill: [number, number]
    potentialTier: PotentialTier
  }
  scoutedAt: number
  /** Internal: how tight the visible band is. Never shown to player. */
  accuracy: number
}

export interface WatchEntry {
  driverId: DriverId
  addedAt: number
  lastNotified: number
}

/** Fictional top-series racing licence. Earned by junior results. */
export interface SeriesLicence {
  driverId: DriverId
  seriesId: 'base.championship.wgp'
  granted: boolean
  pointsRequired: number
  pointsCurrent: number
  reasons: string[] // reasons the player has not yet qualified (empty when granted)
}

export interface Driver {
  id: DriverId
  firstName: string
  lastName: string
  nationality: string
  age: number
  gender: DriverGender
  visible: DriverVisibleAbilities
  hidden: DriverHiddenTraits
  dynamic: DriverDynamicState
  salaryDemandBase: number // thousands per season, adjusted by market
  contract?: DriverContract
  /** A reserve role with a top-series team. */
  reserveContract?: ReserveContract
  /** A driver-academy place with a top-series team. */
  academyContract?: AcademyContract
  retired?: boolean
  /** Persistent per-season record across every series. */
  history: DriverSeasonRecord[]
  /** Top-series eligibility. Earned through feeder results. */
  eligibility: SeriesLicence
  /** Latest scout report (player-facing). Undefined if never scouted. */
  scouted?: ScoutReport
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

/** Immutable snapshot of everything needed to simulate ONE car's race. */
export interface RacePackage {
  championshipId: Id
  roundId: Id
  teamId: TeamId
  /** The single driver racing this car. */
  driverId: DriverId
  /** Teammate driver id (for team orders / battles), if any. */
  teammateId?: DriverId
  carNumber: number
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
  driverId: DriverId
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

/** Fictional series ids for the main championship and its feeder pyramid.
 *  All ids are stable; names are display-only. */
export type SeriesId =
  | 'base.championship.wgp'
  | 'base.junior.continental'
  | 'base.junior.regional'
  | 'base.junior.aurora'

export type SeriesTier = 'top' | 'upper-junior' | 'lower-junior' | 'women'

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
  /** Career mode kind — fast/league do not use this. */
  careerKind?: 'fictional' | 'real'
  /** Starting era year for career mode; drives regulations + narrative tone. */
  eraYear?: number
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

/** Junior team participating in a feeder series. Structurally a
 *  regular Team but with reputation, money and car tuned for
 *  junior-tier racing. */
export type JuniorTeam = Team

/** Per-season result for any feeder series. */
export interface SeriesSeasonHistory {
  season: number
  championDriverId: DriverId
  championTeamId: TeamId
  driverStandings: { driverId: DriverId; points: number }[]
  teamStandings: { teamId: TeamId; points: number }[]
  promoted: DriverId[]
  relegated: DriverId[]
}

/** Configuration and live state of a feeder series. Simulated
 *  deterministically in the background. */
export interface SeriesConfig {
  id: SeriesId
  name: string
  shortName: string
  tier: SeriesTier
  /** Brand colour used for the series emblem and accents. */
  color: string
  /** Blurb shown on the series card. */
  blurb: string
  /** Number of rounds per season. */
  rounds: number
  /** Number of teams / drivers in the grid (drives the catalogue). */
  gridSize: number
  /** Whether women's series — affects generation pool ratio only;
   *  NEVER affects skill generation. */
  isWomenSeries: boolean
  /** From which season onwards the series exists. For Real Career
   *  this gates the "women's championship formation" event. */
  establishedSeason: number
  /** The fictional emblem SVG (inline). */
  emblemSvg: string
}

export interface SeriesState {
  config: SeriesConfig
  /** All drivers that have ever raced in this series (current +
   *  graduated). Drivers graduate to upper series or to the
   *  top championship as reserves. */
  drivers: Record<DriverId, Driver>
  /** All teams that have ever raced in this series (current). */
  teams: JuniorTeam[]
  /** All race results, by season/round. */
  results: Array<{
    season: number
    roundIndex: number
    circuitId: CircuitId
    results: CarRaceResult[]
    fastestLapDriverId?: DriverId
  }>
  /** Season-level history (champion, promotions, relegations). */
  history: SeriesSeasonHistory[]
  /** Calendar of circuits used in this series (own small calendar). */
  calendar: CircuitId[]
  /** Persistent RNG seed for this series. */
  rngSeed: number
  currentSeason: number
  currentRoundIndex: number
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
  /** Persistent feeder series (local Career only). */
  feeder?: Record<SeriesId, SeriesState>
  /** Persistent scouting data. */
  scouting?: {
    reports: Record<DriverId, ScoutReport>
    watchlist: WatchEntry[]
    /** Number of consecutive weeks the scouting network has been
     *  funding active. Drives confidence growth. */
    weeksFunded: number
  }
  /** Tracks whether the women's series has been established in
   *  the current save (Real Career historical gating). */
  womenSeriesEstablished: boolean
}
