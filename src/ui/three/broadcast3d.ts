import * as THREE from 'three'
import { el, toast, fmtRaceClock } from '../dom'
import { store } from '../../state/store'
import { MultiplayerClient, type RaceSnapshot, type LobbySnapshot } from '../../client/multiplayer-client'
import { buildTrackMeshes, type TrackMeshes } from './track3d'
import { createCar, type CarVisual } from './car3d'
import { TYRES } from '../../core/tyres'
import type { Championship } from '../../core/types'
import * as liveModule from '../../sim/live-race'
import type { LiveRaceEngine } from '../../sim/live-race'
import * as engineModule from '../../championship/engine'
import * as qualiModule from '../../sim/race-sim'

function roundSeedFor(champ: Championship, roundIndex: number): number {
  return ((champ.rngSeed ^ (roundIndex * 2654435761) ^ (champ.config.season * 40503)) >>> 0)
}

/**
 * 3D Race Broadcast — helicopter-camera presentation of the live
 * server-authoritative race. Driver-follow default, battle notifications,
 * live strategy controls, team radio.
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

export function renderBroadcast3D(root: HTMLElement, joinCode?: string) {
  root.innerHTML = ''
  const champ: Championship | null = store.champ

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
  const strategyPanel = el('div', { class: 'b3d-strategy' })
  const timingMini = el('div', { class: 'b3d-timing' })
  const controls = el('div', { class: 'broadcast-controls' })

  stage.append(topHud, followBar, battleStack, radioFeed, strategyPanel, timingMini)
  wrap.append(stage)
  root.appendChild(wrap)
  root.appendChild(controls)

  // --- State ---
  const client = new MultiplayerClient()
  let lobbyCode = joinCode ?? ''
  let lobby: LobbySnapshot | null = null
  let race: RaceSnapshot | null = null
  let followDriverId: string | null = null
  let myDriverIds: string[] = []
  let running = true
  let battleNotifications: Array<BattleGroup & { shownAt: number }> = []
  const cameraMode: 'heli' | 'map' = 'heli'
  // Local-mode race state
  let localEngine: LiveRaceEngine | null = null
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

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 1, 3000)
  const camPos = new THREE.Vector3(0, 120, 160)
  const camTarget = new THREE.Vector3()
  camera.position.copy(camPos)

  scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x1a2418, 1.15))
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4)
  sun.position.set(300, 500, 200)
  scene.add(sun)

  // Track — from local championship content (server sends circuit id via lobby)
  let track: TrackMeshes | null = null
  if (champ) {
    track = buildTrackMeshes(champ.circuits[0])
    scene.add(track.group)
  }

  // --- Car pool ---
  const car3ds = new Map<string, Car3D>()

  function teamColorsOf(teamId: string): { primary: string; secondary: string } {
    if (lobby) {
      const t = lobby.teams.find((x) => x.teamId === teamId)
      if (t) return t.colors
    }
    if (champ) {
      const t = champ.teams.find((x) => x.id === teamId)
      if (t) return t.colors
    }
    return { primary: '#888888', secondary: '#ffffff' }
  }

  function ensureCars(snapshot: RaceSnapshot) {
    if (!track) return
    for (const car of snapshot.cars) {
      if (!car3ds.has(car.driverId)) {
        const colors = teamColorsOf(car.teamId)
        const visual = createCar({ colors, carNumber: car.carNumber, eraFactor: 0.9 })
        scene.add(visual.group)
        car3ds.set(car.driverId, { driverId: car.driverId, visual, lastLap: car.lap })
      }
    }
    // Remove cars no longer in the snapshot (defensive)
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

  function updateCarPositions(snapshot: RaceSnapshot) {
    if (!track) return
    const leader = snapshot.cars.find((c) => c.position === 1)
    const leaderLap = leader?.lap ?? 0
    for (const car of snapshot.cars) {
      const c3d = car3ds.get(car.driverId)
      if (!c3d) continue
      // Lap fraction: derive from gap to leader + lap count.
      // Server gives gapSeconds; approximate track position as leaderFrac - gap/total.
      const leaderFrac = leader ? ((leader.lap % 1) + 0.5) : 0
      void leaderFrac
      // Better: interpolate per-lap progress using lap + gap
      const totalLen = track.totalLength
      const gapMeters = car.gapSeconds * 55 // ~55 m/s avg
      const frac = (((car.lap - leaderLap) + (gapMeters / totalLen)) % 1 + 1) % 1 + 0.0
      const lapFrac = ((car.lap % 1) + frac) % 1
      track.positionAt(lapFrac, tmpPos)
      track.tangentAt(lapFrac, tmpTan)
      c3d.visual.group.position.lerp(tmpPos, 0.25)
      const heading = Math.atan2(tmpTan.x, tmpTan.z)
      c3d.visual.group.rotation.y = heading
      c3d.visual.setSpeed(55)
    }
  }

  // --- Helicopter camera ---
  const camDesired = new THREE.Vector3()
  const camLook = new THREE.Vector3()

  function updateCamera(dt: number) {
    if (!track) return
    let targetDriverId = followDriverId
    if (!targetDriverId || !car3ds.has(targetDriverId)) {
      targetDriverId = myDriverIds[0] ?? race?.cars.find((c) => c.position === 1)?.driverId ?? null
    }
    const c3d = targetDriverId ? car3ds.get(targetDriverId) : undefined
    if (c3d) {
      const p = c3d.visual.group.position
      // Helicopter: behind and above, leading slightly into the direction of travel
      const heading = c3d.visual.group.rotation.y
      const back = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(-46)
      camDesired.set(p.x + back.x, p.y + 34, p.z + back.z)
      camLook.set(p.x - back.x * 0.4, p.y + 2, p.z - back.z * 0.4)
    } else if (track) {
      // Overview
      camDesired.set(0, 320, 380)
      camLook.set(0, 0, 0)
    }
    const lerp = 1 - Math.pow(0.05, dt) // ~fast smooth follow
    camPos.lerp(camDesired, lerp)
    camTarget.lerp(camLook, Math.min(1, lerp * 1.5))
    camera.position.copy(camPos)
    camera.lookAt(camTarget)
  }

  // --- Battle detection ---
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
    const now = Date.now()
    // Add new high-priority battles not currently followed
    for (const b of battles) {
      if (b.priority < 60) continue
      if (isBattleVisible(b)) continue
      if (battleNotifications.some((n) => n.id === b.id && now - n.shownAt < 20000)) continue
      battleNotifications.push({ ...b, shownAt: now })
    }
    battleNotifications = battleNotifications.filter((n) => now - n.shownAt < 12000)
    // Render
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
    if (champ) {
      const d = champ.drivers[driverId]
      if (d) return d.lastName
    }
    return driverId.slice(-5)
  }

  // --- Follow bar ---
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
    // My team quick switch
    if (myDriverIds.length > 0) {
      followBar.appendChild(el('button', { class: 'back-btn', onclick: () => { followDriverId = myDriverIds[0]; refreshFollowBar() } }, '⏎ BACK TO MY DRIVER'))
    }
  }

  // --- Strategy panel (my selected driver) ---
  function sendCommand(cmd: Record<string, unknown>) {
    if (LOCAL_MODE && localEngine) {
      const res = localEngine.applyCommand(cmd as never)
      toast(res.response, res.deferred === true)
      if (res.deferred) {
        radioFeed.appendChild(el('div', { class: 'event-line big' }, `📻 ${res.response}`))
      }
    } else {
      sendCommand(cmd)
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
    // Live controls (2-click max)
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
      el('button', { class: 'small', onclick: () => sendCommand({ teamId: snapshot.myTeamId, driverId: car.driverId, command: 'TEAM_ORDER_DO_NOT_FIGHT' }) }, 'Hold position'),
      el('button', { class: 'small', onclick: () => sendCommand({ teamId: snapshot.myTeamId, driverId: car.driverId, command: 'TEAM_ORDER_FREE' }) }, 'Free to race'),
    )
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

  // --- Timing mini tower ---
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

  // --- Top HUD ---
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

  // --- Radio feed ---
  function pushRadio(entries: RaceSnapshot['radio']) {
    radioFeed.innerHTML = ''
    for (const r of entries.slice(-4)) {
      radioFeed.appendChild(
        el('div', { class: `event-line ${r.kind === 'refusal' ? 'big' : ''}` },
          `📻 ${driverName(r.driverId)}: ${r.message}`),
      )
    }
  }

  // --- Controls ---
  const speedGroup = el('div', { class: 'seg-group' })
  for (const s of [1, 2, 4, 8]) {
    speedGroup.appendChild(el('button', {
      onclick: () => client.vote('speed', s),
    }, `${s}x`))
  }
  controls.append(
    el('button', { onclick: () => client.vote('pause', race?.paused ? 0 : 1) }, '⏯'),
    speedGroup,
    el('button', { onclick: () => client.vote('rewind', Math.max(0, (race?.cursorSeconds ?? 0) - 30)) }, '⏪ 30s'),
    el('button', { onclick: () => client.resumeLive() }, '⏵ LIVE'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'primary', onclick: () => client.nextRound() }, 'Next round'),
    el('button', { onclick: () => (location.hash = '#/hq') }, 'Exit'),
  )

  // --- Networking ---
  client.on('lobbyState', (payload) => {
    lobby = payload as LobbySnapshot
  })

  client.on('joined', (payload) => {
    const p = payload as { code: string }
    lobbyCode = p.code
    toast(`Connected to lobby ${p.code}`)
  })

  client.on('raceState', (payload) => {
    race = payload as RaceSnapshot
    if (!race) return
    ensureCars(race)
    updateCarPositions(race)
    updateBattleNotifications(race)
    updateStrategyPanel(race)
    updateTiming(race)
    updateTopHud(race)
    pushRadio(race.radio)
    refreshSpeedButtons()
  })

  client.on('raceStart', (payload) => {
    race = payload as RaceSnapshot
    toast('Race started!')
  })

  client.on('radioResponse', (payload) => {
    const r = payload as { response: string; deferred?: boolean }
    if (r.response) toast(r.response, r.deferred === true)
  })

  client.on('raceComplete', (payload) => {
    race = payload as RaceSnapshot
    toast('Chequered flag!')
  })

  client.on('phaseChange', (payload) => {
    const p = payload as { phase: string }
    if (p.phase === 'management') {
      toast('New round — management phase open.')
    }
  })

  client.on('voteState', (payload) => {
    const v = payload as { vote: RaceSnapshot['vote']; speed: number; paused: boolean }
    if (race) {
      race.vote = v.vote
      race.speed = v.speed
      race.paused = v.paused
    }
    refreshSpeedButtons()
  })

  client.on('error', (payload) => {
    toast((payload as { message: string }).message, true)
  })

  function refreshSpeedButtons() {
    for (const b of speedGroup.querySelectorAll('button')) {
      b.classList.toggle('selected', b.textContent === `${race?.speed ?? 1}x`)
    }
  }

  // --- Connect (only for multiplayer mode; local mode runs a local engine) ---
  const LOCAL_MODE = !joinCode

  if (!LOCAL_MODE) {
    client.connect('ws://localhost:8080').then(() => {
      client.joinLobby(lobbyCode)
      client.requestRaceState()
    }).catch((e: Error) => {
      stage.appendChild(el('div', { class: 'empty-state', style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(7,9,12,.85);z-index:20' },
        el('div', { style: 'text-align:center' },
          el('h3', {}, 'Multiplayer server unavailable'),
          el('p', { style: 'color:var(--text-1)' }, e.message),
        ),
      ))
    })
  } else {
    // LOCAL MODE: run the authoritative engine in-process against the local
    // championship. Same LiveRaceEngine as the server uses.
    startLocalRace()
  }

  function startLocalRace() {
    if (!champ || !store.engine) return
    const { LiveRaceEngine } = liveModule
    const { buildTeamRacePackages } = engineModule
    const round = champ.rounds[champ.currentRoundIndex]
    if (round.raceDone) return // race already completed via standard path

    // Lock packages locally (without pre-simulating the whole race)
    const seed = roundSeedFor(champ, round.index)
    const packages: import('../../core/types').RacePackage[] = []
    for (const team of champ.teams) {
      packages.push(...buildTeamRacePackages(champ, team, round))
    }
    // Qualifying from the deterministic path
    const { simulateQualifying } = qualiModule
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

    localEngine = new LiveRaceEngine(champ.circuits.find((c) => c.id === round.circuitId)!, ordered, champ.drivers, (seed ^ 0x5aced) >>> 0)
    myDriverIds = store.playerTeam ? [...store.playerTeam.driverIds] : []
    followDriverId = myDriverIds[0] ?? null
    refreshFollowBar()
  }

  function localTick(dt: number) {
    if (!localEngine || localEngine.isFinished()) return
    // Cursor advances in real time; sim steps only when the cursor passes
    // the leader's elapsed time. NO jump-to-simTime (that raced through laps).
    cursorSeconds += dt * speed
    let steps = 0
    while (!localEngine.isFinished() && localEngine.state.simTime < cursorSeconds && steps < 3) {
      localEngine.stepLap()
      steps++
    }
    if (localEngine.isFinished()) {
      cursorSeconds = Math.min(cursorSeconds, localEngine.state.simTime + 5)
      commitLocalResults()
      toast('Chequered flag — open Results to continue.')
    }
  }

  /** Write live race results back into the championship round. */
  function commitLocalResults() {
    if (!localEngine || !champ) return
    const round = champ.rounds[champ.currentRoundIndex]
    const live = localEngine.results()
    round.raceResult = {
      roundId: `${round.index}`,
      circuitId: round.circuitId,
      simulationVersion: localEngine.simulationVersion,
      seed: localEngine.seed,
      rulesHash: localEngine.rulesHash,
      events: [...localEngine.events].sort((a, b) => a.t - b.t),
      results: live.map((r) => ({
        driverId: r.driverId,
        teamId: r.teamId,
        startPosition: 0,
        finishPosition: r.finishPosition,
        classified: r.classified,
        lapsCompleted: r.lapsCompleted,
        bestLapTime: r.bestLapTime,
        pitStops: r.pitStops,
        penaltiesSeconds: 0,
        points: r.points,
        fastestLap: r.fastestLap,
        dnfReason: r.dnfReason,
      })),
      fastestLapDriverId: live.find((r) => r.fastestLap)?.driverId,
      totalSimTime: localEngine.state.simTime,
      safetyCarCount: 0,
      vscCount: 0,
    }
    round.raceDone = true
    round.phase = 'roundResults'
    champ.phase = 'roundResults'
    store.save()
  }

  function localSnapshot(): RaceSnapshot | null {
    if (!localEngine) return null
    const ordered = localEngine.orderedCars()
    const leader = ordered[0]
    return {
      phase: localEngine.isFinished() ? 'roundResults' : 'race',
      cursorSeconds,
      speed,
      paused,
      replayActive: false,
      vote: null,
      myTeamId: store.playerTeam?.id,
      events: localEngine.events.filter((e) => e.t <= cursorSeconds + 3),
      radio: localEngine.radioFeed.slice(-12),
      cars: ordered.map((c) => ({
        driverId: c.driverId, teamId: c.teamId, carNumber: c.carNumber, position: c.position,
        lap: c.lapsDone, gapSeconds: c.totalTime - (leader?.totalTime ?? c.totalTime),
        tyre: c.tyre, tyreAge: c.tyreAge, tyreWear: Math.round(c.tyreWear * 100) / 100,
        pitStops: c.pitStops, paceMode: c.strategy.paceMode, energy: c.strategy.energy,
        damage: Math.round(c.damage * 100) / 100,
        pitThisLap: c.pitThisLap || c.pitNextLap,
        retired: c.retired, finished: c.finished,
        isMyTeam: c.teamId === store.playerTeam?.id,
      })),
      leaderLap: localEngine.state.leaderLap,
      totalLaps: localEngine.state.totalLaps,
      trackWetness: localEngine.state.trackWetness,
      condition: localEngine.state.condition,
      results: localEngine.isFinished() ? localEngine.results() : undefined,
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
  let statePollAccum = 0
  function frame(now: number) {
    if (!running) return
    const dt = Math.min(0.1, (now - lastFrame) / 1000)
    lastFrame = now
    if (LOCAL_MODE) {
      if (!paused) localTick(dt)
      race = localSnapshot()
      if (race) {
        ensureCars(race)
        updateCarPositions(race)
        updateBattleNotifications(race)
        updateStrategyPanel(race)
        updateTiming(race)
        updateTopHud(race)
        pushRadio(race.radio)
      }
    } else {
      statePollAccum += dt
      if (statePollAccum > 1.5) {
        statePollAccum = 0
        client.requestRaceState()
      }
    }
    updateCamera(dt)
    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  const observer = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      running = false
      window.removeEventListener('resize', resize)
      for (const c of car3ds.values()) c.visual.dispose()
      renderer.dispose()
      observer.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
