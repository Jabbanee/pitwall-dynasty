import type { RaceEvent, RaceResult } from '../core/types'

/**
 * BroadcastController — shared authoritative playback cursor over an
 * immutable race timeline.
 *
 * SIMULATION TIME = immutable time inside the simulated race.
 * BROADCAST CURSOR = where viewers currently are in playback (can pause,
 * speed up, rewind). The underlying history never changes.
 */

export type CameraMode = 'tv' | 'team' | 'driver' | 'trackMap' | 'battle'

export const CAMERA_MODES: Array<{ id: CameraMode; name: string }> = [
  { id: 'tv', name: 'TV Broadcast' },
  { id: 'team', name: 'Team' },
  { id: 'driver', name: 'Driver' },
  { id: 'trackMap', name: 'Track Map' },
  { id: 'battle', name: 'Battle' },
]

export type PlaybackSpeed = 1 | 2 | 4 | 8

export interface VoteState {
  kind: 'speed' | 'rewind' | 'pause'
  payload?: number // target speed or rewind target seconds
  votesFor: string[]
  votesAgainst: string[]
  expiresAt: number
}

export interface DirectorShot {
  driverId?: string
  reason: string
  priority: number
}

export class BroadcastController {
  result: RaceResult
  /** Shared cursor in simulation-time seconds. */
  cursorSeconds = 0
  playing = true
  speed: PlaybackSpeed = 4
  cameraMode: CameraMode = 'tv'
  focusedDriverId?: string
  teamDriverIds: string[] = []
  activeVote: VoteState | null = null

  constructor(result: RaceResult) {
    this.result = result
  }

  get duration(): number {
    return this.result.totalSimTime + 5
  }

  tick(dtRealSeconds: number, localPlayerId = 'player') {
    if (!this.playing || this.activeVote?.kind === 'pause') {
      this.maybeExpireVote()
      return
    }
    this.cursorSeconds += dtRealSeconds * this.speed
    if (this.cursorSeconds > this.duration) {
      this.cursorSeconds = this.duration
    }
    this.maybeExpireVote()
    void localPlayerId
  }

  // ----- Controls (voting-gated in multiplayer; direct locally) -----

  canControlDirectly(playerCount: number): boolean {
    return playerCount <= 1
  }

  requestSpeed(speed: PlaybackSpeed, playerCount: number): boolean {
    const rule =
      speed === 1 ? 'majority' : speed === 2 ? 'twoX' : 'fourXPlus'
    void rule
    if (this.canControlDirectly(playerCount)) {
      this.speed = speed
      this.playing = true
      return true
    }
    return this.startVote('speed', speed, playerCount)
  }

  requestPause(paused: boolean, playerCount: number): boolean {
    if (this.canControlDirectly(playerCount)) {
      this.playing = !paused
      return true
    }
    return this.startVote('pause', paused ? 1 : 0, playerCount)
  }

  requestRewind(targetSeconds: number, playerCount: number): boolean {
    if (this.canControlDirectly(playerCount)) {
      this.cursorSeconds = Math.max(0, Math.min(this.duration, targetSeconds))
      return true
    }
    return this.startVote('rewind', targetSeconds, playerCount)
  }

  private startVote(kind: VoteState['kind'], payload: number, playerCount: number): boolean {
    if (this.activeVote && this.activeVote.expiresAt > Date.now()) return false
    this.activeVote = {
      kind,
      payload,
      votesFor: ['player'],
      votesAgainst: [],
      expiresAt: Date.now() + 12000,
    }
    // Local prototype resolves immediately by majority-of-one when solo;
    // multiplayer transport layer will gather other clients' votes.
    this.evaluateVote(playerCount)
    return true
  }

  castVote(support: boolean, playerId: string, playerCount: number) {
    if (!this.activeVote) return
    if (support) {
      if (!this.activeVote.votesFor.includes(playerId)) this.activeVote.votesFor.push(playerId)
      this.activeVote.votesAgainst = this.activeVote.votesAgainst.filter((p) => p !== playerId)
    } else {
      if (!this.activeVote.votesAgainst.includes(playerId)) this.activeVote.votesAgainst.push(playerId)
      this.activeVote.votesFor = this.activeVote.votesFor.filter((p) => p !== playerId)
    }
    this.evaluateVote(playerCount)
  }

