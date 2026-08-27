/**
 * MultiplayerClient — browser-side transport to the authoritative server.
 * The client only sends actions; all state comes from server snapshots.
 *
 * For the BROADCAST/HQ/standings UI use `MultiplayerSession` — it owns the
 * connection, replays server snapshots into a typed view model, and exposes
 * `connection` / `error` events. Direct `MultiplayerClient` use is reserved
 * for the lobby screen.
 */

export interface LobbyTeamSummary {
  teamId: string
  name: string
  shortName: string
  colors: { primary: string; secondary: string }
  ownerPlayerId?: string
  ready: boolean
}

export interface LobbyPlayerSummary {
  playerId: string
  name: string
  teamId?: string
  connected: boolean
  ready: boolean
  /** Only ever populated for the viewer (per-client). */
  sessionToken?: string
}

export interface LobbySnapshot {
  code: string
  phase: string
  config: Record<string, unknown>
  totalRounds: number
  currentRoundIndex: number
  players: LobbyPlayerSummary[]
  teams: LobbyTeamSummary[]
  hostPlayerId: string
  managementDeadline: number
  allReady: boolean
}

export interface ChampionshipSummary {
  name: string
  config: Record<string, unknown>
  currentRoundIndex: number
  totalRounds: number
  circuit: { id: string; name: string; country: string; laps: number } | null
  teams: Array<{
    id: string; name: string; shortName: string; colors: { primary: string; secondary: string }
    reputation: number; money: number; driverIds: string[]; isPlayerControlled: boolean
  }>
  drivers: Record<string, {
    id: string; firstName: string; lastName: string; nationality: string
    dynamic: { morale: number; confidence: number; form: number }
  }>
}

export interface RaceCar {
  driverId: string
  teamId: string
  carNumber: number
  position: number
  lap: number
  trackProgress: number
  gapSeconds: number
  tyre: string
  tyreAge: number
  tyreWear: number
  pitStops: number
  paceMode: string
  energy: string
  damage: number
  pitThisLap: boolean
  retired: boolean
  finished: boolean
  isMyTeam: boolean
}

export interface RaceEvent {
  t: number
  type: string
  driverId?: string
  teamId?: string
  detail: string
  data?: Record<string, number | string>
}

export interface RaceRadio {
  t: number
  driverId: string
  message: string
  kind: string
}

export interface RaceSnapshot {
  phase: string
  cursorSeconds: number
  speed: number
  paused: boolean
  replayActive: boolean
  vote: { kind: string; payload: number; votesFor: number; votesAgainst: number; expiresAt: number } | null
  myTeamId?: string
  myPlayerId?: string
  events: RaceEvent[]
  radio: RaceRadio[]
  cars: RaceCar[]
  leaderLap: number
  totalLaps: number
  trackWetness: number
  condition: string
  results?: Array<{ driverId: string; teamId: string; finishPosition: number; classified: boolean; points: number; fastestLap: boolean; pitStops: number; dnfReason?: string }>
  standings?: { driverRows: Array<{ driverId: string; points: number }>; teamRows: Array<{ teamId: string; points: number }> }
  qualifyingGrid?: Array<{ driverId: string; gridPosition: number; lapTime: number }> | null
  championship?: ChampionshipSummary | null
}

type Handler = (payload: unknown) => void

export class MultiplayerClient {
  private ws?: WebSocket
  playerId = ''
  connected = false
  private handlers = new Map<string, Handler[]>()
  private queue: Array<{ type: string; payload: Record<string, unknown> }> = []
  reconnectAttempts = 0
  /** Optional callback when the WebSocket closes — used by MultiplayerSession
   *  to surface a RECONNECTING / OFFLINE state without a network round-trip. */
  wsClosedHandler?: () => void

  connect(url = 'ws://localhost:8080'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)
      } catch (e) {
        reject(e)
        return
      }
      this.ws.onopen = () => {
        this.connected = true
        this.reconnectAttempts = 0
        // flush queued messages
        for (const q of this.queue) this.ws?.send(JSON.stringify(q))
        this.queue = []
        resolve()
      }
      this.ws.onerror = () => {
        if (!this.connected) reject(new Error('Cannot reach multiplayer server. Is it running? (npm run server)'))
      }
      this.ws.onclose = () => {
        this.connected = false
        this.wsClosedHandler?.()
      }
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type: string; payload: unknown }
          if (msg.type === 'welcome') {
            this.playerId = (msg.payload as { playerId: string }).playerId
          }
          for (const h of this.handlers.get(msg.type) ?? []) h(msg.payload)
          for (const h of this.handlers.get('*') ?? []) h({ type: msg.type, payload: msg.payload })
        } catch {
          /* ignore malformed */
        }
      }
    })
  }

  on(type: string, handler: Handler): () => void {
    const list = this.handlers.get(type) ?? []
    list.push(handler)
    this.handlers.set(type, list)
    return () => {
      this.handlers.set(type, list.filter((h) => h !== handler))
    }
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    } else {
      this.queue.push({ type, payload })
    }
  }

  // Convenience wrappers
  setName(name: string) { this.send('setName', { name }) }
  createLobby(config?: Partial<LobbySnapshot['config']>) { this.send('createLobby', { config }) }
  joinLobby(code: string) { this.send('joinLobby', { code }) }
  leaveLobby() { this.send('leaveLobby') }
  selectTeam(teamId: string) { this.send('selectTeam', { teamId }) }
  setReady(ready: boolean) { this.send('setReady', { ready }) }
  updateConfig(config: Record<string, unknown>) { this.send('updateConfig', { config }) }
  startChampionship() { this.send('startChampionship') }
  updateStrategy(strategy: unknown, setup: unknown) { this.send('updateStrategy', { strategy, setup }) }
  readyTeam(ready: boolean) { this.send('readyTeam', { ready }) }
  requestRaceState() { this.send('requestRaceState') }
  liveCommand(cmd: Record<string, unknown>) { this.send('liveCommand', { cmd }) }
  vote(kind: string, payload: number) { this.send('vote', { kind, payload }) }
  castVote(support: boolean) { this.send('vote', { support }) }
  resumeLive() { this.send('resumeLive') }
  nextRound() { this.send('nextRound') }
  restoreSession(code: string, sessionToken: string) { this.send('restoreSession', { code, sessionToken }) }
}
