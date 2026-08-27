import { createRng } from '../core/rng'
import { CIRCUITS, DRIVERS, buildDefaultTeams } from '../core/content'
import { buildTeamRacePackages, finalizePackage, defaultStrategy } from '../championship/engine'
import { simulateQualifying } from '../sim/race-sim'
import { LiveRaceEngine, type LiveCommand } from '../sim/live-race'
import { DriverAgencyStore, installAgencyCompliance } from '../drivers/agency'
import type { Championship, RacePackage, SetupChoice, StrategyPlaybook, Team } from '../core/types'

/**
 * MultiplayerServer — the authoritative game server (in-process class; the
 * ws transport in server.ts wraps this). Owns lobbies, championship state,
 * management timers, lock, live race and voting. Clients only send actions.
 */

export interface LobbyPlayer {
  playerId: string
  /** Opaque reconnect token. Issued by the server, required for restore. */
  sessionToken: string
  name: string
  teamId?: string
  connected: boolean
  ready: boolean
}

export interface LobbyConfig {
  teamCount: number // 2..11
  rounds: number
  eraYear: number
  startMode: 'equal' | 'eraBalanced' | 'historicalShadow'
  managementSeconds: number
  weatherEnabled: boolean
  difficulty: 'easy' | 'normal' | 'hard'
  voting: { twoX: 'majority' | 'unanimous'; fourXPlus: 'majority' | 'unanimous'; rewind: 'majority' | 'unanimous'; pause: 'majority' | 'unanimous' }
}

export type ServerPhase =
  | 'lobby' | 'management' | 'locked' | 'qualifying' | 'race' | 'roundResults' | 'seasonComplete'

export interface ServerTeamState {
  teamId: string
  ownerPlayerId?: string
  strategy: StrategyPlaybook
  setup: SetupChoice
  ready: boolean
}

export interface VoteState {
  kind: 'speed' | 'pause' | 'rewind'
  payload: number
  votesFor: string[]
  votesAgainst: string[]
  expiresAt: number
}

export interface ServerEvent {
  type: string
  data?: Record<string, unknown>
}

export const DEFAULT_LOBBY_CONFIG: LobbyConfig = {
  teamCount: 10,
  rounds: 5,
  eraYear: 2022,
  startMode: 'eraBalanced',
  managementSeconds: 180,
  weatherEnabled: true,
  difficulty: 'normal',
  voting: { twoX: 'majority', fourXPlus: 'unanimous', rewind: 'unanimous', pause: 'majority' },
}

let lobbyCounter = 0

function newSessionToken(): string {
  // 24 chars base32 — high entropy, opaque to clients
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = (Math.random() * 0xffffffff) >>> 0
  let out = ''
  for (let i = 0; i < 24; i++) {
    s = (s * 1103515245 + 12345) >>> 0
    out += chars[(s >>> 16) % chars.length]
  }
  return out
}

export class MultiplayerLobby {
  readonly code: string
  readonly createdAt = Date.now()
  players: LobbyPlayer[] = []
  config: LobbyConfig = structuredClone(DEFAULT_LOBBY_CONFIG)
  phase: ServerPhase = 'lobby'
  /** Teams available for selection in the lobby phase. */
  availableTeams: Array<{ teamId: string; name: string; shortName: string; colors: { primary: string; secondary: string } }> = []
  /** Championship-scoped state — completely isolated per lobby. */
  championship!: Championship
  agency = new DriverAgencyStore()
  teamStates = new Map<string, ServerTeamState>()
  managementDeadline = 0
  currentRoundIndex = 0

  // live race
  liveEngine?: LiveRaceEngine
  liveSpeed: number = 1
  livePaused = false
  /** Broadcast cursor (sim seconds). Rewind does not touch sim state. */
  cursorSeconds = 0
  activeVote: VoteState | null = null
  /** Per-team pending live commands queued while replaying. */
  private pendingCommands: Array<Omit<LiveCommand, 't' | 'applied' | 'note'>> = []
  roundQualifyingDone = false
  /** Completed-round results, kept across rounds for standings accumulation. */
  completedRounds: Array<{
    roundIndex: number
    results: ReturnType<LiveRaceEngine['results']>
  }> = []
  /** Convenience for the in-progress round (set when the race finishes). */
  roundResults?: ReturnType<LiveRaceEngine['results']>

