import { el, fmtRaceClock } from './dom'
import { store } from '../state/store'
import { BroadcastController, BroadcastDirector, CAMERA_MODES, type CameraMode, type PlaybackSpeed } from '../broadcast/broadcast'
import { TYRES } from '../core/tyres'
import type { Circuit, RaceEvent, RaceResult } from '../core/types'

/**
 * Race broadcast — replays the immutable simulation timeline on a shared
 * cursor. Camera choice is local; playback position/speed is shared.
 */

interface CarView {
  driverId: string
  teamId: string
  lastName: string
  color: string
  // Interpolated state at the current cursor:
  lap: number
  lapProgress: number // 0..1 around the track
  position: number
  gapText: string
  tyre: string
  pitStops: number
  finished: boolean
  retired: boolean
  finalPosition: number
  finalTotalTime?: number
}

export function renderBroadcast(root: HTMLElement) {
  const champ = store.champ!
  const round = champ.rounds[champ.currentRoundIndex]
  const result = round?.raceResult
  root.innerHTML = ''

  if (!result) {
    root.appendChild(el('div', { class: 'page' }, el('div', { class: 'empty-state' },
      'No race has been simulated yet. Go to the race weekend and lock your package first.')))
    return
  }

  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const bc = new BroadcastController(result)
  const director = new BroadcastDirector()
  const teamDriverIds = store.playerTeam ? [...store.playerTeam.driverIds] : []

  const wrapEl = el('div', { class: 'broadcast-wrap' })
  const main = el('div', { class: 'broadcast-main' })
  const stage = el('div', { class: 'track-stage' })
  const canvas = el('canvas') as HTMLCanvasElement
  stage.appendChild(canvas)

  // Overlay: current shot banner + camera select
  const shotBanner = el('div', { class: 'shot-banner' }, '')
  const camSelect = el('div', { class: 'cam-select' })
  for (const mode of CAMERA_MODES) {
    camSelect.appendChild(
      el('button', {
        class: bc.cameraMode === mode.id ? 'selected' : '',
        onclick: (e) => {
          bc.cameraMode = mode.id as CameraMode
          for (const b of camSelect.querySelectorAll('button')) b.classList.remove('selected')
          ;(e.currentTarget as HTMLElement).classList.add('selected')
        },
      }, mode.name),
    )
  }

  const eventFeed = el('div', { class: 'event-feed' })
  let shownEventIdx = 0

  // Timing tower
  const tower = el('div', { class: 'timing-tower' })

  // Controls
  const clockDisplay = el('span', { class: 'cursor-display mono' }, '00:00')
  const speedGroup = el('div', { class: 'seg-group' })
  const speedButtons: Record<number, HTMLButtonElement> = {}
  for (const s of [1, 2, 4, 8] as PlaybackSpeed[]) {
    const b = el('button', {
      class: bc.speed === s ? 'selected' : '',
      onclick: () => {
        bc.requestSpeed(s, 1)
        refreshSpeed()
      },
    }, `${s}x`)
    speedButtons[s] = b
    speedGroup.appendChild(b)
  }
  function refreshSpeed() {
    for (const [s, b] of Object.entries(speedButtons)) b.classList.toggle('selected', Number(s) === bc.speed)
  }

  const controls = el('div', { class: 'broadcast-controls' },
    el('button', { small: true as unknown as string, onclick: () => { bc.requestPause(!bc.playing, 1); pauseBtn.textContent = bc.playing ? '❚❚ Pause' : '▶ Play' } }),
    speedGroup,
    el('button', { onclick: () => bc.requestRewind(Math.max(0, bc.cursorSeconds - 30), 1) }, '⏪ 30s'),
    el('button', { onclick: () => bc.requestRewind(0, 1) }, '⏮ Start'),
    el('span', { class: 'spacer' }),
    clockDisplay,
    el('span', { class: 'spacer' }),
    el('span', { style: 'font-size:11px;color:var(--text-2)' }, `SIM ${result.simulationVersion} · SEED ${result.seed}`),
    el('button', { class: 'primary', id: 'results-btn', onclick: () => (location.hash = '#/results') }, 'Results'),
  )
  const pauseBtn = controls.querySelector('button')!

  main.append(stage)
  stage.append(camSelect, shotBanner, eventFeed)
  wrapEl.append(main, tower)
  root.appendChild(wrapEl)
  root.appendChild(controls)

  // ----- Car view model built from results + events -----
  const cars: CarView[] = buildCarViews(champ, result)
  const trackPath = buildTrackPath(circuit)

  // Precompute per-driver event indices for interpolation
  interface LapMarker { t: number; lap: number }
  const lapMarkers = new Map<string, LapMarker[]>()
  for (const ev of result.events) {
    if (!ev.driverId) continue
    if (ev.type === 'lapComplete') {
      const m = /Lap (\d+)\//.exec(ev.detail)
      if (m) {
        const arr = lapMarkers.get(ev.driverId) ?? []
        arr.push({ t: ev.t, lap: Number(m[1]) })
        lapMarkers.set(ev.driverId, arr)
      }
    }
  }
  const finishTimes = new Map<string, number>()
  for (const r of result.results) {
    if (r.totalTime !== undefined) finishTimes.set(r.driverId, r.totalTime)
  }
  const retirementEvents = new Map<string, RaceEvent>()
  for (const ev of result.events) {
    if (ev.type === 'retirement' && ev.driverId) retirementEvents.set(ev.driverId, ev)
  }
  // Pit stop tracking for live tyre/pit display
  interface PitMarker { t: number; compound: string; stopNumber: number }
  const pitMarkers = new Map<string, PitMarker[]>()
  for (const ev of result.events) {
    if (ev.type === 'pitStop' && ev.driverId) {
      const m = /→ ([A-Za-z ]+)$/.exec(ev.detail)
      const arr = pitMarkers.get(ev.driverId) ?? []
      arr.push({ t: ev.t, compound: m ? m[1].trim().toLowerCase() : 'medium', stopNumber: Number(ev.data?.stopNumber ?? 0) })
      pitMarkers.set(ev.driverId, arr)
    }
  }

  function computeViewsAt(t: number): void {
    for (const car of cars) {
      // Live tyre & pit count
      const pits = pitMarkers.get(car.driverId) ?? []
      let currentTyre = 'medium'
      let stops = 0
      for (const p of pits) {
        if (p.t <= t) {
          currentTyre = p.compound
          stops = Math.max(stops, p.stopNumber)
        }
      }
      car.tyre = currentTyre
      car.pitStops = stops

      const markers = lapMarkers.get(car.driverId) ?? []
      const retEv = retirementEvents.get(car.driverId)
      car.retired = !!retEv && retEv.t <= t
      if (car.retired) continue

      // Find last completed lap marker at time t
      let last: LapMarker | null = null
      for (const m of markers) {
        if (m.t <= t) {
          last = m
        } else break
      }
      if (!last) {
        car.lap = 0
        car.lapProgress = Math.min(0.99, t / 95)
        continue
      }
      car.lap = last.lap
      const nextMarker = markers[markers.indexOf(last) + 1]
      const lapDur = nextMarker && nextMarker.t > last.t ? nextMarker.t - last.t : 92
      const intoLap = t - last.t
      // Finished drivers park at the line
      const finT = finishTimes.get(car.driverId)
      if (finT !== undefined && t >= finT + 5) {
        car.finished = true
        car.lapProgress = 0
      } else {
        car.finished = false
        car.lapProgress = Math.max(0, Math.min(0.999, intoLap / lapDur))
      }
    }
    // Positions & gaps: finished cars use the authoritative final order;
    // still-running cars are ordered by track progress.
    const finishedCars = cars
      .filter((c) => c.finished && !c.retired)
      .sort((a, b) => (a.finalTotalTime ?? Infinity) - (b.finalTotalTime ?? Infinity))
    finishedCars.forEach((car, i) => {
      car.position = i + 1
      car.gapText = i === 0 ? 'Winner' : `+${(((car.finalTotalTime ?? 0) - (finishedCars[0].finalTotalTime ?? 0)) / 1).toFixed(1)}s`
    })
    const runningCars = cars
      .filter((c) => !c.finished && !c.retired)
      .sort((a, b) => (b.lap - a.lap) || (b.lapProgress - a.lapProgress))
    const leaderFinished = finishedCars.length > 0
    runningCars.forEach((car, i) => {
      car.position = finishedCars.length + i + 1
      if (leaderFinished) {
        car.gapText = `L${car.lap}`
      } else if (i === 0) {
        car.gapText = 'Leader'
      } else {
        const leader = runningCars[0]
        const gapLaps = leader.lap - car.lap
        car.gapText = gapLaps > 0 ? `+${gapLaps}L` : `+${((leader.lapProgress - car.lapProgress) * 88).toFixed(1)}s`
      }
    })
    // Retired cars keep their final positions at bottom
    let dnfPos = finishedCars.length + runningCars.length
    for (const car of cars) {
      if (car.retired) car.position = ++dnfPos
    }
  }

  function focusTarget(): CarView | undefined {
    const ordered = [...cars].filter((c) => !c.retired).sort((a, b) => a.position - b.position)
    switch (bc.cameraMode) {
      case 'team': {
        const mine = cars.filter((c) => teamDriverIds.includes(c.driverId)).filter((c) => !c.retired).sort((a, b) => a.position - b.position)[0]
        return mine ?? ordered[0]
      }
      case 'driver': return cars.find((c) => c.driverId === bc.focusedDriverId) ?? ordered[0]
      case 'battle': {
        // closest pair mid-lap
        let bestPair: [CarView, CarView] | null = null
        let bestGap = Infinity
        for (let i = 0; i < ordered.length - 1; i++) {
          const a = ordered[i], b = ordered[i + 1]
          const gap = Math.abs(a.lapProgress - b.lapProgress) * 88 + (a.lap - b.lap) * 88
          if (gap < bestGap) { bestGap = gap; bestPair = [a, b] }
        }
        return bestPair ? bestPair[0] : ordered[0]
      }
      case 'tv': {
        // Auto-director picks the interesting car
        const shot = director.pickShot(bc, teamDriverIds)
        if (shot) {
          shotBanner.textContent = `📺 ${shot.reason}`
          const target = cars.find((c) => c.driverId === shot.driverId)
          if (target && !target.retired) return target
        }
        return ordered[Math.floor(ordered.length * ((bc.cursorSeconds / 40) % 1))] ?? ordered[0]
      }
      default: return undefined // trackMap shows all
    }
  }

  // ----- Rendering -----
  const ctx = canvas.getContext('2d')!
  const resultRef: RaceResult = result
  const updateTower = makeTowerRenderer(bc, camSelect)
  let running = true

  function resize() {
    const rect = stage.getBoundingClientRect()
    canvas.width = Math.max(300, rect.width * devicePixelRatio)
    canvas.height = Math.max(200, rect.height * devicePixelRatio)
  }
  window.addEventListener('resize', resize)
  resize()

  let lastFrame = performance.now()
  let lastFocus: CarView | undefined

  function frame(now: number) {
    if (!running) return
    const dt = Math.min(0.25, (now - lastFrame) / 1000)
    lastFrame = now
    bc.tick(dt)
    computeViewsAt(bc.cursorSeconds)

    // Event feed
    const feedEvents = resultRef.events.filter((e) => e.t <= bc.cursorSeconds)
    while (shownEventIdx < feedEvents.length) {
      const ev = feedEvents[shownEventIdx++]
      const isBig = ['overtake', 'retirement', 'safetyCar', 'virtualSafetyCar', 'leadChange', 'finish', 'weatherChange'].includes(ev.type)
      const line = el('div', { class: `event-line${isBig ? ' big' : ''}` }, ev.detail)
      eventFeed.appendChild(line)
      setTimeout(() => line.remove(), isBig ? 7000 : 3500)
      while (eventFeed.children.length > 6) eventFeed.firstChild?.remove()
    }

    drawTrack(ctx, circuit, trackPath, cars, focusTarget(), lastFocus, canvas)
    const focused = focusTarget()
    lastFocus = focused
    updateTower(cars, tower, focused, resultRef)

    clockDisplay.textContent = fmtRaceClock(bc.cursorSeconds)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // Cleanup when navigating away
  const observer = new MutationObserver(() => {
    if (!document.body.contains(wrapEl)) {
      running = false
      window.removeEventListener('resize', resize)
      observer.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

// ---------------------------------------------------------------------------
// Track drawing — stylized closed circuit with moving cars
// ---------------------------------------------------------------------------

type PathPoint = { x: number; y: number }

function buildTrackPath(_circuit: Circuit): PathPoint[] {
  // Generate a stylized closed loop influenced by circuit characteristics.
  // Deterministic per-circuit via name hash.
  const seedStr = _circuit.id
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) }
  const rand = (n: number) => {
    h = (h * 1103515245 + 12345) >>> 0
    return (((h >>> 16) % 1000) / 1000 - 0.5) * n
  }
  const points: PathPoint[] = []
  const N = 22
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2
    const baseR = 0.32
    points.push({
      x: 0.5 + Math.cos(angle) * (baseR + rand(0.14)),
      y: 0.5 + Math.sin(angle) * (baseR * 0.72 + rand(0.12)),
    })
  }
  return points
}

function pathPosition(path: PathPoint[], frac: number): PathPoint {
  const f = ((frac % 1) + 1) % 1
  const idxF = f * path.length
  const i0 = Math.floor(idxF) % path.length
  const i1 = (i0 + 1) % path.length
  const t = idxF - Math.floor(idxF)
  return {
    x: path[i0].x + (path[i1].x - path[i0].x) * t,
    y: path[i0].y + (path[i1].y - path[i0].y) * t,
  }
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  circuit: Circuit,
  path: PathPoint[],
  cars: CarView[],
  focus?: CarView,
  _prevFocus?: CarView,
  canvas?: HTMLCanvasElement,
) {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  ctx.clearRect(0, 0, W, H)
  const minDim = Math.min(W, H)
  const scale = (p: PathPoint): PathPoint => ({ x: p.x * W, y: p.y * H })

  // Track surface
  ctx.save()
  const zoom = focus && bcZoomFor(bcCameraModeGlobal) || 1
  void zoom
  ctx.strokeStyle = '#2a3644'
  ctx.lineWidth = minDim * 0.055
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const closed = [...path, path[0]]
  closed.forEach((p, i) => {
    const s = scale(p)
    if (i === 0) ctx.moveTo(s.x, s.y)
    else ctx.lineTo(s.x, s.y)
  })
  ctx.closePath()
  ctx.stroke()
  // Inner line detail
  ctx.strokeStyle = '#1d2733'
  ctx.lineWidth = minDim * 0.04
  ctx.stroke()

  // Sector markers
  ctx.fillStyle = '#5f7183'
  ctx.font = `${Math.round(minDim * 0.02)}px monospace`
  const sectors = circuit.sectors
  sectors.forEach((sec, i) => {
    const p = scale(pathPosition(path, i / sectors.length))
    ctx.fillText(sec.name, p.x + 8, p.y - 8)
  })

  // Start/finish line
  const sf = scale(pathPosition(path, 0))
  ctx.save()
  ctx.translate(sf.x, sf.y)
  ctx.rotate(Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x))
  ctx.fillStyle = '#eef2f6'
  for (let i = -3; i <= 3; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#eef2f6' : '#10161f'
    ctx.fillRect(-minDim * 0.01, i * minDim * 0.012, minDim * 0.02, minDim * 0.012)
  }
  ctx.restore()

  // Cars
  const carSize = Math.max(7, minDim * 0.016)
  for (const car of cars) {
    if (car.retired) continue
    const pos = pathPosition(path, car.lapProgress)
    const s = scale(pos)
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.beginPath()
    ctx.arc(s.x + 1.5, s.y + 2.5, carSize * 0.62, 0, Math.PI * 2)
    ctx.fill()
    // body
    ctx.fillStyle = car.color
    ctx.beginPath()
    ctx.arc(s.x, s.y, carSize * 0.58, 0, Math.PI * 2)
    ctx.fill()
    // position label
    if (carSize >= 9) {
      ctx.fillStyle = '#0b0f15'
      ctx.font = `bold ${Math.round(carSize * 0.85)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(car.position), s.x, s.y + 0.5)
      ctx.textAlign = 'start'
      ctx.textBaseline = 'alphabetic'
    }
  }

  // Focus ring
  if (focus && !focus.retired) {
    const pos = pathPosition(path, focus.lapProgress)
    const s = scale(pos)
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 180)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(s.x, s.y, carSize * pulse, 0, Math.PI * 2)
    ctx.stroke()
    // Name tag
    ctx.font = `bold ${Math.round(minDim * 0.018)}px sans-serif`
    const tw = ctx.measureText(focus.lastName.toUpperCase()).width
    ctx.fillStyle = 'rgba(10,14,19,0.85)'
    ctx.fillRect(s.x + carSize, s.y - minDim * 0.03, tw + 14, minDim * 0.026)
    ctx.fillStyle = '#fff'
    ctx.fillText(focus.lastName.toUpperCase(), s.x + carSize + 7, s.y - minDim * 0.011)
  }

  // Wetness overlay hint handled by broadcast HUD text instead
  void canvas
  ctx.restore()
}

let bcCameraModeGlobal: CameraMode = 'tv'
function bcZoomFor(mode: CameraMode): number {
  void mode
  return 1
}
// keep global in sync via renderBroadcast closure usage below
export function setBroadcastCamera(mode: CameraMode) {
  bcCameraModeGlobal = mode
}

function makeTowerRenderer(bc: BroadcastController, camSelect: HTMLElement) {
  return function updateTower(cars: CarView[], tower: HTMLElement, focus: CarView | undefined, result: RaceResult) {
    const sorted = [...cars].sort((a, b) => a.position - b.position)
    tower.innerHTML = ''
    // Header
    tower.appendChild(el('div', { class: 'tower-row', style: 'background:var(--bg-2);font-weight:700' },
      el('span', {}, 'P'), el('span', {}, ''), el('span', {}, 'DRIVER'), el('span', { class: 'gap' }, 'GAP'), el('span', {}, '')))
    for (const car of sorted) {
      const row = el('div', { class: `tower-row${focus?.driverId === car.driverId ? ' focused' : ''}`, style: `border-left-color:${car.color}` },
        el('span', { class: 'posn' }, String(car.position)),
        el('span', {}, el('span', { class: 'tyre-ind', style: `background:${TYRES[(car.tyre as keyof typeof TYRES)]?.color ?? '#888'}` })),
        el('span', { class: 'tla' }, `${car.lastName.slice(0, 10)}${car.finished ? ' 🏁' : car.retired ? ' ⛔' : ''}`),
        el('span', { class: 'gap' }, car.gapText),
        el('span', { style: 'color:var(--text-2);text-align:right' }, `L${car.lap}·${car.pitStops}p`),
      )
      row.addEventListener('click', () => {
        bc.focusedDriverId = car.driverId
        if (bc.cameraMode !== 'driver') {
          bc.cameraMode = 'driver'
          for (const b of camSelect.querySelectorAll('button')) b.classList.toggle('selected', b.textContent === 'Driver')
        }
      })
      tower.appendChild(row)
    }
    void result
  }
}

// ---------------------------------------------------------------------------

function buildCarViews(champ: import('../core/types').Championship, result: RaceResult): CarView[] {
  const views: CarView[] = []
  const finishOrder = result.results.filter((r) => r.classified)
  for (const r of result.results) {
    const driver = champ.drivers[r.driverId]
    const team = champ.teams.find((t) => t.id === r.teamId)
    const classifiedIdx = finishOrder.findIndex((x) => x.driverId === r.driverId)
    views.push({
      driverId: r.driverId,
      teamId: r.teamId,
      lastName: driver?.lastName ?? r.driverId,
      color: team?.colors.primary ?? '#888',
      lap: 0,
      lapProgress: 0,
      position: r.startPosition,
      gapText: '',
      tyre: 'medium',
      pitStops: 0,
      finished: false,
      retired: false,
      finalPosition: classifiedIdx >= 0 ? r.finishPosition : 0,
      finalTotalTime: r.totalTime,
    })
  }
  return views
}
