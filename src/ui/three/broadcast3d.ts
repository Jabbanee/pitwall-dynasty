import * as THREE from 'three'
import { el, toast, fmtRaceClock } from '../dom'
import { store } from '../../state/store'
import { mpSession, type MultiplayerView } from '../../client/multiplayer-session'
import type { RaceSnapshot, LobbySnapshot, ChampionshipSummary } from '../../client/multiplayer-client'
import { buildTrackWorld, type WorldVisual } from './environment'
import { getTrackVisualDefinition } from './track-visual'
import { TvDirector, type CameraMode, type DirectorEvent, type CarPositionSample } from './cameras'
import { createCar, type CarVisual } from './car3d'
import { TYRES } from '../../core/tyres'
import { createCommentaryDisplay } from '../../media/commentary-display'
import { assessCompliance } from '../../drivers/agency'
import { regulationsForYear, teamOrderAvailability } from '../../regulations/regulations'
import { CIRCUITS } from '../../core/content'

/**
 * 3D Race Broadcast — helicopter-camera presentation of the live
 * server-authoritative race. Driver-follow default, battle notifications,
 * live strategy controls, team radio.
 *
 * Two-mode rule (P0 multiplayer):
 *   - `store.multi.active === true`  → SERVER AUTHORITY ONLY. The 3D
 *     view reflects race snapshots pushed by the authoritative server
 *     via `mpSession`. No local LiveRaceEngine is ever constructed.
 *   - `store.multi.active === false` → local Solo / Quick Start
 *     championship runs a local LiveRaceEngine against the local
 *     championship.
 *
 * The two modes never mix. The MultiplayerSession and the local store
 * are the only sources of truth per mode.
 */

interface Car3D {
  driverId: string
  visual: CarVisual
  lastLap: number
}

interface BattleGroup {
  id: string
  label: string
  driverIds: string[]
  priority: number
  gapSeconds: number
}

