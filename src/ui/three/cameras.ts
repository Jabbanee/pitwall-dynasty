// Pitwall Dynasty — camera modes and local TV Director.
//
// Architecture rule (locked by taste):
//   AUTHORITATIVE SIMULATION
//   ≠ TRACK PRESENTATION
//   ≠ CAR PRESENTATION
//   ≠ CAMERA DIRECTOR
//   ≠ UI / BROADCAST GRAPHICS
//
// The Director is a local renderer-only concept. Each client may
// pick its own Director mode. The server does not pick cameras.

import * as THREE from 'three'
import type { WorldVisual } from './environment'
import type { CameraPoint } from './track-visual'

export type CameraMode =
  | 'director'
  | 'helicopter'
  | 'trackside'
  | 'onboard'
  | 'leader'
  | 'battle'
  | 'pit-lane'
  | 'follow'

export type DirectorPriority = 'CRITICAL' | 'HIGH' | 'NORMAL'

export interface DirectorEvent {
  kind:
    | 'race-start'
    | 'chequered-flag'
    | 'final-lap'
    | 'overtake'
    | 'pit-entry'
    | 'pit-stop'
    | 'incident'
    | 'leader-change'
    | 'leader-battle'
    | 'player-pit-event'
  priority: DirectorPriority
  /** Car ids the event involves (e.g. the two cars in a battle). */
  carIds?: string[]
  /** Lap fraction where the event is currently happening. */
  atFrac?: number
  /** Wall-clock time of the event, used to expire it from the queue. */
  atTime: number
}

export interface CameraTarget {
  position: THREE.Vector3
  lookAt: THREE.Vector3
  /** Distance the look-ahead should be projected along the centreline. */
  lookAhead: number
  /** For smooth transitions: minimum hold time in seconds. */
  holdSeconds: number
  /** Mode label for the on-screen badge. */
  label: string
  /** Mode used by the camera rig to pick a follow target. */
  followMode?: 'static' | 'leader' | 'battle' | 'followed-car' | 'pit'
}

export interface CarPositionSample {
  carId: string
  position: THREE.Vector3
  speed: number
  /** 0..1 lap fraction. */
  lapFrac: number
}

const STICKY_EVENT_TTL_MS = 8000

/**
 * Build a CameraTarget from a world + a car position sample + a
 * mode. This is the lowest-level camera solver used by both the
 * Director and the manual selectors.
 */
export function solveCameraTarget(
  mode: CameraMode,
  world: WorldVisual,
  followedCar: CarPositionSample | null,
  leader: CarPositionSample | null,
  battle: CarPositionSample[],
  directorEvent: DirectorEvent | null,
  now: number,
): CameraTarget {
  switch (mode) {
    case 'helicopter':
      return helicopterTarget(world, followedCar, leader)
    case 'trackside': {
      const cam = pickTracksideCameraPoint(world, followedCar?.lapFrac ?? leader?.lapFrac ?? 0)
      return tracksideTarget(world, cam)
    }
    case 'onboard':
      return onboardTarget(world, followedCar ?? leader)
    case 'leader':
      return helicopterTarget(world, leader, leader)
    case 'battle':
      return battleTarget(world, battle, followedCar)
    case 'pit-lane':
      return pitLaneTarget(world, followedCar)
    case 'follow':
      return helicopterTarget(world, followedCar, followedCar)
    case 'director':
    default:
      return directorTarget(world, followedCar, leader, battle, directorEvent, now)
  }
}

function pickTracksideCameraPoint(world: WorldVisual, lapFrac: number): CameraPoint {
  let best: CameraPoint | undefined
  let bestD = Infinity
  for (const c of world.cameras) {
    if (c.kind !== 'trackside') continue
    const d = Math.abs(c.centerFrac - ((lapFrac % 1) + 1) % 1)
    if (d < bestD) { bestD = d; best = c }
  }
  return best ?? world.cameras[0]
}

