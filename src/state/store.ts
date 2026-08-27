import type { Championship } from '../core/types'
import { GameEngine } from '../championship/game-engine'
import { aiPrepareRound } from '../ai/ai-manager'
import { hasSave, loadFromStorage, saveToStorage, clearSave } from './persistence'
import { toast } from '../ui/dom'
import type { ChampionshipSummary, RaceSnapshot, LobbySnapshot } from '../client/multiplayer-client'

/**
 * AppStore — client-side holder for the LOCAL championship. The local
 * championship is what single-player / Quick Start / Solo Career uses.
 *
 * Multiplayer uses a SEPARATE mirror (`store.multi`) populated by the
 * `MultiplayerSession` from authoritative server snapshots. In multiplayer
 * mode the UI MUST read `store.multi`, not `store.champ`.
 *
 * Two-mode rule:
 *   - `multi.active === true`  → broadcast, results, standings, hq,
 *     management, qualifying all read from `store.multi`. The local
 *     `champ` is irrelevant and must NOT be consulted.
 *   - `multi.active === false` → everything reads from `champ` as before.
 */

export type MultiplayerConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error'

type Listener = () => void

class AppStore {
  /** Local-mode championship (Quick Start, Solo Career, previous save). */
  champ: Championship | null = null
  engine: GameEngine | null = null
  private listeners = new Set<Listener>()
  /** Countdown deadline (epoch ms) for the management phase. */
  managementDeadline = 0

  /**
   * Multiplayer read-only mirror. Populated by MultiplayerSession.
   * In multiplayer mode this is the only thing the broadcast/HQ/standings
   * UI is allowed to read. The simulation never happens here.
   */
  multi: {
    active: boolean
    connection: MultiplayerConnection
    lobbyCode: string | null
    error: string | null
    championship: ChampionshipSummary | null
    lobby: LobbySnapshot | null
    race: RaceSnapshot | null
    joined: { code: string; playerId: string; sessionToken: string } | null
  } = {
    active: false,
    connection: 'idle',
    lobbyCode: null,
    error: null,
    championship: null,
    lobby: null,
    race: null,
    joined: null,
  }

  setChampionship(champ: Championship) {
    this.champ = champ
    this.engine = new GameEngine(champ)
    this.managementDeadline = Date.now() + champ.config.managementPhaseSeconds * 1000
    this.emit()
  }

  /**
   * Force-clear any in-memory local championship. Used when entering
   * a multiplayer championship so the previous local Quick Start state
   * cannot contaminate the multiplayer view.
   */
  clearLocalChampionship() {
    if (this.champ) {
      this.champ = null
      this.engine = null
      this.emit()
    }
  }

  setMulti(multi: Partial<AppStore['multi']>) {
    this.multi = { ...this.multi, ...multi }
    this.emit()
  }

  /** Strict multiplayer mode check. */
  get isMultiplayer(): boolean {
    return this.multi.active
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  emit() {
    for (const fn of [...this.listeners]) fn()
  }

  get playerTeam() {
    // Multiplayer mode: local `champ` is the only complete Team record.
    // The multiplayer view layer does not use `store.playerTeam`; it reads
    // directly from `store.multi.championship.teams`. Returning undefined
    // here keeps the local-mode consumers from accidentally consuming
    // a multi-mode state.
    if (this.multi.active) return undefined
    if (!this.champ?.playerTeamId || !this.champ) return undefined
    return this.champ.teams.find((t) => t.id === this.champ!.playerTeamId)
  }

  lockAndSimulate() {
    if (!this.engine || !this.champ) return
    // AI teams prepare their rounds using the same playbook system
    for (const team of this.champ.teams) {
      if (team.id === this.champ.playerTeamId) continue
      const prep = aiPrepareRound(this.champ, team)
      this.engine.updateStrategy(team.id, prep)
    }
    // Lock packages + run qualifying; skip the full race here so the
    // broadcast view can drive it via LiveRaceEngine in real time.
    this.engine.lockRound(undefined, { headless: false })
    saveToStorage(this.champ)
    this.emit()
  }

  /** Run the live race to completion (used by broadcast view). */
  finishLiveRace(result: import('../core/types').RaceResult) {
    if (!this.engine || !this.champ) return
    const round = this.engine.currentRound
    if (round.raceDone) return
    round.raceResult = result
    round.raceDone = true
    round.phase = 'roundResults'
    this.champ.phase = 'roundResults'
    // Settle finances and publish news
    import('../championship/engine').then(({ settleRoundFinances, addNews }) => {
      settleRoundFinances(this.champ!, round.index)
      const winner = result.results[0]
      if (winner) {
        const wName = this.champ!.drivers[winner.driverId]?.lastName ?? winner.driverId
        const wTeam = this.champ!.teams.find((t) => t.id === winner.teamId)?.name ?? ''
        addNews(this.champ!, `RACE RESULT — ${this.champ!.circuits[round.index]?.name ?? ''}`, `${wName} (${wTeam}) wins.`)
      }
      saveToStorage(this.champ!)
      this.emit()
    })
  }

  advanceRound() {
    if (!this.engine || !this.champ) return
    const outcome = this.engine.advanceRound()
    this.managementDeadline = Date.now() + this.champ.config.managementPhaseSeconds * 1000
    saveToStorage(this.champ)
    this.emit()
    return outcome
  }

  tryLoadSave(): boolean {
    if (!hasSave()) return false
    const res = loadFromStorage()
    if (res.ok && res.champ) {
      this.setChampionship(res.champ)
      if (res.migrated) toast('Save loaded — schema updated.')
      else toast('Save loaded.')
      return true
    }
    toast(res.error ?? 'Failed to load save.', true)
    clearSave()
    return false
  }

  save() {
    if (this.champ) {
      saveToStorage(this.champ)
      toast('Game saved.')
    }
  }
}

export const store = new AppStore()