  constructor(public hostPlayerId: string) {
    lobbyCounter++
    this.code = codeFromSeed(lobbyCounter * 7919 + Date.now())
    // The list of teams available for selection is the default roster,
    // sliced to the configured teamCount. It's the same set the
    // championship is built from, so the client's team picker is
    // consistent with the eventual championship.
    this.availableTeams = buildDefaultTeams().slice(0, DEFAULT_LOBBY_CONFIG.teamCount).map((t) => ({
      teamId: t.id, name: t.name, shortName: t.shortName, colors: t.colors,
    }))
  }

  // ----- Lobby management -----

  /** First-time join. Issues a sessionToken the client must keep. */
  join(playerId: string, name: string): { ok: boolean; error?: string; sessionToken?: string } {
    const existing = this.players.find((p) => p.playerId === playerId)
    if (existing) {
      // Reconnect is allowed in any phase (re-auth via sessionToken handled by restore())
      existing.connected = true
      existing.name = name
      return { ok: true, sessionToken: existing.sessionToken }
    }
    if (this.phase !== 'lobby') return { ok: false, error: 'Championship already started.' }
    if (this.players.length >= this.config.teamCount) return { ok: false, error: 'Lobby is full.' }
    const sessionToken = newSessionToken()
    this.players.push({ playerId, sessionToken, name, connected: true, ready: false })
    return { ok: true, sessionToken }
  }

  /**
   * Re-authenticate an existing player by sessionToken. The sessionToken
   * is the durable identity that survives a tab reload.
   */
  restoreByToken(sessionToken: string): { ok: boolean; error?: string; realPlayerId?: string } {
    const owner = this.players.find((p) => p.sessionToken === sessionToken)
    if (!owner) return { ok: false, error: 'Session token not recognised.' }
    // Reconnect: bring the player back, mark them connected, and tell the
    // caller to swap their `playerId` for `owner.playerId` (so the rest of
    // the protocol uses the durable id).
    owner.connected = true
    return { ok: true, realPlayerId: owner.playerId }
  }

  disconnect(playerId: string) {
    const p = this.players.find((x) => x.playerId === playerId)
    if (p) p.connected = false
  }

  selectTeam(playerId: string, teamId: string): { ok: boolean; error?: string } {
    if (this.phase !== 'lobby') return { ok: false, error: 'Too late to change team.' }
    const taken = [...this.teamStates.values()].find((t) => t.teamId === teamId && t.ownerPlayerId !== playerId)
    if (taken) return { ok: false, error: 'Team already selected.' }
    // free previous
    for (const t of this.teamStates.values()) if (t.ownerPlayerId === playerId) t.ownerPlayerId = undefined
    let ts = this.teamStates.get(teamId)
    if (!ts) {
      ts = { teamId, ready: false, strategy: defaultStrategy(20), setup: { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 } }
      this.teamStates.set(teamId, ts)
    }
    ts.ownerPlayerId = playerId
    const p = this.players.find((x) => x.playerId === playerId)
    if (p) p.teamId = teamId
    return { ok: true }
  }

  setReady(playerId: string, ready: boolean) {
    const p = this.players.find((x) => x.playerId === playerId)
    if (p) p.ready = ready
  }

