import {
  MultiplayerClient,
  type LobbySnapshot,
  type RaceSnapshot,
  type ChampionshipSummary,
} from './multiplayer-client'
import { store } from '../state/store'

/**
 * MultiplayerSession — owns the authoritative multiplayer view model.
 *
 * One instance per tab. Owns the WebSocket and replays server snapshots
 * into a single typed view (`state`) that the UI subscribes to. In
 * multiplayer mode the UI MUST treat this state as the only source of
 * truth for race / HQ / standings / results. Local `store.champ` is
 * NEVER consulted while a session is active.
 *
 * Identity model:
 *   - `playerName` (user-chosen) is persisted in localStorage.
 *   - `sessionToken` (server-issued) is persisted in localStorage and
 *      used to re-authenticate the SAME player after a tab reload,
 *      so they keep the same team, ready state, and championship.
 *   - On reconnect we tell the server the (code, sessionToken) pair;
 *     the server re-binds the durable `playerId` and the latest
 *     authoritative snapshot in one go.
 */

export type ConnectionState =
  | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error'

export interface MultiplayerView {
  connection: ConnectionState
  /** Server-issued error message, if any. */
  error: string | null
  /** Local player name (pre-connect). */
  playerName: string
  /** Lobby code, once known. */
  lobbyCode: string | null
  /** Most recent lobby snapshot. */
  lobby: LobbySnapshot | null
  /** Most recent race/phase snapshot. */
  race: RaceSnapshot | null
  /** Most recent championship summary (HQ / results / standings). */
  championship: ChampionshipSummary | null
  /** Server-issued `joined` payload. */
  joined: { code: string; playerId: string; sessionToken: string } | null
}

type Listener = (view: MultiplayerView) => void

const NAME_KEY = 'pitwall-dynasty.mp.playerName'
const SESSION_KEY = 'pitwall-dynasty.mp.session'
const LAST_LOBBY_KEY = 'pitwall-dynasty.mp.lastLobbyCode'

interface PersistedSession { code: string; sessionToken: string }

function loadName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? `Player-${Math.random().toString(36).slice(2, 5).toUpperCase()}` }
  catch { return 'Player' }
}
function saveName(n: string) { try { localStorage.setItem(NAME_KEY, n) } catch { /* ignore */ } }

function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedSession
    if (parsed?.code && parsed?.sessionToken) return parsed
  } catch { /* ignore */ }
  return null
}
function saveSession(s: PersistedSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}

function loadLastLobby(): string | null {
  try { return localStorage.getItem(LAST_LOBBY_KEY) } catch { return null }
}
function saveLastLobby(code: string | null) {
  try {
    if (code) localStorage.setItem(LAST_LOBBY_KEY, code)
    else localStorage.removeItem(LAST_LOBBY_KEY)
  } catch { /* ignore */ }
}

export class MultiplayerSession {
  private client = new MultiplayerClient()
  private listeners = new Set<Listener>()
  view: MultiplayerView = {
    connection: 'idle',
    error: null,
    playerName: loadName(),
    lobbyCode: loadLastLobby(),
    lobby: null,
    race: null,
    championship: null,
    joined: null,
  }
  constructor() {
    this.client.on('*', (raw) => {
      const ev = raw as { type: string; payload: unknown }
      switch (ev.type) {
        case 'joined': {
          const p = ev.payload as { code: string; playerId: string; sessionToken: string }
          this.view.joined = p
          this.view.lobbyCode = p.code
          this.view.error = null
          this.view.connection = 'connected'
          // Persist the durable identity so a tab reload can reconnect.
          if (p.sessionToken) {
            saveSession({ code: p.code, sessionToken: p.sessionToken })
            saveLastLobby(p.code)
          }
          // Activate the multiplayer branch in the store. Clearing the
          // local championship guarantees the broadcast cannot fall back
          // to a stale Quick Start state.
          store.setMulti({
            active: true,
            connection: 'connected',
            lobbyCode: p.code,
            error: null,
            joined: this.view.joined,
          } as never)
          // Defer so the local save system isn't simultaneously mutated
          // by an active game.
          store.clearLocalChampionship()
          this.apply()
          break
        }
        case 'lobbyState': {
          this.view.lobby = ev.payload as LobbySnapshot
          this.apply()
          break
        }
        case 'raceState': {
          this.view.race = ev.payload as RaceSnapshot
          if ((ev.payload as RaceSnapshot).championship) {
            this.view.championship = (ev.payload as RaceSnapshot).championship ?? null
          }
          this.apply()
          break
        }
        case 'raceStart': {
          const p = ev.payload as RaceSnapshot
          this.view.race = p
          if (p.championship) this.view.championship = p.championship
          this.apply()
          break
        }
        case 'phaseChange': {
          const p = ev.payload as { phase: string; snapshot?: LobbySnapshot; championship?: ChampionshipSummary }
          if (p.snapshot) this.view.lobby = p.snapshot
          if (p.championship) this.view.championship = p.championship
          this.apply()
          break
        }
        case 'raceComplete': {
          this.view.race = ev.payload as RaceSnapshot
          if ((ev.payload as RaceSnapshot).championship) {
            this.view.championship = (ev.payload as RaceSnapshot).championship ?? null
          }
          this.apply()
          break
        }
        case 'error': {
          const p = ev.payload as { message: string }
          this.view.error = p.message
          this.apply()
          break
        }
        default:
          break
      }
      this.syncStore()
    })
    this.client.wsClosedHandler = () => {
      this.view.connection = this.view.joined ? 'reconnecting' : 'offline'
      this.syncStore()
      this.apply()
    }
  }