  private evaluateVote(playerCount: number) {
    const v = this.activeVote
    if (!v) return
    const total = Math.max(1, playerCount)
    const forFrac = v.votesFor.length / total
    let passed = false
    if (v.kind === 'rewind') passed = v.votesAgainst.length === 0 // unanimous
    else if (v.kind === 'pause') passed = forFrac >= 0.5
    else if (v.kind === 'speed') {
      const target = v.payload ?? 1
      passed = target === 1 ? true : target === 2 ? forFrac >= 0.5 : forFrac > 0.9
    }
    // Return-to-1x can never be blocked: always passes with any support
    if (v.kind === 'speed' && v.payload === 1) passed = v.votesFor.length >= 1

    if (Date.now() > v.expiresAt && !passed) {
      // Timeout: only unblockable actions pass
      passed = v.kind === 'speed' && v.payload === 1
      if (!passed) {
        this.activeVote = null
        return
      }
    }

    if (passed) {
      if (v.kind === 'pause') this.playing = v.payload === 1
      else if (v.kind === 'speed') {
        this.speed = (v.payload ?? 1) as PlaybackSpeed
        this.playing = true
      } else if (v.kind === 'rewind') this.cursorSeconds = Math.max(0, Math.min(this.duration, v.payload ?? 0))
      this.activeVote = null
    }
  }

  private maybeExpireVote() {
    const v = this.activeVote
    if (v && Date.now() > v.expiresAt) {
      this.evaluateVote(Math.max(1, v.votesFor.length + v.votesAgainst.length))
      this.activeVote = null
    }
  }

  // ----- Timeline access -----

  visibleEvents(bufferSeconds = 3): RaceEvent[] {
    return this.result.events.filter((e) => e.t <= this.cursorSeconds + bufferSeconds && e.t >= this.cursorSeconds - 30)
  }

  isRevealed(t: number): boolean {
    return t <= this.cursorSeconds + 3
  }
}

// ---------------------------------------------------------------------------
// Automatic broadcast director
// ---------------------------------------------------------------------------

const MIN_SHOT_SECONDS = 6

export class BroadcastDirector {
  private lastShotTime = -999
  private lastFocusDriver?: string

  pickShot(bc: BroadcastController, teamDriverIds: string[]): DirectorShot | null {
    const t = bc.cursorSeconds
    if (t - this.lastShotTime < MIN_SHOT_SECONDS) return null
    const window = bc.result.events.filter((e) => e.t >= bc.cursorSeconds - 4 && e.t <= bc.cursorSeconds + 12)

    let best: DirectorShot | null = null
    for (const e of window) {
      let priority = 0
      let focus = e.driverId
      switch (e.type) {
        case 'safetyCar': case 'virtualSafetyCar': priority = 95; break
        case 'retirement': priority = 85; break
        case 'collision': priority = 80; break
        case 'spin': priority = 70; break
        case 'leadChange': priority = 88; break
        case 'overtake': {
          priority = e.data?.newPosition === 1 ? 90 : 62
          break
        }
        case 'pitStop': priority = 45; break
        case 'fastestLap': priority = 50; break
        case 'weatherChange': priority = 55; break
        case 'finish': priority = 100; break
        default: priority = 10
      }
      // Team bias: prefer shots of the viewer's team slightly
      if (e.driverId && teamDriverIds.includes(e.driverId)) priority += 12
      // Avoid frantic switching back to the same car repeatedly
      if (e.driverId === this.lastFocusDriver) priority -= 8
      if (!best || priority > best.priority) best = { driverId: focus, reason: `${e.type}: ${e.detail}`, priority }
    }

    // Default: follow the leader / closest battle
    if ((!best || best.priority < 20) && bc.result.results[0]) {
      const leader = bc.result.results.find((r) => r.classified)
      if (leader) best = { driverId: leader.driverId, reason: 'Race leader', priority: 20 }
    }

    if (best) {
      this.lastShotTime = t
      this.lastFocusDriver = best.driverId
    }
    return best
  }
}