  updateConfig(playerId: string, patch: Partial<LobbyConfig>): { ok: boolean; error?: string } {
    if (playerId !== this.hostPlayerId) return { ok: false, error: 'Only the host can change settings.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'Cannot change settings after start.' }
    this.config = { ...this.config, ...patch }
    return { ok: true }
  }

  /** Build the isolated championship and start round 1 management. */
  start(playerId: string): { ok: boolean; error?: string } {
    if (playerId !== this.hostPlayerId) return { ok: false, error: 'Only the host can start.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'Already started.' }
    this.buildChampionship()
    this.beginManagement()
    return { ok: true }
  }

  /** Every championship gets fresh, isolated state — drivers included. */
  private buildChampionship() {
    const seed = (Date.now() ^ 0x5eed) >>> 0
    const rng = createRng(seed)
    const teams = buildDefaultTeams().slice(0, this.config.teamCount)

    // Start modes
    if (this.config.startMode === 'equal') {
      for (const t of teams) {
        t.carPerformance = {
          lowSpeedAero: 62, mediumSpeedAero: 62, highSpeedAero: 62, drag: 38,
          straightLineSpeed: 62, braking: 62, traction: 62, tyreWear: 38,
          tyreHeating: 38, cooling: 62, reliability: 70, energyEfficiency: 62,
        }
      }
    } else if (this.config.startMode === 'eraBalanced') {
      // Keep identity differences but compress the spread
      for (const t of teams) {
        for (const [k, v] of Object.entries(t.carPerformance)) {
          const centered = v - 62
          t.carPerformance[k as keyof typeof t.carPerformance] = 62 + centered * 0.45
        }
      }
    }
    // 'historicalShadow' keeps the default hierarchy as-is

    // Assign human teams from selections
    for (const ts of this.teamStates.values()) {
      const team = teams.find((t) => t.id === ts.teamId)
      if (team && ts.ownerPlayerId) team.isPlayerControlled = true
      else if (team) team.isPlayerControlled = false
    }
    // Teams not selected by anyone become AI
    for (const t of teams) {
      const ts = this.teamStates.get(t.id)
      if (!ts) this.teamStates.set(t.id, { teamId: t.id, ready: false, strategy: defaultStrategy(20), setup: { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 } })
      if (!ts?.ownerPlayerId) t.isPlayerControlled = false
    }

    const drivers: Championship['drivers'] = {}
    for (const d of DRIVERS.map((x) => structuredClone(x))) {
      // Fresh dynamic state for every driver — multiplayer starts from zero
      d.dynamic = { morale: 65, confidence: 60, form: 0, fatigue: 0, seasonsWithTeam: 1 }
      d.history = []
      drivers[d.id] = d
    }
    for (const t of teams) {
      for (const dId of t.driverIds) {
        if (drivers[dId]) drivers[dId].contract = { teamId: t.id, salaryPerSeason: drivers[dId].salaryDemandBase, seasonsRemaining: 2, signedSeason: 1 }
      }
    }

    const calendar: string[] = []
    const shuffled = rng.shuffle([...CIRCUITS.map((c) => c.id)])
    while (calendar.length < this.config.rounds) calendar.push(...shuffled)

    this.championship = {
      id: `mp.${this.code}`,
      mode: 'fast',
      name: `Fast Championship ${this.code}`,
      createdAt: Date.now(),
      config: {
        numberOfRaces: this.config.rounds,
        managementPhaseSeconds: this.config.managementSeconds,
        equalTeams: this.config.startMode === 'equal',
        aiCount: 0,
        developmentSpeed: 1,
        economySpeed: 1,
        weatherEnabled: this.config.weatherEnabled,
        difficulty: this.config.difficulty,
        votingRules: this.config.voting,
        season: 1,
      },
      teams,
      drivers,
      staffPool: [],
      circuits: structuredClone(CIRCUITS),
      rounds: calendar.slice(0, this.config.rounds).map((circuitId, index) => ({
        index, circuitId, phase: 'management' as const, packagesLocked: false, qualifyingDone: false, raceDone: false, practiceBonus: {},
      })),
      currentRoundIndex: 0,
      phase: 'management',
      playerTeamId: undefined,
      joinCode: this.code,
      newsFeed: [],
      history: [],
      rngSeed: seed,
      nextIds: {},
      womenSeriesEstablished: false,
    }

    // Fresh agency states for all drivers (zeroed relationships)
    this.agency = new DriverAgencyStore()
    for (const d of Object.values(drivers)) this.agency.ensure(d.id, d)
    installAgencyCompliance(this.agency, this.championship)
  }

  private beginManagement() {
    this.phase = 'management'
    this.currentRoundIndex = this.championship.currentRoundIndex
    this.managementDeadline = Date.now() + this.config.managementSeconds * 1000
    for (const ts of this.teamStates.values()) ts.ready = false
  }

  // ----- Management phase -----

  updateStrategy(playerId: string, strategy?: Partial<StrategyPlaybook>, setup?: SetupChoice): { ok: boolean; error?: string } {
    if (this.phase !== 'management') return { ok: false, error: 'Not in management phase.' }
    const ts = this.teamStateOf(playerId)
    if (!ts) return { ok: false, error: 'You do not control a team.' }
    if (strategy) ts.strategy = { ...ts.strategy, ...strategy }
    if (setup) ts.setup = setup
    return { ok: true }
  }

  readyTeam(playerId: string, ready: boolean): { ok: boolean; error?: string } {
    if (this.phase !== 'management' && this.phase !== 'lobby') return { ok: false, error: 'Not in management phase.' }
    const ts = this.teamStateOf(playerId)
    if (!ts) return { ok: false, error: 'You do not control a team.' }
    ts.ready = ready
    const p = this.players.find((x) => x.playerId === playerId)
    if (p) p.ready = ready
    return { ok: true }
  }

  /** All human teams ready? */
  allReady(): boolean {
    const human = [...this.teamStates.values()].filter((t) => t.ownerPlayerId)
    return human.length > 0 && human.every((t) => t.ready)
  }

  managementExpired(): boolean {
    return this.phase === 'management' && Date.now() >= this.managementDeadline
  }

  teamStateOf(playerId: string): ServerTeamState | undefined {
    return [...this.teamStates.values()].find((t) => t.ownerPlayerId === playerId)
  }

  teamOfPlayer(playerId: string): Team | undefined {
    const ts = this.teamStateOf(playerId)
    return ts ? this.championship.teams.find((t) => t.id === ts.teamId) : undefined
  }

  // ----- Lock, qualify, race -----

  lockAndQualify(seedOverride?: number): { ok: boolean; error?: string } {
    if (this.phase !== 'management') return { ok: false, error: 'Not in management phase.' }
    const round = this.championship.rounds[this.championship.currentRoundIndex]
    const circuit = this.championship.circuits.find((c) => c.id === round.circuitId)!
    const seed = seedOverride ?? ((this.championship.rngSeed ^ (round.index * 2654435761) ^ (this.championship.config.season * 40503)) >>> 0)

    // Build immutable packages: 2 cars per team, strategy from team state
    const packages: RacePackage[] = []
    for (const team of this.championship.teams) {
      const ts = this.teamStates.get(team.id)
      const strategy = ts ? ts.strategy : defaultStrategy(circuit.characteristics.laps)
      const setup = ts ? ts.setup : { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 }
      for (const base of buildTeamRacePackages(this.championship, team, round)) {
        packages.push(finalizePackage({ ...base, strategy: { ...strategy, startingTyre: strategy.startingTyre }, setup }))
      }
    }
    round.packagesLocked = true
    this.lockedPackages = packages

    // Qualifying
    const qualiResult = simulateQualifying({
      roundId: `${round.index}`,
      circuit,
      packages: packages.map((p) => ({
        championshipId: p.championshipId, roundId: p.roundId, teamId: p.teamId,
        driverId: p.driverId, carPerformance: p.carPerformance, setup: p.setup,
        qualiTyre: 'soft' as const, version: 1, hash: p.hash,
      })),
      drivers: this.championship.drivers,
      seed,
      weatherForecast: { rainProbability: 0.2 },
    })
    round.qualifyingResult = qualiResult
    round.qualifyingDone = true
    this.roundQualifyingDone = true

    // Grid order packages
    const byDriver = new Map(packages.map((p) => [p.driverId, p]))
    const ordered: RacePackage[] = []
    for (const row of qualiResult.rows) {
      const pkg = byDriver.get(row.driverId)
      if (pkg) { ordered.push(pkg); byDriver.delete(row.driverId) }
    }
    for (const pkg of byDriver.values()) ordered.push(pkg)

    this.liveEngine = new LiveRaceEngine(circuit, ordered, this.championship.drivers, (seed ^ 0x5aced) >>> 0)
    this.phase = 'race'
    this.livePaused = false
    this.liveSpeed = 1
    this.cursorSeconds = 0
    this.roundResults = undefined
    this.pendingCommands = []
    return { ok: true }
  }

  lockedPackages: RacePackage[] = []

  // ----- Live race -----

  /** Advance the live race by dt real seconds at the current speed. */
  tick(dtRealSeconds: number): { lapEvents: number; finished: boolean } {
    if (!this.liveEngine || this.phase !== 'race') return { lapEvents: 0, finished: true }
    if (this.livePaused || this.replayActive) return { lapEvents: 0, finished: this.liveEngine.isFinished() }

    // Advance cursor
    this.cursorSeconds += dtRealSeconds * this.liveSpeed

    // Step sim laps as the cursor passes lap boundaries (~92 sim-seconds/lap)
    let steps = 0
    const targetSimTime = this.cursorSeconds
    while (!this.liveEngine.isFinished() && this.liveEngine.state.simTime < targetSimTime && steps < 40) {
      this.liveEngine.stepLap()
      steps++
    }
    if (steps > 0) this.cursorSeconds = Math.max(this.cursorSeconds, this.liveEngine.state.simTime)

    if (this.liveEngine.isFinished()) {
      this.finishRace()
      return { lapEvents: steps, finished: true }
    }
    return { lapEvents: steps, finished: false }
  }

  sendLiveCommand(playerId: string, cmd: Omit<LiveCommand, 't' | 'applied' | 'note'>): { ok: boolean; response: string; deferred?: boolean } {
    if (!this.liveEngine || this.phase !== 'race') return { ok: false, response: 'Race is not running.' }
    const ts = this.teamStateOf(playerId)
    if (!ts) return { ok: false, response: 'You do not control a team.' }
    if (cmd.teamId !== ts.teamId) return { ok: false, response: 'Cannot command another team.' }
    if (this.replayActive) {
      // Queue — cannot alter the past
      this.pendingCommands.push(cmd)
      return { ok: true, response: 'Replaying — command queued for live resumption.' }
    }
    return this.liveEngine.applyCommand(cmd)
  }

  // ----- Voting -----

  requestVote(playerId: string, kind: VoteState['kind'], payload: number): { ok: boolean; error?: string } {
    if (this.phase !== 'race') return { ok: false, error: 'Not during race.' }
    if (this.activeVote && this.activeVote.expiresAt > Date.now()) return { ok: false, error: 'Vote already in progress.' }
    this.activeVote = { kind, payload, votesFor: [playerId], votesAgainst: [], expiresAt: Date.now() + 12000 }
    this.evaluateVote()
    return { ok: true }
  }

  castVote(playerId: string, support: boolean) {
    const v = this.activeVote
    if (!v || Date.now() > v.expiresAt) return
    if (support) {
      if (!v.votesFor.includes(playerId)) v.votesFor.push(playerId)
      v.votesAgainst = v.votesAgainst.filter((p) => p !== playerId)
    } else {
      if (!v.votesAgainst.includes(playerId)) v.votesAgainst.push(playerId)
      v.votesFor = v.votesFor.filter((p) => p !== playerId)
    }
    this.evaluateVote()
  }

  private connectedHumanCount(): number {
    return Math.max(1, this.players.filter((p) => p.connected && p.teamId).length)
  }

  private evaluateVote() {
    const v = this.activeVote
    if (!v) return
    const total = this.connectedHumanCount()
    const forFrac = v.votesFor.length / total
    const rules = this.config.voting
    let passed = false
    let unblockable = false
    const unanimous = v.votesFor.length >= total && v.votesAgainst.length === 0

    if (v.kind === 'pause') passed = rules.pause === 'unanimous' ? unanimous : forFrac >= 0.5
    else if (v.kind === 'rewind') passed = rules.rewind === 'unanimous' ? unanimous : forFrac >= 0.5
    else if (v.kind === 'speed') {
      const target = v.payload
      if (target === 1) { passed = true; unblockable = true } // return to 1x cannot be blocked
      else if (target === 2) passed = rules.twoX === 'unanimous' ? unanimous : forFrac >= 0.5
      else passed = rules.fourXPlus === 'unanimous' ? unanimous : forFrac >= 0.5
    }

    const expired = Date.now() > v.expiresAt
    if (!passed && expired && !unblockable) {
      this.activeVote = null
      return
    }
    if (passed) {
      if (v.kind === 'pause') this.livePaused = v.payload === 1
      else if (v.kind === 'speed') { this.liveSpeed = v.payload; this.livePaused = false }
      else if (v.kind === 'rewind') this.startReplay(v.payload)
      this.activeVote = null
    }
  }

  // ----- Replay (rewind never rewrites history) -----

  replayActive = false
  private replayReturnCursor = 0

  startReplay(targetSeconds: number) {
    this.replayReturnCursor = this.cursorSeconds
    this.cursorSeconds = Math.max(0, Math.min(targetSeconds, this.liveEngine?.state.simTime ?? 0))
    this.replayActive = true
  }

  resumeLive() {
    if (!this.replayActive) return
    this.replayActive = false
    this.cursorSeconds = this.replayReturnCursor
    // Flush queued commands
    for (const cmd of this.pendingCommands) {
      this.liveEngine?.applyCommand(cmd)
    }
    this.pendingCommands = []
  }

  private finishRace() {
    if (!this.liveEngine) return
    this.roundResults = this.liveEngine.results()
    const round = this.championship.rounds[this.championship.currentRoundIndex]
    round.raceDone = true
    round.phase = 'roundResults'
    this.phase = 'roundResults'
    this.replayActive = false
    // Persist the completed round for standings accumulation across rounds.
    this.completedRounds.push({
      roundIndex: round.index,
      results: this.roundResults,
    })
  }

  /** Advance to the next round (or complete the season). */
  nextRound(): 'nextRound' | 'seasonComplete' {
    if (this.phase !== 'roundResults' && this.phase !== 'seasonComplete') {
      throw new Error('nextRound called outside roundResults phase')
    }
    if (this.phase === 'seasonComplete') return 'seasonComplete'
    this.agency.tickRound()
    if (this.championship.currentRoundIndex + 1 >= this.championship.rounds.length) {
      this.phase = 'seasonComplete'
      this.championship.phase = 'seasonComplete'
      return 'seasonComplete'
    }
    this.championship.currentRoundIndex++
    this.roundResults = undefined
    this.beginManagement()
    return 'nextRound'
  }

  /** Standings from all completed rounds (authoritative, accumulated). */
  standings(): { driverRows: Array<{ driverId: string; points: number }>; teamRows: Array<{ teamId: string; points: number }> } {
    const driverPoints = new Map<string, number>()
    const teamPoints = new Map<string, number>()
    for (const cr of this.completedRounds) {
      for (const r of cr.results) {
        if (!r.classified) continue
        driverPoints.set(r.driverId, (driverPoints.get(r.driverId) ?? 0) + r.points)
        teamPoints.set(r.teamId, (teamPoints.get(r.teamId) ?? 0) + r.points)
      }
    }
    return {
      driverRows: [...driverPoints.entries()].map(([driverId, points]) => ({ driverId, points })).sort((a, b) => b.points - a.points),
      teamRows: [...teamPoints.entries()].map(([teamId, points]) => ({ teamId, points })).sort((a, b) => b.points - a.points),
    }
  }
}

/** Accumulated points across completed rounds (authoritative). */
export function codeFromSeed(seed: number): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = seed >>> 0
  let out = ''
  for (let i = 0; i < 6; i++) {
    s = (s * 1103515245 + 12345) >>> 0
    out += chars[(s >>> 16) % chars.length]
  }
  return out
}