  /** Push the current MultiplayerView into the central store. */
  private syncStore() {
    store.setMulti({
      active: !!this.view.joined,
      connection: this.view.connection,
      lobbyCode: this.view.lobbyCode,
      error: this.view.error,
      championship: this.view.championship,
      lobby: this.view.lobby,
      race: this.view.race,
    } as never)
  }

  private apply() {
    for (const fn of [...this.listeners]) fn(this.view)
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.view)
    return () => { this.listeners.delete(fn) }
  }

  setName(name: string) {
    this.view.playerName = name.slice(0, 24)
    saveName(this.view.playerName)
    this.client.setName(this.view.playerName)
    this.apply()
  }

  /** Create a new lobby. Clears any prior session. */
  async createLobby(config?: Record<string, unknown>): Promise<void> {
    this.view.connection = 'connecting'
    this.view.error = null
    saveSession(null)
    this.apply()
    await this.client.connect('ws://localhost:8080')
    this.view.connection = 'connected'
    this.client.setName(this.view.playerName)
    this.client.createLobby(config)
  }

  /** Join an existing lobby by code. Clears any prior session. */
  async joinLobby(code: string): Promise<void> {
    const norm = code.toUpperCase().trim()
    this.view.connection = 'connecting'
    this.view.error = null
    saveSession(null)
    saveLastLobby(norm)
    this.view.lobbyCode = norm
    this.apply()
    await this.client.connect('ws://localhost:8080')
    this.view.connection = 'connected'
    this.client.setName(this.view.playerName)
    this.client.joinLobby(norm)
  }

  /** Reconnect to the most recent lobby using the persisted sessionToken. */
  async restoreSession(): Promise<boolean> {
    const s = loadSession()
    if (!s) return false
    this.view.connection = 'reconnecting'
    this.view.lobbyCode = s.code
    this.view.error = null
    this.apply()
    try {
      await this.client.connect('ws://localhost:8080')
      this.view.connection = 'connected'
      this.client.setName(this.view.playerName)
      this.client.restoreSession(s.code, s.sessionToken)
      return true
    } catch (e) {
      this.view.connection = 'error'
      this.view.error = (e as Error).message
      this.apply()
      return false
    }
  }

  /** Leave the current lobby and clear the session. */
  leave() {
    this.client.leaveLobby()
    saveSession(null)
    saveLastLobby(null)
    this.view = {
      ...this.view,
      connection: 'idle',
      lobby: null,
      race: null,
      championship: null,
      joined: null,
      lobbyCode: null,
      error: null,
    }
    this.apply()
  }

  // ---- Action passthroughs ----
  selectTeam(teamId: string) { this.client.selectTeam(teamId) }
  setReady(ready: boolean) { this.client.setReady(ready) }
  startChampionship() { this.client.startChampionship() }
  updateStrategy(strategy: unknown, setup: unknown) { this.client.updateStrategy(strategy, setup) }
  readyTeam(ready: boolean) { this.client.readyTeam(ready) }
  requestRaceState() { this.client.requestRaceState() }
  liveCommand(cmd: Record<string, unknown>) { this.client.liveCommand(cmd) }
  vote(kind: string, payload: number) { this.client.vote(kind, payload) }
  castVote(support: boolean) { this.client.castVote(support) }
  resumeLive() { this.client.resumeLive() }
  nextRound() { this.client.nextRound() }
}

/** Process-wide singleton so the lobby, broadcast, and HQ all share the
 *  same session. Survives in-tab navigation. */
export const mpSession = new MultiplayerSession()