function helicopterTarget(
  world: WorldVisual,
  target: CarPositionSample | null,
  leader: CarPositionSample | null,
): CameraTarget {
  const subject = target ?? leader
  const subjectPos = subject?.position ?? world.positionAt(0, new THREE.Vector3())
  const tangent = world.tangentAt(subject?.lapFrac ?? 0, new THREE.Vector3()).setY(0).normalize()
  const pos = subjectPos.clone().addScaledVector(tangent, -45).add(new THREE.Vector3(0, 75, 0))
  const look = subjectPos.clone().addScaledVector(tangent, 30)
  return {
    position: pos,
    lookAt: look,
    lookAhead: 30,
    holdSeconds: 1.2,
    label: 'HELICOPTER',
    followMode: subject ? 'followed-car' : 'leader',
  }
}

function tracksideTarget(world: WorldVisual, cam: CameraPoint): CameraTarget {
  const up = new THREE.Vector3(0, 1, 0)
  const t = cam.centerFrac
  const trackPos = world.positionAt(t, new THREE.Vector3())
  const tan = world.tangentAt(t, new THREE.Vector3())
  const side = new THREE.Vector3().crossVectors(up, tan).normalize()
  const dir = cam.side === 'left' ? -1 : 1
  const pos = trackPos.clone().addScaledVector(side, dir * cam.lateral)
  pos.y += cam.height
  const look = trackPos.clone().addScaledVector(tan, cam.lookAhead)
  return {
    position: pos,
    lookAt: look,
    lookAhead: cam.lookAhead,
    holdSeconds: 1.6,
    label: 'TRACKSIDE',
    followMode: 'static',
  }
}

function onboardTarget(world: WorldVisual, target: CarPositionSample | null): CameraTarget {
  if (!target) {
    return helicopterTarget(world, null, null)
  }
  const t = target.lapFrac
  const trackPos = world.positionAt(t, new THREE.Vector3())
  const tan = world.tangentAt(t, new THREE.Vector3()).setY(0).normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3().crossVectors(up, tan).normalize()
  const pos = trackPos.clone().addScaledVector(tan, -1.4).addScaledVector(side, 0.6)
  pos.y += 1.4
  const look = trackPos.clone().addScaledVector(tan, 14)
  return {
    position: pos,
    lookAt: look,
    lookAhead: 14,
    holdSeconds: 0.4,
    label: 'T-CAM',
    followMode: 'followed-car',
  }
}

function battleTarget(
  world: WorldVisual,
  battle: CarPositionSample[],
  fallback: CarPositionSample | null,
): CameraTarget {
  const subject = battle[0] ?? fallback
  return helicopterTarget(world, subject, subject)
}

function pitLaneTarget(world: WorldVisual, target: CarPositionSample | null): CameraTarget {
  const t = world.pit.entryFrac + 0.01
  const trackPos = world.positionAt(t, new THREE.Vector3())
  const tan = world.tangentAt(t, new THREE.Vector3())
  const up = new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3().crossVectors(up, tan).normalize()
  const dir = world.pit.side === 'left' ? -1 : 1
  const pos = trackPos.clone().addScaledVector(side, dir * 30)
  pos.y += 9
  const look = trackPos.clone().addScaledVector(tan, 6)
  return {
    position: pos,
    lookAt: look,
    lookAhead: 6,
    holdSeconds: 1.2,
    label: 'PIT LANE',
    followMode: target ? 'pit' : 'static',
  }
}

