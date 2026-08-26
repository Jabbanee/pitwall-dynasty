import type { Championship } from '../core/types'
import { GameEngine } from '../championship/game-engine'
import { aiPrepareRound } from '../ai/ai-manager'
import { hasSave, loadFromStorage, saveToStorage, clearSave } from './persistence'
import { toast } from '../ui/dom'

/**
 * AppStore — client-side holder for the authoritative championship. In this
 * local prototype the "server" runs in-process; the API boundary is the
 * GameEngine class. A real deployment swaps this module for a transport
 * layer without touching the UI code.
 */

type Listener = () => void

class AppStore {
  champ: Championship | null = null
  engine: GameEngine | null = null
  private listeners = new Set<Listener>()
  /** Countdown deadline (epoch ms) for the management phase. */
  managementDeadline = 0

  setChampionship(champ: Championship) {
    this.champ = champ
    this.engine = new GameEngine(champ)
    this.managementDeadline = Date.now() + champ.config.managementPhaseSeconds * 1000
    this.emit()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit() {
    for (const fn of [...this.listeners]) fn()
  }

  get playerTeam() {
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
    this.engine.lockRound()
    saveToStorage(this.champ)
    this.emit()
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