export function renderBroadcast3D(root: HTMLElement) {
  root.innerHTML = ''

  // --- Layout ---
  const wrap = el('div', { class: 'broadcast3d-wrap' })
  const stage = el('div', { class: 'broadcast3d-stage' })
  const canvasHost = el('div', { class: 'broadcast3d-canvas' })
  stage.appendChild(canvasHost)

  // HUD overlays
  const topHud = el('div', { class: 'b3d-top-hud' })
  const followBar = el('div', { class: 'b3d-follow-bar' })
  const battleStack = el('div', { class: 'b3d-battle-stack' })
  const radioFeed = el('div', { class: 'b3d-radio-feed' })
  const commentaryFeed = el('div', { class: 'b3d-commentary' })
  const strategyPanel = el('div', { class: 'b3d-strategy' })
  const timingMini = el('div', { class: 'b3d-timing' })
  const mpBadge = el('div', { class: 'b3d-mp-badge' })
  const controls = el('div', { class: 'broadcast-controls' })

  // Camera mode badge — TV Director label, sits in the top-right
  // corner so the player can see what mode the broadcast is in.
  const cameraBadge = el('div', { class: 'b3d-camera-badge' }, 'TV DIRECTOR')
  ;(wrap as unknown as { __cameraBadge?: HTMLElement }).__cameraBadge = cameraBadge

  // Banner — flashes "LIGHTS OUT", "FINAL LAP", "CHEQUERED FLAG" on race events.
  const eventBanner = el('div', { class: 'b3d-event-banner' })
  eventBanner.style.opacity = '0'
  stage.appendChild(eventBanner)

  function showBanner(text: string, durationMs: number, accent: 'start' | 'flag' | 'lap' = 'start') {
    eventBanner.textContent = text
    eventBanner.dataset.accent = accent
    eventBanner.style.opacity = '1'
    setTimeout(() => { eventBanner.style.opacity = '0' }, durationMs)
  }

  // Manual camera selector — sits below the badge.
  const cameraSelector = el('div', { class: 'b3d-camera-selector' })
  const cameraOptions: Array<{ mode: CameraMode; label: string }> = [
    { mode: 'director', label: 'TV DIRECTOR' },
    { mode: 'helicopter', label: 'HELICOPTER' },
    { mode: 'trackside', label: 'TRACKSIDE' },
    { mode: 'onboard', label: 'T-CAM' },
    { mode: 'leader', label: 'LEADER' },
    { mode: 'pit-lane', label: 'PIT LANE' },
  ]
  for (const opt of cameraOptions) {
    const btn = el('button', { class: 'b3d-cam-btn' }, opt.label)
    btn.addEventListener('click', () => {
      const fn = (wrap as unknown as { __setCameraMode?: (m: CameraMode) => void }).__setCameraMode
      if (fn) fn(opt.mode)
    })
    cameraSelector.appendChild(btn)
  }

  stage.append(topHud, followBar, battleStack, commentaryFeed, radioFeed, strategyPanel, timingMini, mpBadge, cameraBadge, cameraSelector)
  wrap.append(stage)
  root.appendChild(wrap)
  root.appendChild(controls)

  // --- State ---
  let lobbyCode = mpSession.view.lobbyCode ?? ''
  let lobby: LobbySnapshot | null = mpSession.view.lobby
  let race: RaceSnapshot | null = mpSession.view.race
  let championship: ChampionshipSummary | null = mpSession.view.championship
  let followDriverId: string | null = null
  let myDriverIds: string[] = []
  let running = true
  let battleNotifications: Array<BattleGroup & { shownAt: number }> = []
  let currentBattles: BattleGroup[] = []
  const cameraMode: 'heli' | 'map' = 'heli'
  const commentary = createCommentaryDisplay()
  type LocalEngine = {
    state: { simTime: number; leaderLap: number; totalLaps: number; trackWetness: number; condition: string }
    isFinished: () => boolean
    stepLap: () => void
    orderedCars: () => Array<{ driverId: string; teamId: string; carNumber: number; position: number; lapsDone: number; totalTime: number; tyre: string; tyreAge: number; tyreWear: number; pitStops: number; strategy: { paceMode: string; energy: string }; damage: number; pitThisLap: boolean; pitNextLap: boolean; retired: boolean; finished: boolean }>
    results: () => Array<{ driverId: string; teamId: string; finishPosition: number; classified: boolean; lapsCompleted: number; bestLapTime?: number; pitStops: number; points: number; fastestLap: boolean; dnfReason?: string }>
    applyCommand: (cmd: unknown) => { ok: boolean; response: string; deferred?: boolean }
  }
  let localEngine: LocalEngine | null = null
  let cursorSeconds = 0
  let speed = 1
  let paused = false

  // --- Three.js setup ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = false
  canvasHost.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0e14)
  scene.fog = new THREE.Fog(0x0a0e14, 500, 1400)

  // Lights — updated by weather and theme.
  const hemi = new THREE.HemisphereLight(0xbfd1da, 0x324428, 0.65)
  scene.add(hemi)
  const dir = new THREE.DirectionalLight(0xfff1d1, 0.95)
  dir.position.set(120, 220, 80)
  scene.add(dir)

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 1, 3000)
  const camPos = new THREE.Vector3(0, 120, 160)
  const camTarget = new THREE.Vector3()
  camera.position.copy(camPos)

  scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x1a2418, 1.15))
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4)
  sun.position.set(300, 500, 200)
  scene.add(sun)

  // --- Car pool ---
  const car3ds = new Map<string, Car3D>()

  // Track
  let track: WorldVisual | null = null

  function getActiveCircuit() {
    if (championship?.circuit) {
      const fromChamp = CIRCUITS.find((c) => c.id === championship!.circuit!.id)
      if (fromChamp) return fromChamp
    }
    if (store.champ) {
      const r = store.champ.rounds[store.champ.currentRoundIndex]
      const c = store.champ.circuits.find((x) => x.id === r.circuitId)
      if (c) return c
    }
    return null
  }

  function ensureTrack() {
    const c = getActiveCircuit()
    if (!c) return
    if (!track) {
      const def = getTrackVisualDefinition(c)
      const level = graphicsLevelFromSettings()
      track = buildTrackWorld(c, def, level)
      scene.add(track.group)
      // Apply the environment theme to the sky / fog / lights.
      const theme = track.theme
      scene.background = new THREE.Color(theme.sky)
      scene.fog = new THREE.Fog(theme.fog, 380, 1500)
      hemi.color = new THREE.Color(theme.hemiSky)
      hemi.groundColor = new THREE.Color(theme.hemiGround)
      dir.color = new THREE.Color(theme.sun)
      const [sx, sy, sz] = theme.sunDir
      dir.position.set(sx * 220, sy * 220, sz * 220)
      // Spray particles — small Points cloud that grows in wet
      // conditions. Pooled for performance.
      ensureSpray()
    }
  }

  // --- Spray particles (wet track) ---
  let sprayGeo: THREE.BufferGeometry | null = null
  let sprayPoints: THREE.Points | null = null
  let sprayVel: Float32Array | null = null
  let sprayLife: Float32Array | null = null
  const SPRAY_MAX = 220
  function ensureSpray() {
    if (sprayPoints) return
    sprayGeo = new THREE.BufferGeometry()
    const pos = new Float32Array(SPRAY_MAX * 3)
    sprayVel = new Float32Array(SPRAY_MAX * 3)
    sprayLife = new Float32Array(SPRAY_MAX)
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const sprite = new THREE.PointsMaterial({
      color: 0xdde2e8,
      size: 0.6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    sprayPoints = new THREE.Points(sprayGeo, sprite)
    scene.add(sprayPoints)
  }
  function tickSpray(dt: number, wetness: number) {
    if (!sprayPoints || !sprayGeo || !sprayVel || !sprayLife) return
    const posAttr = sprayGeo.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    const opacityMax = Math.min(0.8, wetness * 1.2)
    ;(sprayPoints.material as THREE.PointsMaterial).opacity = opacityMax
    for (let i = 0; i < SPRAY_MAX; i++) {
      if (sprayLife[i] > 0) {
        sprayLife[i] -= dt
        arr[i * 3] += sprayVel[i * 3] * dt
        arr[i * 3 + 1] += sprayVel[i * 3 + 1] * dt
        arr[i * 3 + 2] += sprayVel[i * 3 + 2] * dt
        sprayVel[i * 3 + 1] -= 4 * dt // light gravity
        continue
      }
      // Respawn from a random car if it's wet enough.
      if (wetness > 0.05 && Math.random() < 0.16) {
        const carList = Array.from(car3ds.values())
        if (carList.length === 0) continue
        const c = carList[Math.floor(Math.random() * carList.length)]
        if (!c) continue
        const p = c.visual.group.position
        const heading = c.visual.group.rotation.y
        const back = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
        arr[i * 3] = p.x - back.x * 4
        arr[i * 3 + 1] = p.y + 0.4
        arr[i * 3 + 2] = p.z - back.z * 4
        sprayVel[i * 3] = -back.x * 6 + (Math.random() - 0.5) * 2
        sprayVel[i * 3 + 1] = 3 + Math.random() * 2
        sprayVel[i * 3 + 2] = -back.z * 6 + (Math.random() - 0.5) * 2
        sprayLife[i] = 0.6 + Math.random() * 0.3
      }
    }
    posAttr.needsUpdate = true
  }
  // Expose dispose to the cleanup observer.
  function disposeSpray() {
    if (sprayPoints) {
      scene.remove(sprayPoints)
      sprayPoints.geometry.dispose()
      ;(sprayPoints.material as THREE.Material).dispose()
      sprayPoints = null
      sprayGeo = null
    }
  }

  function applyWeatherVisuals(wetness: number, condition: string) {
    if (!track) return
    const theme = track.theme
    // Wet track darkens the asphalt and adds a cool sky tint.
    const skyBase = new THREE.Color(theme.sky)
    const skyWet = skyBase.clone().multiplyScalar(0.55).offsetHSL(0, 0.05, -0.05)
    const wet = Math.max(0, Math.min(1, wetness))
    scene.background = new THREE.Color().lerpColors(skyBase, skyWet, wet)
    const fogBase = new THREE.Color(theme.fog)
    const fogWet = fogBase.clone().multiplyScalar(0.7)
    scene.fog = new THREE.Fog(new THREE.Color().lerpColors(fogBase, fogWet, wet), 380 - 120 * wet, 1500 - 400 * wet)
    dir.intensity = 0.95 - 0.45 * wet
    hemi.intensity = 0.65 - 0.2 * wet
    if (condition === 'heavyRain') dir.intensity = 0.4
  }

  function teamColorsOf(teamId: string): { primary: string; secondary: string } {
    if (lobby) {
      const t = lobby.teams.find((x) => x.teamId === teamId)
      if (t) return t.colors
    }
    if (championship) {
      const t = championship.teams.find((x) => x.id === teamId)
      if (t) return t.colors
    }
    if (store.champ) {
      const t = store.champ.teams.find((x) => x.id === teamId)
      if (t) return t.colors
    }
    return { primary: '#888888', secondary: '#ffffff' }
  }

  function eraFactorFor(year: number): number {
    if (year <= 1980) return 0
    if (year <= 1990) return 0.15
    if (year <= 2000) return 0.35
    if (year <= 2010) return 0.55
    if (year <= 2014) return 0.7
    if (year <= 2021) return 0.82
    return 0.95
  }

  function getEraYear(): number {
    if (championship?.config && typeof (championship.config as Record<string, unknown>).eraYear === 'number') {
      return (championship.config as Record<string, number>).eraYear
    }
    if (store.champ?.config.eraYear) return store.champ.config.eraYear
    return 2024
  }

  function ensureCars(snapshot: RaceSnapshot) {
    if (!track) return
    const era = eraFactorFor(getEraYear())
    for (const car of snapshot.cars) {
      if (!car3ds.has(car.driverId)) {
        const colors = teamColorsOf(car.teamId)
        const visual = createCar({ colors, carNumber: car.carNumber, eraFactor: era })
        scene.add(visual.group)
        car3ds.set(car.driverId, { driverId: car.driverId, visual, lastLap: car.lap })
      }
    }
    for (const [driverId, c] of car3ds) {
      if (!snapshot.cars.some((x) => x.driverId === driverId)) {
        scene.remove(c.visual.group)
        c.visual.dispose()
        car3ds.delete(driverId)
      }
    }
  }

  const tmpPos = new THREE.Vector3()
  const tmpTan = new THREE.Vector3()

  function compoundIndex(tyre: string | undefined): number {
    if (!tyre) return 1
    const t = tyre.toLowerCase()
    if (t.startsWith('soft')) return 0
    if (t.startsWith('medium')) return 1
    if (t.startsWith('hard')) return 2
    if (t.startsWith('inter')) return 3
    if (t.startsWith('wet')) return 4
    return 1
  }

  function updateCarPositions(snapshot: RaceSnapshot) {
    if (!track) return
    const leader = snapshot.cars.find((c) => c.position === 1)
    const leaderLap = leader?.lap ?? 0
    for (const car of snapshot.cars) {
      const c3d = car3ds.get(car.driverId)
      if (!c3d) continue
      const totalLen = track.totalLength
      const gapMeters = car.gapSeconds * 55
      const frac = (((car.lap - leaderLap) + (gapMeters / totalLen)) % 1 + 1) % 1 + 0.0
      const lapFrac = ((car.lap % 1) + frac) % 1
      track.positionAt(lapFrac, tmpPos)
      track.tangentAt(lapFrac, tmpTan)
      c3d.visual.group.position.lerp(tmpPos, 0.25)
      const heading = Math.atan2(tmpTan.x, tmpTan.z)
      c3d.visual.group.rotation.y = heading
      // Approximate visual speed (m/s) from the gap-vs-leader delta
      // plus a base pace. The simulation owns the actual speed.
      const speed = 55 + (car.gapSeconds < 0 ? -car.gapSeconds * 1.4 : 0)
      c3d.visual.update(0, speed, 0, 0)
      c3d.visual.setCompound(compoundIndex(car.tyre))
      c3d.visual.setRetired(!!car.retired)
    }
  }

  // --- Camera + TV Director ---
  const director = new TvDirector()
  let directorMode: CameraMode = 'director'

  function setCameraMode(mode: CameraMode) {
    directorMode = mode
    director.setManualMode(mode)
  }
  // Expose the mode switcher on the broadcast wrap so UI buttons
  // (helicopter / trackside / etc) can drive it.
  ;(wrap as unknown as { __setCameraMode?: (m: CameraMode) => void }).__setCameraMode = setCameraMode
  ;(wrap as unknown as { __getCameraMode?: () => CameraMode }).__getCameraMode = () => directorMode
  ;(wrap as unknown as { __pushEvent?: (e: DirectorEvent) => void }).__pushEvent = (e) => director.pushEvent(e)

  function graphicsLevelFromSettings(): 0 | 1 | 2 | 3 {
    try {
      const raw = localStorage.getItem('pitwall-dynasty.settings')
      if (!raw) return 2
      const parsed = JSON.parse(raw)
      const q = parsed?.graphicsQuality
      if (q === 'low') return 0
      if (q === 'medium') return 1
      if (q === 'high') return 2
      if (q === 'ultra') return 3
    } catch (_) { /* ignore */ }
    return 2
  }

  function updateCamera(dt: number) {
    if (!track) return
    let targetDriverId = followDriverId
    if (!targetDriverId || !car3ds.has(targetDriverId)) {
      targetDriverId = myDriverIds[0] ?? race?.cars.find((c) => c.position === 1)?.driverId ?? null
    }
    const c3d = targetDriverId ? car3ds.get(targetDriverId) : undefined
    const followedSample: CarPositionSample | null = c3d
      ? {
          carId: c3d.driverId,
          position: c3d.visual.group.position.clone(),
          speed: c3d.lastLap > 0 ? (track.totalLength / c3d.lastLap) : 0,
          lapFrac: lapFracOf(c3d.driverId),
        }
      : null
    const leaderCar = race?.cars.find((c) => c.position === 1 && !c.retired)
    const leaderC3d = leaderCar ? car3ds.get(leaderCar.driverId) : null
    const leaderSample: CarPositionSample | null = leaderC3d
      ? {
          carId: leaderC3d.driverId,
          position: leaderC3d.visual.group.position.clone(),
          speed: 0,
          lapFrac: lapFracOf(leaderC3d.driverId),
        }
      : null
    const battle: CarPositionSample[] = []
    for (const b of currentBattles) {
      for (const id of b.driverIds) {
        const c = car3ds.get(id)
        if (c) battle.push({ carId: id, position: c.visual.group.position.clone(), speed: 0, lapFrac: lapFracOf(id) })
      }
    }
    const { target, cut } = director.solve(track, followedSample, leaderSample, battle, performance.now())
    // Smoothly interpolate the camera position. CRITICAL events
    // (race start, chequered flag, incident) cut for impact.
    const lerp = cut ? 1 : 1 - Math.pow(0.06, dt)
    camPos.lerp(target.position, lerp)
    camTarget.lerp(target.lookAt, Math.min(1, lerp * 1.5))
    camera.position.copy(camPos)
    camera.lookAt(camTarget)
    // Push the active label to the on-screen badge.
    const modeBadge = (wrap as unknown as { __cameraBadge?: HTMLElement }).__cameraBadge
    if (modeBadge) modeBadge.textContent = target.label
  }

  function lapFracOf(driverId: string): number {
    if (!race) return 0
    const c = race.cars.find((x) => x.driverId === driverId)
    if (!c || !track) return 0
    return Math.max(0, Math.min(0.999, c.lap / Math.max(1, race.totalLaps)))
  }

  function detectBattles(snapshot: RaceSnapshot): BattleGroup[] {
    const running = snapshot.cars.filter((c) => !c.retired && !c.finished).sort((a, b) => a.position - b.position)
    const groups: BattleGroup[] = []
    for (let i = 0; i < running.length - 1; i++) {
      const a = running[i]
      const b = running[i + 1]
      const gap = Math.abs(a.gapSeconds - b.gapSeconds)
      if (gap < 1.2) {
        const label = a.position <= 2 ? 'Battle for Lead' : `Battle for P${a.position}`
        groups.push({
          id: `${a.driverId}|${b.driverId}`,
          label,
          driverIds: [a.driverId, b.driverId],
          priority: a.position <= 2 ? 90 : a.position <= 4 ? 70 : 40,
          gapSeconds: gap,
        })
      }
    }
    return groups
  }

  function isBattleVisible(battle: BattleGroup): boolean {
    if (cameraMode === 'map') return true
    if (!followDriverId) return false
    return battle.driverIds.includes(followDriverId)
  }

  function updateBattleNotifications(snapshot: RaceSnapshot) {
    const battles = detectBattles(snapshot)
    currentBattles = battles
    const now = Date.now()
    for (const b of battles) {
      if (b.priority < 60) continue
      if (isBattleVisible(b)) continue
      if (battleNotifications.some((n) => n.id === b.id && now - n.shownAt < 20000)) continue
      battleNotifications.push({ ...b, shownAt: now })
    }
    battleNotifications = battleNotifications.filter((n) => now - n.shownAt < 12000)
    battleStack.innerHTML = ''
    for (const n of battleNotifications.slice(-3)) {
      const names = n.driverIds.map((id) => driverName(id)).join(' · ')
      const card = el('div', { class: 'b3d-battle-card' },
        el('div', { class: 'b3d-battle-title' }, `⚔ ${n.label}`),
        el('div', { class: 'b3d-battle-names' }, names),
        el('button', { class: 'small', onclick: () => { followDriverId = n.driverIds[0]; refreshFollowBar() } }, 'WATCH'),
      )
      battleStack.appendChild(card)
    }
  }

  function driverName(driverId: string): string {
    if (championship?.drivers?.[driverId]) {
      const d = championship.drivers[driverId]
      return d.lastName
    }
    if (store.champ?.drivers[driverId]) {
      return store.champ.drivers[driverId].lastName
    }
    return driverId.slice(-5)
  }

  function refreshFollowBar() {
    followBar.innerHTML = ''
    const mk = (label: string, driverId: string | null, selected: boolean) =>
      el('button', {
        class: selected ? 'selected' : '',
        onclick: () => { if (driverId) followDriverId = driverId; refreshFollowBar() },
      }, label)
    followBar.appendChild(mk('My Driver 1', myDriverIds[0] ?? null, followDriverId === myDriverIds[0]))
    followBar.appendChild(mk('My Driver 2', myDriverIds[1] ?? null, followDriverId === myDriverIds[1]))
    followBar.appendChild(mk('Leader', race?.cars.find((c) => c.position === 1)?.driverId ?? null, followDriverId === race?.cars.find((c) => c.position === 1)?.driverId))
    if (myDriverIds.length > 0) {
      followBar.appendChild(el('button', { class: 'back-btn', onclick: () => { followDriverId = myDriverIds[0]; refreshFollowBar() } }, '⏎ BACK TO MY DRIVER'))
    }
  }

  function refreshMpBadge() {
    if (store.multi.active && lobbyCode) {
      mpBadge.innerHTML = ''
      mpBadge.appendChild(el('span', { class: 'b3d-mp-pill' },
        el('span', { class: 'b3d-mp-dot' }),
        `MULTIPLAYER · ${lobbyCode}`,
      ))
      const conn = store.multi.connection
      if (conn !== 'connected') {
        mpBadge.appendChild(el('span', { class: `b3d-mp-conn ${conn}` }, conn.toUpperCase()))
      }
      if (store.multi.error) {
        mpBadge.appendChild(el('span', { class: 'b3d-mp-err' }, store.multi.error))
      }
    } else {
      mpBadge.innerHTML = ''
    }
  }

  /**
   * Send a live command. In multiplayer mode this is an authoritative
   * request to the server. In local mode it goes through the local
   * LiveRaceEngine (see startLocalRace).
   */
  function sendCommand(cmd: Record<string, unknown>) {
    if (store.multi.active) {
      mpSession.liveCommand(cmd)
    } else if (localEngine) {
      const res = localEngine.applyCommand(cmd)
      toast(res.response, res.deferred === true)
      if (res.deferred) {
        radioFeed.appendChild(el('div', { class: 'event-line big' }, `📻 ${res.response}`))
      }
    }
  }

  function updateStrategyPanel(snapshot: RaceSnapshot) {
    const targetId = followDriverId ?? myDriverIds[0]
    strategyPanel.innerHTML = ''
    if (!targetId) return
    const car = snapshot.cars.find((c) => c.driverId === targetId)
    if (!car) return
    const isMine = car.isMyTeam
    const tyreColor = TYRES[car.tyre as keyof typeof TYRES]?.color ?? '#888'
    const head = el('div', { class: 'b3d-strat-head' },
      el('span', { class: 'b3d-strat-name' }, `#${car.carNumber} ${driverName(car.driverId)}`),
      el('span', { class: 'badge grey' }, `P${car.position}`),
      car.pitThisLap ? el('span', { class: 'badge yellow' }, 'BOXING') : null,
      car.retired ? el('span', { class: 'badge red' }, 'OUT') : null,
    )
    const stats = el('div', { class: 'b3d-strat-stats' },
      statLine('Gap', `${car.gapSeconds >= 0 ? '+' : ''}${car.gapSeconds.toFixed(1)}s`),
      statLine('Lap', `${car.lap}/${snapshot.totalLaps}`),
      statLine('Tyre', `<span class="tyre-dot" style="background:${tyreColor}"></span> ${car.tyre} · ${car.tyreAge} laps`),
      statLine('Wear', `${Math.round(car.tyreWear * 100)}%`),
      statLine('Pace', car.paceMode),
      statLine('Energy', car.energy),
      car.damage > 0.05 ? statLine('Damage', `${Math.round(car.damage * 100)}%`, 'var(--bad)') : null,
    )
    strategyPanel.append(head, stats)
    if (!isMine) {
      strategyPanel.appendChild(el('div', { class: 'b3d-strat-note' }, 'Not your car — follow only.'))
      return
    }
    const paceGroup = el('div', { class: 'seg-group' })
    for (const mode of ['conserve', 'normal', 'push', 'attack']) {
      paceGroup.appendChild(el('button', {
        class: car.paceMode === mode ? 'selected' : '',
        onclick: () => sendCommand({ teamId: snapshot.myTeamId, driverId: car.driverId, command: `PACE_${mode.toUpperCase()}` }),
      }, mode))
    }
    const pitRow = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      el('button', { class: 'small primary', onclick: () => sendCommand({ teamId: snapshot.myTeamId, driverId: car.driverId, command: 'PIT_THIS_LAP' }) }, 'Box this lap'),
      el('button', { class: 'small', onclick: () => sendCommand({ teamId: snapshot.myTeamId, driverId: car.driverId, command: 'PIT_NEXT_LAP' }) }, 'Next lap'),
      el('button', { class: 'small', onclick: () => sendCommand({ teamId: snapshot.myTeamId, driverId: car.driverId, command: 'CANCEL_PIT' }) }, 'Cancel'),
    )
    const tyreRow = el('div', { style: 'display:flex;gap:6px' })
    for (const compound of ['soft', 'medium', 'hard', 'inter', 'wet']) {
      tyreRow.appendChild(el('button', {
        class: 'small tyre-chip',
        style: `border-color:${TYRES[compound as keyof typeof TYRES].color}`,
        onclick: () => sendCommand({ teamId: snapshot.myTeamId, driverId: car.driverId, command: 'TYRE_REQUEST', compound }),
      }, TYRES[compound as keyof typeof TYRES].name))
    }
    const ordersRow = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      orderButton(snapshot, car, 'TEAM_ORDER_HOLD', 'Hold position', 'Hold'),
      orderButton(snapshot, car, 'TEAM_ORDER_DO_NOT_FIGHT', 'Don\'t fight teammate', 'Coexist'),
      orderButton(snapshot, car, 'TEAM_ORDER_SWAP', 'Swap positions', 'Swap'),
      orderButton(snapshot, car, 'TEAM_ORDER_PRIORITY_DRIVER', 'Prioritize this driver', 'Priority'),
      orderButton(snapshot, car, 'TEAM_ORDER_FREE', 'Free to race', 'Free'),
    )
    const orderContext = teamOrderContext()
    if (orderContext) {
      ordersRow.appendChild(el('div', { class: 'b3d-order-explain', html: orderContext }))
    }
    strategyPanel.append(
      el('div', { class: 'b3d-strat-controls' },
        el('div', { class: 'b3d-ctl-label' }, 'PACE'), paceGroup,
        el('div', { class: 'b3d-ctl-label' }, 'PIT'), pitRow,
        el('div', { class: 'b3d-ctl-label' }, 'NEXT TYRE'), tyreRow,
        el('div', { class: 'b3d-ctl-label' }, 'TEAM ORDERS'), ordersRow,
      ),
    )
  }

  function statLine(label: string, valueHtml: string, color?: string): HTMLElement {
    return el('div', { class: 'b3d-stat-line' },
      el('span', {}, label),
      el('span', { style: color ? `color:${color}` : '', html: valueHtml }),
    )
  }

  function orderButton(snapshot: RaceSnapshot, car: { driverId: string }, cmd: string, label: string, short: string) {
    const regs = regulationsForYear(getEraYear())
    const avail = teamOrderAvailability(regs)
    const isSwapOrPriority = cmd === 'TEAM_ORDER_SWAP' || cmd === 'TEAM_ORDER_PRIORITY_DRIVER'
    const isDirectOrder = cmd === 'TEAM_ORDER_SWAP' || cmd === 'TEAM_ORDER_PRIORITY_DRIVER' || cmd === 'TEAM_ORDER_HOLD'
    const isProhibitedDirect = isDirectOrder && avail.directOrders === 'PROHIBITED'
    const isCodedOnly = avail.codedOrders === 'RISKY'
    const champ = store.champ
    const driver = champ?.drivers[car.driverId]
    const agency = champ ? (champ as unknown as { _agency?: { get?: (id: string) => unknown } })._agency?.get?.(car.driverId) as
      | { trustInTeam: number; morale: number; teammateRelationship: number; championshipAmbition: number; promises?: { description: string; broken: boolean }[] }
      | undefined : undefined
    let driverVerdict: 'Very Likely' | 'Likely' | 'Uncertain' | 'Unlikely' | 'Very Unlikely' | null = null
    let driverReasons: string[] = []
    if (driver && agency) {
      const order = cmd === 'TEAM_ORDER_SWAP' ? 'swap'
        : cmd === 'TEAM_ORDER_HOLD' ? 'hold'
        : cmd === 'TEAM_ORDER_DO_NOT_FIGHT' ? 'doNotFight'
        : 'priority'
      const a = assessCompliance(driver, agency as never, order, {
        teammateRelationship: agency.teammateRelationship,
        isChampionshipContender: agency.championshipAmbition > 70 && agency.morale > 55,
        positionGap: 0,
      })
      driverVerdict = a.verdict
      driverReasons = a.reasons
    } else if (driver) {
      const prof = (driver.visible.feedback + driver.hidden.pressureResistance) / 2
      const ego = driver.hidden.ego
      const aggr = driver.hidden.aggression
      let score = 70
      score += (prof - 60) * 0.5
      score -= (ego - 50) * 0.4
      score -= (aggr - 50) * 0.25
      score += (driver.dynamic.morale - 60) * 0.35
      if (cmd === 'TEAM_ORDER_SWAP' || cmd === 'TEAM_ORDER_PRIORITY_DRIVER') score -= 8
      score = Math.max(0, Math.min(100, Math.round(score)))
      driverVerdict = score >= 85 ? 'Very Likely' : score >= 65 ? 'Likely' : score >= 40 ? 'Uncertain' : score >= 20 ? 'Unlikely' : 'Very Unlikely'
      if (prof >= 80) driverReasons.push('high professionalism')
      if (ego > 75) driverReasons.push('large ego')
      if (driver.dynamic.morale < 40) driverReasons.push('low morale')
    }
    let badge: string | null = null
    let disabled = false
    let titleText = label
    if (isProhibitedDirect) {
      badge = 'PROHIBITED'
      disabled = true
      titleText = `${label} — ${avail.explanation}`
    } else if (isCodedOnly && isSwapOrPriority) {
      badge = 'RISKY'
      titleText = `${label} — coded order under ${regs.eraName} (${regs.year}). Risk: steward scrutiny, fine, points penalty.`
    } else if (driverVerdict === 'Unlikely' || driverVerdict === 'Very Unlikely') {
      badge = 'DRIVER UNCERTAIN'
      titleText = `${label}\nLikely response: ${driverVerdict.toUpperCase()}\nReasons: ${driverReasons.join(', ') || 'driver state'}`
    } else if (driverVerdict === 'Uncertain') {
      badge = 'RISKY'
      titleText = `${label}\nLikely response: ${driverVerdict}`
    }
    const cls = `small${disabled ? ' disabled-action' : badge ? ' warn-action' : ''}`
    const btn = el('button', {
      class: cls,
      title: titleText,
      disabled,
      onclick: () => sendCommand({ teamId: snapshot.myTeamId, driverId: car.driverId, command: cmd }),
    }, short)
    if (badge) {
      btn.appendChild(el('span', { class: `b3d-order-badge ${badge === 'PROHIBITED' ? 'bad' : badge === 'DRIVER UNCERTAIN' ? 'bad' : 'warn'}` }, badge))
    }
    return btn
  }

  function teamOrderContext(): string | null {
    const regs = regulationsForYear(getEraYear())
    const avail = teamOrderAvailability(regs)
    return `<strong>${avail.directOrders}</strong> · ${avail.explanation}`
  }

  function updateTiming(snapshot: RaceSnapshot) {
    timingMini.innerHTML = ''
    const rows = [...snapshot.cars].sort((a, b) => a.position - b.position).slice(0, 10)
    for (const car of rows) {
      const colors = teamColorsOf(car.teamId)
      timingMini.appendChild(
        el('div', { class: `tower-row${car.driverId === followDriverId ? ' focused' : ''}`, style: `border-left-color:${colors.primary}` },
          el('span', { class: 'posn' }, String(car.position)),
          el('span', { class: 'tla', style: car.isMyTeam ? 'color:var(--warn)' : '' }, driverName(car.driverId).slice(0, 8)),
          el('span', { class: 'gap' }, car.retired ? 'OUT' : car.gapSeconds <= 0 ? 'Leader' : `+${car.gapSeconds.toFixed(1)}s`),
        ),
      )
    }
  }

  function updateTopHud(snapshot: RaceSnapshot) {
    topHud.innerHTML = ''
    topHud.append(
      el('span', { class: 'mono' }, `LAP ${snapshot.leaderLap}/${snapshot.totalLaps}`),
      el('span', { class: 'mono', style: 'color:var(--text-1)' }, fmtRaceClock(snapshot.cursorSeconds)),
      el('span', { class: 'badge', style: `background:${snapshot.condition !== 'dry' ? 'rgba(53,104,212,.25)' : 'rgba(63,163,77,.18)'}` },
        snapshot.condition === 'heavyRain' ? '🌧 HEAVY RAIN' : snapshot.condition === 'lightRain' ? '🌦 LIGHT RAIN' : '☀ DRY'),
      el('span', { class: 'spacer' }),
      el('span', { class: 'mono', style: 'color:var(--text-2)' }, `${snapshot.speed}x${snapshot.paused ? ' · PAUSED' : ''}${snapshot.replayActive ? ' · REPLAY' : ''}`),
    )
  }

  function pushRadio(entries: RaceSnapshot['radio']) {
    radioFeed.innerHTML = ''
    for (const r of entries.slice(-4)) {
      const car = race?.cars.find((c) => c.driverId === r.driverId)
      const team = car ? championship?.teams.find((t) => t.id === car.teamId) : null
      const teamColor = team?.colors.primary ?? 'var(--accent)'
      const radio = el('div', { class: `b3d-radio-line ${r.kind === 'refusal' ? 'refusal' : ''}` })
      ;(radio as HTMLElement).style.setProperty('--team-color', teamColor)
      radio.appendChild(el('span', { class: 'role' }, r.kind === 'refusal' ? '✕ REFUSAL' : 'RADIO'))
      radio.appendChild(el('span', { class: 'driver' }, driverName(r.driverId).split(' ').pop() ?? ''))
      radio.appendChild(el('span', { class: 'message' }, r.message))
      radioFeed.appendChild(radio)
    }
  }

  function updateCommentary(snapshot: RaceSnapshot) {
    if (!championship && !store.champ) return
    const drivers = store.champ?.drivers ?? (championship?.drivers ? Object.fromEntries(Object.entries(championship.drivers).map(([id, d]) => [id, d as unknown])) : {})
    const newLines = commentary.push(snapshot.events as never, drivers as never, { totalLaps: snapshot.totalLaps })
    if (newLines.length === 0) return
    const last = newLines[newLines.length - 1]
    commentaryFeed.innerHTML = ''
    const ribbon = el('div', { class: `b3d-commentary-ribbon role-${last.role}` },
      el('div', { class: 'b3d-commentary-role' }, last.role === 'lead' ? '🎙 LEAD' : '🎚 ANALYST'),
      el('div', { class: 'b3d-commentary-text' }, last.text),
    )
    commentaryFeed.appendChild(ribbon)
    if (commentary.lines.length > 1) {
      const tail = el('div', { class: 'b3d-commentary-tail' })
      for (const l of commentary.lines.slice(-6, -1)) {
        tail.appendChild(el('div', { class: `b3d-commentary-line role-${l.role}` },
          el('span', { class: 'b3d-commentary-mini' }, l.role === 'lead' ? '🎙' : '🎚'),
          el('span', {}, l.text),
        ))
      }
      commentaryFeed.appendChild(tail)
    }
  }

  // --- Controls ---
  const speedGroup = el('div', { class: 'seg-group' })
  for (const s of [1, 2, 4, 8]) {
    speedGroup.appendChild(el('button', {
      onclick: () => {
        if (store.multi.active) {
          mpSession.vote('speed', s)
        } else {
          speed = s
          if (race) race.speed = s
        }
      },
    }, `${s}x`))
  }
  controls.append(
    el('button', { onclick: () => {
      if (store.multi.active) mpSession.vote('pause', race?.paused ? 0 : 1)
      else paused = !paused
    } }, '⏯'),
    speedGroup,
    el('button', { onclick: () => {
      if (store.multi.active) mpSession.vote('rewind', Math.max(0, (race?.cursorSeconds ?? 0) - 30))
    } }, '⏪ 30s'),
    el('button', { onclick: () => {
      if (store.multi.active) mpSession.resumeLive()
    } }, '⏵ LIVE'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'primary', onclick: () => {
      if (store.multi.active) {
        // The server decides validity of next-round transition
        mpSession.nextRound()
      } else {
        location.hash = '#/paddock'
      }
    } }, 'Next round'),
    el('button', { onclick: () => (location.hash = '#/hq') }, 'Exit'),
  )

  function refreshSpeedButtons() {
    for (const b of speedGroup.querySelectorAll('button')) {
      b.classList.toggle('selected', b.textContent === `${race?.speed ?? 1}x`)
    }
  }

  // --- Wire MultiplayerSession view into the local view ---
  let prevRacePhase: string | null = null
  let prevLeaderId: string | null = null
  let prevFinalLapSignaled = false
  const unsubscribe = mpSession.subscribe((v: MultiplayerView) => {
    const prevRace = race
    lobby = v.lobby
    race = v.race
    championship = v.championship
    lobbyCode = v.lobbyCode ?? ''
    refreshMpBadge()
    if (!followDriverId && v.race?.myTeamId) {
      const myTeam = v.championship?.teams.find((t) => t.id === v.race!.myTeamId)
      if (myTeam) {
        myDriverIds = myTeam.driverIds
        if (myDriverIds.length > 0) followDriverId = myDriverIds[0]
        refreshFollowBar()
      }
    }
    ensureTrack()
    if (race) {
      ensureCars(race)
      updateCarPositions(race)
      updateBattleNotifications(race)
      updateStrategyPanel(race)
      updateTiming(race)
      updateTopHud(race)
      pushRadio(race.radio)
      updateCommentary(race)
      refreshSpeedButtons()

      // --- Director events ---
      const now = performance.now()
      const phase = race.phase ?? null
      // Race start: when transitioning into a racing phase.
      if (prevRacePhase !== 'race' && (phase === 'race' || phase === 'racing')) {
        director.pushEvent({ kind: 'race-start', priority: 'CRITICAL', atTime: now })
        showBanner('LIGHTS OUT', 2200, 'start')
        prevFinalLapSignaled = false
      }
      // Chequered flag: phase moved to roundResults / finished.
      if ((prevRacePhase === 'race' || prevRacePhase === 'racing') && phase && phase !== 'race' && phase !== 'racing') {
        director.pushEvent({ kind: 'chequered-flag', priority: 'CRITICAL', atTime: now })
        showBanner('CHEQUERED FLAG', 2600, 'flag')
      }
      // Final lap.
      if (race.totalLaps > 0 && !prevFinalLapSignaled) {
        const leaderCar = race.cars.find((c) => c.position === 1 && !c.retired)
        if (leaderCar && leaderCar.lap >= race.totalLaps - 1) {
          director.pushEvent({ kind: 'final-lap', priority: 'HIGH', carIds: [leaderCar.driverId], atTime: now })
          showBanner('FINAL LAP', 2400, 'lap')
          prevFinalLapSignaled = true
        }
      }
      // Leader change.
      const newLeader = race.cars.find((c) => c.position === 1 && !c.retired)
      if (prevLeaderId && newLeader && newLeader.driverId !== prevLeaderId) {
        director.pushEvent({ kind: 'leader-change', priority: 'HIGH', carIds: [newLeader.driverId, prevLeaderId], atTime: now })
      }
      if (newLeader) prevLeaderId = newLeader.driverId
      // Pit stop / pit entry (player cars only — for the camera).
      for (const c of race.cars) {
        if (c.pitThisLap) {
          if (myDriverIds.includes(c.driverId)) {
            director.pushEvent({ kind: 'player-pit-event', priority: 'HIGH', carIds: [c.driverId], atTime: now })
          }
        }
      }
      // Overtake detection via position swaps from previous frame.
      if (prevRace) {
        for (const cur of race.cars) {
          const before = prevRace.cars.find((x) => x.driverId === cur.driverId)
          if (before && before.position > cur.position) {
            director.pushEvent({ kind: 'overtake', priority: 'NORMAL', carIds: [cur.driverId], atTime: now })
          }
        }
      }
      prevRacePhase = phase
    }
  })

  refreshMpBadge()
  ensureTrack()
  if (race) {
    ensureCars(race)
    updateCarPositions(race)
    updateBattleNotifications(race)
    updateStrategyPanel(race)
    updateTiming(race)
    updateTopHud(race)
    pushRadio(race.radio)
    updateCommentary(race)
    refreshSpeedButtons()
  }

  // --- Multiplayer race-state request loop (broadcast polls server) ---
  let lastReq = 0
  function tickRequest(now: number) {
    if (!running) return
    if (store.multi.active && now - lastReq > 1500) {
      lastReq = now
      mpSession.requestRaceState()
    }
  }

  // --- Local mode bootstrap (no multiplayer session) ---
  if (!store.multi.active) {
    startLocalRace()
  } else {
    // Multiplayer: nothing to do locally — server snapshots drive everything
    mpSession.requestRaceState()
  }

  function startLocalRace() {
    const champ = store.champ
    if (!champ || !store.engine) return
    void import('../../sim/live-race').then(({ LiveRaceEngine }) => {
      void import('../../sim/race-sim').then(({ simulateQualifying }) => {
        void import('../../championship/engine').then(({ buildTeamRacePackages }) => {
          const round = champ.rounds[champ.currentRoundIndex]
          if (round.raceDone) {
            toast('Race complete — viewing results.')
            location.hash = '#/results'
            return
          }
          const seed = (champ.rngSeed ^ (round.index * 2654435761) ^ (champ.config.season * 40503)) >>> 0
          const packages: import('../../core/types').RacePackage[] = []
          for (const team of champ.teams) packages.push(...buildTeamRacePackages(champ, team, round))
          const practiceByTeam = round.practiceBonus ?? {}
          for (const pkg of packages) {
            const b = practiceByTeam[pkg.teamId]
            if (b !== undefined) (pkg as unknown as { practiceBonus?: number }).practiceBonus = b
          }
          const quali = simulateQualifying({
            roundId: `${round.index}`,
            circuit: champ.circuits.find((c) => c.id === round.circuitId)!,
            packages: packages.map((p) => ({
              championshipId: p.championshipId, roundId: p.roundId, teamId: p.teamId,
              driverId: p.driverId, carPerformance: p.carPerformance, setup: p.setup,
              qualiTyre: 'soft' as const, version: 1, hash: p.hash,
            })),
            drivers: champ.drivers,
            seed,
            weatherForecast: { rainProbability: 0.2 },
          })
          round.qualifyingResult = quali
          round.qualifyingDone = true
          round.packagesLocked = true
          const byDriver = new Map(packages.map((p) => [p.driverId, p]))
          const ordered: typeof packages = []
          for (const row of quali.rows) {
            const pkg = byDriver.get(row.driverId)
            if (pkg) { ordered.push(pkg); byDriver.delete(row.driverId) }
          }
          for (const pkg of byDriver.values()) ordered.push(pkg)
          localEngine = new LiveRaceEngine(champ.circuits.find((c) => c.id === round.circuitId)!, ordered, champ.drivers, (seed ^ 0x5aced) >>> 0) as unknown as LocalEngine
          myDriverIds = store.playerTeam ? [...store.playerTeam.driverIds] : []
          followDriverId = myDriverIds[0] ?? null
          refreshFollowBar()
        })
      })
    })
  }

  function localTick(dt: number) {
    const e = localEngine
    if (!e || e.isFinished()) return
    cursorSeconds += dt * speed
    let steps = 0
    while (!e.isFinished() && e.state.simTime < cursorSeconds && steps < 3) {
      e.stepLap()
      steps++
    }
    if (e.isFinished()) {
      cursorSeconds = Math.min(cursorSeconds, e.state.simTime + 5)
      // commitLocalResults inlined to keep the code path self-contained
      const champ = store.champ
      if (champ) {
        const round = champ.rounds[champ.currentRoundIndex]
        const live = e.results()
        round.raceResult = {
          roundId: `${round.index}`,
          circuitId: round.circuitId,
          simulationVersion: 'local',
          seed: 0,
          rulesHash: 'local',
          events: [],
          results: live.map((r) => ({
            driverId: r.driverId, teamId: r.teamId, startPosition: 0, finishPosition: r.finishPosition,
            classified: r.classified, lapsCompleted: r.lapsCompleted, bestLapTime: r.bestLapTime,
            pitStops: r.pitStops, penaltiesSeconds: 0, points: r.points, fastestLap: r.fastestLap,
            dnfReason: r.dnfReason,
          })),
          totalSimTime: e.state.simTime,
          safetyCarCount: 0, vscCount: 0,
        }
        round.raceDone = true
        round.phase = 'roundResults'
        champ.phase = 'roundResults'
        store.finishLiveRace(round.raceResult)
      }
      toast('Chequered flag — open Results to continue.')
    }
  }

  function localSnapshot(): RaceSnapshot | null {
    const e = localEngine
    if (!e) return null
    const ordered = e.orderedCars()
    const leader = ordered[0]
    return {
      phase: e.isFinished() ? 'roundResults' : 'race',
      cursorSeconds,
      speed,
      paused,
      replayActive: false,
      vote: null,
      myTeamId: store.playerTeam?.id,
      myPlayerId: '',
      events: [],
      radio: [],
      cars: ordered.map((c) => ({
        driverId: c.driverId, teamId: c.teamId, carNumber: c.carNumber, position: c.position,
        lap: c.lapsDone, trackProgress: c.totalTime,
        gapSeconds: c.totalTime - (leader?.totalTime ?? c.totalTime),
        tyre: c.tyre, tyreAge: c.tyreAge, tyreWear: Math.round(c.tyreWear * 100) / 100,
        pitStops: c.pitStops, paceMode: c.strategy.paceMode, energy: c.strategy.energy,
        damage: Math.round(c.damage * 100) / 100,
        pitThisLap: c.pitThisLap || c.pitNextLap,
        retired: c.retired, finished: c.finished,
        isMyTeam: c.teamId === store.playerTeam?.id,
      })),
      leaderLap: e.state.leaderLap,
      totalLaps: e.state.totalLaps,
      trackWetness: e.state.trackWetness,
      condition: e.state.condition,
      results: e.isFinished() ? (e.results() as never) : undefined,
      standings: undefined,
    }
  }

  // --- Render loop ---
  function resize() {
    const rect = canvasHost.getBoundingClientRect()
    if (rect.width < 10) return
    renderer.setSize(rect.width, rect.height, false)
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  let lastFrame = performance.now()
  // FPS limiter driven by the desktop / browser settings store.
  // 0 means unlimited; otherwise we floor the per-frame interval.
  // This only affects rendering — the simulation tick rate is
  // untouched (deterministic sim runs on its own clock).
  let fpsLimit = 0
  function readFpsLimit() {
    try {
      const raw = localStorage.getItem('pitwall-dynasty.settings')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (typeof parsed?.fpsLimit === 'number') fpsLimit = parsed.fpsLimit
    } catch (_) { /* ignore */ }
  }
  readFpsLimit()
  // Pick up changes from the settings screen without a remount.
  window.addEventListener('storage', (e) => {
    if (e.key === 'pitwall-dynasty.settings') readFpsLimit()
  })
  const minFrameMs = () => (fpsLimit > 0 ? 1000 / fpsLimit : 0)
  let lastRender = 0

  function frame(now: number) {
    if (!running) return
    const dt = Math.min(0.1, (now - lastFrame) / 1000)
    lastFrame = now
    // Honor the FPS limit without altering the simulation tick rate.
    if (minFrameMs() > 0 && now - lastRender < minFrameMs()) {
      requestAnimationFrame(frame)
      return
    }
    lastRender = now
    if (store.multi.active) {
      // server-driven — nothing to tick locally
    } else {
      if (!paused) localTick(dt)
      const snap = localSnapshot()
      if (snap) {
        race = snap
        ensureCars(snap)
        updateCarPositions(snap)
        updateBattleNotifications(snap)
        updateStrategyPanel(snap)
        updateTiming(snap)
        updateTopHud(snap)
        pushRadio(snap.radio)
        updateCommentary(snap)
        // Local director event emission for single-player mode
        const now = performance.now()
        const phase = (snap as { phase?: string }).phase ?? 'race'
        if (prevRacePhase !== 'race' && (phase === 'race' || phase === 'racing')) {
          director.pushEvent({ kind: 'race-start', priority: 'CRITICAL', atTime: now })
          showBanner('LIGHTS OUT', 2200, 'start')
        }
        if ((prevRacePhase === 'race' || prevRacePhase === 'racing') && phase !== 'race' && phase !== 'racing') {
          director.pushEvent({ kind: 'chequered-flag', priority: 'CRITICAL', atTime: now })
          showBanner('CHEQUERED FLAG', 2600, 'flag')
        }
        prevRacePhase = phase
      }
    }
    updateCamera(dt)
    tickRequest(now)
    // Apply weather visuals every frame so the sky / fog track the
    // authoritative race condition without storing an extra flag.
    if (track) {
      const wetness = (race && (race as { trackWetness?: number }).trackWetness) ?? 0
      const condition = (race && (race as { condition?: string }).condition) ?? 'dry'
      applyWeatherVisuals(wetness, condition)
      tickSpray(dt, wetness)
    }
    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  const observer = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      running = false
      window.removeEventListener('resize', resize)
      for (const c of car3ds.values()) c.visual.dispose()
      car3ds.clear()
      disposeSpray()
      // Dispose any leftover scene resources (track, lights, etc).
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose?.()
        } else if (mat && typeof (mat as { dispose?: () => void }).dispose === 'function') {
          (mat as { dispose: () => void }).dispose()
        }
      })
      // Drop the WebGL context so a returning broadcast gets a fresh
      // one — prevents context leaks across navigation in a long
      // desktop session.
      try { renderer.dispose() } catch (_) { /* ignore */ }
      try {
        const gl = renderer.getContext()
        const lose = gl.getExtension('WEBGL_lose_context')
        lose?.loseContext()
      } catch (_) { /* ignore */ }
      observer.disconnect()
      unsubscribe()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