function directorTarget(
  world: WorldVisual,
  followedCar: CarPositionSample | null,
  leader: CarPositionSample | null,
  battle: CarPositionSample[],
  event: DirectorEvent | null,
  now: number,
): CameraTarget {
  // Priority order: CRITICAL > HIGH > NORMAL. If the event is
  // stale (older than TTL), fall through to the default leader
  // helicopter shot.
  if (event && now - event.atTime < STICKY_EVENT_TTL_MS) {
    if (event.priority === 'CRITICAL') {
      if (event.kind === 'race-start') {
        return {
          position: world.positionAt(0, new THREE.Vector3()).add(new THREE.Vector3(-60, 30, 0)),
          lookAt: world.positionAt(0, new THREE.Vector3()),
          lookAhead: 0,
          holdSeconds: 4,
          label: 'START',
          followMode: 'static',
        }
      }
      if (event.kind === 'chequered-flag') {
        return {
          position: world.positionAt(0, new THREE.Vector3()).add(new THREE.Vector3(0, 20, -40)),
          lookAt: world.positionAt(0.005, new THREE.Vector3()),
          lookAhead: 0,
          holdSeconds: 4,
          label: 'CHEQUERED FLAG',
          followMode: 'static',
        }
      }
      if (event.kind === 'incident' || event.kind === 'player-pit-event') {
        return helicopterTarget(world, followedCar, leader)
      }
    }
    if (event.priority === 'HIGH') {
      if (event.kind === 'pit-entry' || event.kind === 'pit-stop') {
        return pitLaneTarget(world, followedCar)
      }
      if (event.kind === 'overtake' || event.kind === 'leader-battle' || event.kind === 'leader-change') {
        return battleTarget(world, battle, followedCar ?? leader)
      }
    }
  }
  // Default: helicopter on the followed car (or leader).
  return helicopterTarget(world, followedCar, leader)
}

// ---------------------------------------------------------------------------
// TV Director — local renderer-only
// ---------------------------------------------------------------------------

export class TvDirector {
  private queue: DirectorEvent[] = []
  /** When true, the director auto-selects cameras; when false, the
   *  manual mode stays until the user picks a different one. */
  private directorActive = true
  manualMode: CameraMode = 'director'
  /** Minimum seconds between camera switches. Stops jittery swaps. */
  private minSwitchSeconds = 2.4
  private lastSwitchAt = -Infinity
  private currentEvent: DirectorEvent | null = null

  pushEvent(event: DirectorEvent) {
    this.queue.push(event)
    // Keep only the most recent 8 events
    if (this.queue.length > 8) this.queue.shift()
  }

  setManualMode(mode: CameraMode) {
    this.manualMode = mode
    this.directorActive = mode === 'director'
  }

  /**
   * Solve the active camera target. Returns the target plus a flag
   * indicating whether the camera should cut or smoothly pan.
   */
  solve(
    world: WorldVisual,
    followedCar: CarPositionSample | null,
    leader: CarPositionSample | null,
    battle: CarPositionSample[],
    now: number,
  ): { target: CameraTarget; cut: boolean } {
    if (!this.directorActive) {
      const t = solveCameraTarget(this.manualMode, world, followedCar, leader, battle, null, now)
      return { target: t, cut: true }
    }
    // Pick the highest-priority non-stale event.
    const fresh = this.queue
      .filter((e) => now - e.atTime < STICKY_EVENT_TTL_MS)
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))[0] ?? null
    const lastSeconds = (now - this.lastSwitchAt) / 1000
    if (fresh && (fresh !== this.currentEvent || lastSeconds >= this.minSwitchSeconds)) {
      this.currentEvent = fresh
      this.lastSwitchAt = now
      const t = solveCameraTarget('director', world, followedCar, leader, battle, fresh, now)
      return { target: t, cut: fresh.priority === 'CRITICAL' || lastSeconds >= 6 }
    }
    if (lastSeconds >= this.minSwitchSeconds) {
      // Cycle a trackside shot every few seconds for visual variety.
      this.lastSwitchAt = now
    }
    const t = solveCameraTarget('director', world, followedCar, leader, battle, this.currentEvent, now)
    return { target: t, cut: false }
  }

  reset() {
    this.queue = []
    this.currentEvent = null
    this.lastSwitchAt = -Infinity
  }
}

function priorityRank(p: DirectorPriority): number {
  return p === 'CRITICAL' ? 3 : p === 'HIGH' ? 2 : 1
}
