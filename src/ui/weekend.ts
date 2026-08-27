import { el, fmtTime, toast } from './dom'
import { store } from '../state/store'
import { forecastForRound } from '../championship/engine'
import { defaultManualPlan, runPractice, PRACTICE_FOCUS_LABELS, type PracticeFocus, type PracticePlan } from '../championship/practice'
import type { PaceMode, SetupChoice, StrategyPlaybook, TyreCompoundId, Championship, Team } from '../core/types'
import { TYRES, DRY_COMPOUNDS, WET_COMPOUNDS } from '../core/tyres'
import { renderEventHeader, renderKpiTile, renderHelmet, renderTeamMark } from './renderers'
import { iconCheckered, iconWrench, iconBolt, iconFlag } from './icons'

/**
 * Race Weekend — the management phase before lock-in.
 *
 * P1 redesign: cinematic event hero, visual session timeline
 * (Practice / Qualifying / Race), visual stint bar, weather
 * forecast strip, setup axis block, setup-confidence per driver.
 * All existing state wiring (work.strategy, work.setup, practice)
 * is preserved. The look is now a game event screen, not a form.
 */

interface WorkState { strategy: StrategyPlaybook; setup: SetupChoice }

const WORK_KEY = 'pitwall.work'

function loadWork(champ: Championship, _team: Team): WorkState {
  try {
    const raw = sessionStorage.getItem(WORK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorkState
      if (parsed.strategy && parsed.setup) return parsed
    }
  } catch { /* fallthrough */ }
  const round = champ.rounds[champ.currentRoundIndex]
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const laps = circuit.characteristics.laps
  return {
    strategy: {
      startingTyre: circuit.characteristics.tyreStress > 60 ? 'medium' : 'soft',
      plannedStints: [{ fromLap: Math.floor(laps * 0.45), compound: 'hard' }],
      weatherRules: [{ id: 'wet-auto', description: '', kind: 'wetSwitch', enabled: true, params: { threshold: 25 } }],
      safetyCarRules: [{ id: 'sc-pit', description: '', kind: 'safetyCarPit', enabled: true, params: { minTyreAge: 6, maxLapFraction: 0.7 } }],
      lateRaceRules: [],
      paceMode: 'normal',
      tyreUsage: 'standard',
      energy: 'balanced',
      teamOrder: 'freeToRace',
    },
    setup: { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 },
  }
}

function persistWork(work: WorkState) {
  try { sessionStorage.setItem(WORK_KEY, JSON.stringify(work)) } catch { /* non-fatal */ }
}

function circuitSvgFor(circuitId: string): string {
  // Inline procedural circuit board. Each circuit has a different shape
  // via a stable hash of the id.
  let h = 0
  for (let i = 0; i < circuitId.length; i++) h = (h * 31 + circuitId.charCodeAt(i)) >>> 0
  const r = (n: number) => ((h ^ n) * 2654435761 >>> 0) / 4294967296
  const pts: string[] = []
  const cx = 200, cy = 70
  const N = 6
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2
    const rx = 110 + r(i) * 60
    const ry = 38 + r(i + 7) * 18
    const x = cx + Math.cos(ang) * rx * 0.5
    const y = cy + Math.sin(ang) * ry * 0.55
    pts.push(`${x.toFixed(0)},${y.toFixed(0)}`)
  }
  const path = `M ${pts.join(' L ')} Z`
  return `<svg viewBox="0 0 400 140" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
    <defs>
      <linearGradient id="track" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e63946"/><stop offset="50%" stop-color="#f0c14b"/><stop offset="100%" stop-color="#2a6df4"/>
      </linearGradient>
    </defs>
    <path d="${path}" fill="none" stroke="url(#track)" stroke-width="3"/>
    <path d="${path}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" transform="translate(0,0)"/>
    <circle cx="200" cy="70" r="4" fill="#e63946"/>
    <text x="208" y="74" font-family="Rajdhani,Inter,sans-serif" font-size="9" font-weight="700" letter-spacing="2" fill="#fff">SF</text>
  </svg>`
}

function weatherIconFor(prob: number, isNow: boolean): { icon: string; desc: string } {
  if (isNow) return { icon: prob > 0.6 ? '🌧' : prob > 0.25 ? '🌦' : '☀', desc: prob > 0.6 ? 'WET' : prob > 0.25 ? 'RISK' : 'DRY' }
  return { icon: '○', desc: '—' }
}

export function renderWeekend(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  const team = store.playerTeam!
  const round = champ.rounds[champ.currentRoundIndex]
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const forecast = round.packagesLocked ? null : forecastForRound(champ, round)

  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  // --- Event hero ---
  const side = el('div', { class: 'kv-grid' })
  side.appendChild(renderKpiTile('Circuit', circuit.country))
  side.appendChild(renderKpiTile('Length', `${(circuit.characteristics as { lengthKm?: number }).lengthKm ?? 5.2} km`))
  side.appendChild(renderKpiTile('Laps', String(circuit.characteristics.laps)))
  side.appendChild(renderKpiTile('High Speed', `${Math.round(circuit.characteristics.highSpeed)}%`))
  side.appendChild(renderKpiTile('Overtake', `${100 - circuit.characteristics.overtakingDifficulty}%`))
  side.appendChild(renderKpiTile('Rain Risk', forecast ? `${Math.round(forecast.rainProbability * 100)}%` : '—'))

  inner.appendChild(renderEventHeader({
    eyebrow: `ROUND ${round.index + 1} OF ${champ.rounds.length} · ${round.packagesLocked ? 'DECISIONS LOCKED' : 'MANAGEMENT PHASE'}`,
    title: circuit.name,
    sub: `${circuit.country} · ${(circuit.characteristics as { lengthKm?: number }).lengthKm ?? 5.2} km · ${circuit.characteristics.laps} laps · ${difficultyLabel(circuit.characteristics.overtakingDifficulty)}`,
    side,
    circuitSvg: circuitSvgFor(circuit.id),
  }))

  // --- Countdown banner (only when not locked) ---
  let cd: HTMLElement | null = null
  if (!round.packagesLocked) {
    const countdownBox = el('div', { class: 'phase-banner' })
    cd = el('div', { class: 'countdown mono' }, '--:--')
    countdownBox.appendChild(
      el('div', {},
        el('h2', {}, 'Decision window'),
        el('div', { style: 'color:var(--text-2);font-size:12px' }, 'Lock your race package before time expires. You can update the package as often as you like until lock.'),
      ),
    )
    countdownBox.appendChild(el('div', { class: 'spacer' }))
    countdownBox.appendChild(
      el('div', { style: 'text-align:right' },
        el('div', { style: 'font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em' }, 'Locks in'),
        cd,
      ),
    )
    inner.appendChild(countdownBox)
  }

  // --- Locked state ---
  if (round.packagesLocked) {
    inner.appendChild(el('div', { class: 'panel' },
      el('div', { class: 'panel-body', style: 'text-align:center;padding:32px' },
        el('h2', { style: 'font-size:24px;margin-bottom:8px' }, 'Race package sealed'),
        el('p', { style: 'color:var(--text-1);max-width:520px;margin:0 auto 14px' }, 'All team decisions are immutable. The authoritative simulator is running the race now.'),
        el('button', { class: 'primary', onclick: () => (location.hash = '#/broadcast') }, 'Enter broadcast →'),
      ),
    ))
    page.appendChild(inner)
    root.appendChild(page)
    return
  }

  // --- Work state ---
  const work = loadWork(champ, team)

  // --- Two-column body ---
  const left = el('div', { style: 'display:flex;flex-direction:column;gap:16px' })
  const right = el('div', { style: 'display:flex;flex-direction:column;gap:16px' })

  // Weather forecast strip
  if (forecast) {
    const strip = el('div', { class: 'panel' })
    strip.appendChild(el('div', { class: 'panel-head' },
      el('h3', {}, 'WEATHER FORECAST')))
    const stripBody = el('div', { class: 'panel-body' })
    const cells = el('div', { class: 'weather-strip' })
    const offsets: Array<{ label: string; now: boolean; prob: number }> = [
      { label: 'NOW', now: true, prob: forecast.rainProbability },
      { label: '+5 min', now: false, prob: Math.max(0, Math.min(1, forecast.rainProbability + 0.08 - 0.04)) },
      { label: '+10 min', now: false, prob: Math.max(0, Math.min(1, forecast.rainProbability + 0.16 - 0.05)) },
      { label: '+15 min', now: false, prob: Math.max(0, Math.min(1, forecast.rainProbability + 0.20 - 0.07)) },
    ]
    for (const c of offsets) {
      const wx = weatherIconFor(c.prob, c.now)
      const cell = el('div', { class: `weather-cell${c.now ? ' now' : ''}` })
      cell.appendChild(el('div', { class: 'offset' }, c.label))
      cell.appendChild(el('div', { class: 'icon' }, wx.icon))
      cell.appendChild(el('div', { class: 'pct' }, `${Math.round(c.prob * 100)}%`))
      cell.appendChild(el('div', { class: 'desc' }, wx.desc))
      cells.appendChild(cell)
    }
    stripBody.appendChild(cells)
    strip.appendChild(stripBody)
    left.appendChild(strip)
  }

  // Car performance vs circuit
  const perf = team.carPerformance
  const perfCard = el('div', { class: 'panel' })
  perfCard.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'CAR PERFORMANCE · vs circuit')))
  const perfBody = el('div', { class: 'panel-body' })
  const perfRows = el('div', { class: 'setup-axis' })
  const axisData: Array<[string, number, number]> = [
    ['Low-speed aero', perf.lowSpeedAero, circuit.characteristics.lowSpeed],
    ['Medium-speed aero', perf.mediumSpeedAero, circuit.characteristics.mediumSpeed],
    ['High-speed aero', perf.highSpeedAero, circuit.characteristics.highSpeed],
    ['Straight line', perf.straightLineSpeed, circuit.characteristics.straightLine],
    ['Braking', perf.braking, circuit.characteristics.brakingStress],
    ['Cooling', perf.cooling, 50],
  ]
  for (const [k, v, t] of axisData) {
    const row = el('div', { class: 'axis-row' })
    row.appendChild(el('div', { class: 'lbl' }, k))
    const track = el('div', { class: 'track' })
    track.appendChild(el('div', { class: 'center' }))
    const delta = (v - t) / 50 // -1..+1
    const left = Math.max(0, Math.min(100, 50 + delta * 50))
    const marker = el('div', { class: 'marker' })
    ;(marker as HTMLElement).style.left = `${left}%`
    track.appendChild(marker)
    row.appendChild(track)
    const val = el('div', { class: 'val' })
    val.textContent = `${v.toFixed(0)} / ${t.toFixed(0)}`
    row.appendChild(val)
    perfRows.appendChild(row)
  }
  perfBody.appendChild(perfRows)
  perfCard.appendChild(perfBody)
  left.appendChild(perfCard)

  // Practice card (setup confidence per driver)
  const practiceCard = renderPracticeCard(champ, team, round, () => renderWeekend(root))
  right.appendChild(practiceCard)

  // Strategy card
  const stratCard = el('div', { class: 'panel' })
  stratCard.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'STRATEGY PLAYBOOK')))
  const stratBody = el('div', { class: 'panel-body' })

  // Stint bar
  const stintBar = el('div', { class: 'stint-bar' })
  const totalLaps = circuit.characteristics.laps
  const stints = work.strategy.plannedStints
  const pitLaps = stints.map((s) => s.fromLap).sort((a, b) => a - b)
  type StintSeg = { from: number; to: number; compound: TyreCompoundId; kind: 'stint' }
  const allStops: StintSeg[] = []
  let prev = 1
  for (const p of pitLaps) {
    if (p > prev) {
      allStops.push({ from: prev, to: p, compound: work.strategy.startingTyre, kind: 'stint' })
    }
    prev = p + 1
  }
  if (prev <= totalLaps) {
    const lastCompound = (stints[stints.length - 1]?.compound ?? work.strategy.startingTyre) as TyreCompoundId
    allStops.push({ from: prev, to: totalLaps, compound: lastCompound, kind: 'stint' })
  }
  for (const seg of allStops) {
    const width = ((seg.to - seg.from + 1) / totalLaps) * 100
    const stint = el('div', { class: `stint ${seg.kind}` })
    stint.style.flex = `${width} 1 0`
    const tyre = TYRES[seg.compound]
    const dotColor = tyre?.color ?? '#fff'
    stint.innerHTML = `<span class="label"><span class="dot" style="background:${dotColor}"></span>L${seg.from}–L${seg.to}</span>`
    stintBar.appendChild(stint)
  }
  stratBody.appendChild(stintBar)
  // Legend
  const legend = el('div', { class: 'stint-legend' })
  legend.appendChild(el('span', { class: 'lg-item' }, el('span', { class: 'sw start' }), 'Start stint'))
  legend.appendChild(el('span', { class: 'lg-item' }, el('span', { class: 'sw middle' }), 'Middle stint'))
  legend.appendChild(el('span', { class: 'lg-item' }, el('span', { class: 'sw end' }), 'End stint'))
  stratBody.appendChild(legend)

  // Pit window annotation
  if (stints.length > 0) {
    const w = stints[0]
    stratBody.appendChild(el('p', { style: 'font-size:11px;color:var(--text-2);margin-top:6px' },
      `Pit window: lap ${w.fromLap}` + (stints.length > 1 ? ` (also lap ${stints[1].fromLap})` : '') + ` · ` +
      (forecast && forecast.rainProbability > 0.35 ? 'rain override enabled' : 'rain override disabled'),
    ))
  }

  // Starting tyre chips
  const tyreRow = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' })
  for (const compound of [...DRY_COMPOUNDS, ...WET_COMPOUNDS]) {
    const t = TYRES[compound]
    const chip = el('button', {
      class: `tyre-chip${work.strategy.startingTyre === compound ? ' selected' : ''}`,
      style: `border-color:${work.strategy.startingTyre === compound ? t.color : 'var(--line)'};color:${t.color}`,
      onclick: () => {
        work.strategy.startingTyre = compound
        refreshTyres()
        persistWork(work)
        store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup })
      },
    }, `● ${t.name}`)
    tyreRow.appendChild(chip)
  }
  stratBody.appendChild(tyreRow)

  // Pit stops (compact numeric rows)
  const stintsBox = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:10px' })
  const renderStints = () => {
    stintsBox.innerHTML = ''
    work.strategy.plannedStints.forEach((stint, i) => {
      stintsBox.appendChild(
        el('div', { style: 'display:flex;align-items:center;gap:10px;font-size:13px' },
          el('span', { class: 'mono', style: 'color:var(--text-1)' }, `Stop ${i + 1}: lap`),
          (() => {
            const inp = el('input', { type: 'number', min: 1, max: circuit.characteristics.laps - 1, value: stint.fromLap }) as HTMLInputElement
            inp.style.width = '70px'
            inp.addEventListener('change', () => { stint.fromLap = Math.max(1, Math.min(circuit.characteristics.laps - 1, Number(inp.value))); persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }); renderStints() })
            return inp
          })(),
          selectTyre(stint.compound, (v) => { stint.compound = v; persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }); renderStints() }),
          el('button', { class: 'small ghost', onclick: () => { work.strategy.plannedStints.splice(i, 1); persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }); renderStints() } }, '✕'),
        ),
      )
    })
    if (work.strategy.plannedStints.length < 3) {
      stintsBox.appendChild(el('button', { class: 'small', onclick: () => { work.strategy.plannedStints.push({ fromLap: Math.floor(circuit.characteristics.laps * 0.6), compound: 'hard' }); persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }); renderStints() } }, '+ Add pit stop'))
    }
  }
  renderStints()
  stratBody.appendChild(stintsBox)

  // Modes (pace, energy, tyre usage)
  stratBody.appendChild(segmented('Pace mode', ['conserve', 'normal', 'push', 'attack'], work.strategy.paceMode, (v) => { work.strategy.paceMode = v as PaceMode; persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }) }))
  stratBody.appendChild(segmented('Tyre usage', ['conserve', 'standard', 'aggressive'], work.strategy.tyreUsage, (v) => { work.strategy.tyreUsage = v as never; persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }) }))
  stratBody.appendChild(segmented('Energy', ['harvest', 'balanced', 'deploy'], work.strategy.energy, (v) => { work.strategy.energy = v as never; persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }) }))

  // Conditional rules as toggleable chips
  stratBody.appendChild(rulesBlock(work, () => store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup })))
  stratCard.appendChild(stratBody)
  right.appendChild(stratCard)

  // Setup card
  const setupCard = el('div', { class: 'panel' })
  setupCard.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'CAR SETUP')))
  const setupBody = el('div', { class: 'panel-body' })
  setupBody.appendChild(sliderRow('Downforce ←→ Top speed', -3, 3, work.setup.downforceBias, (v) => { work.setup.downforceBias = v; persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }) }))
  setupBody.appendChild(sliderRow('Mechanical grip ←→ Straights', -3, 3, work.setup.mechanicalGripBias, (v) => { work.setup.mechanicalGripBias = v; persistWork(work); store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup }) }))
  setupCard.appendChild(setupBody)
  right.appendChild(setupCard)

  inner.appendChild(el('div', { class: 'grid cols-2' }, left, right))

  // --- Session timeline (Practice / Qualifying / Race) ---
  inner.appendChild(renderSessionList(champ, team, round, forecast))

  // --- Lock button ---
  inner.appendChild(
    el('div', { style: 'display:flex;justify-content:center;padding:14px 0' },
      el('button', {
        class: 'primary',
        style: 'font-size:14px;padding:14px 48px',
        onclick: () => {
          store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup })
          store.lockAndSimulate()
          location.hash = '#/broadcast'
        },
      }, 'LOCK RACE PACKAGE & ENTER BROADCAST'),
    ),
  )

  page.appendChild(inner)
  root.appendChild(page)

  // Countdown ticker
  if (cd) {
    const tickTimer = setInterval(() => {
      const remaining = Math.max(0, (store.managementDeadline - Date.now()) / 1000)
      cd!.textContent = fmtTime(remaining)
      if (remaining <= 0) {
        clearInterval(tickTimer)
        store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup })
        store.lockAndSimulate()
        toast('Time expired — race package locked automatically.')
        location.hash = '#/broadcast'
      }
    }, 250)
  }

  function refreshTyres() {
    for (const btn of tyreRow.querySelectorAll('.tyre-chip')) {
      const compoundName = (btn.textContent || '').replace('● ', '').toLowerCase()
      const id = compoundName.startsWith('inter') ? 'inter' : compoundName.startsWith('full') ? 'wet' : (compoundName as TyreCompoundId)
      btn.className = `tyre-chip${work.strategy.startingTyre === id ? ' selected' : ''}`
      ;(btn as HTMLElement).style.borderColor = work.strategy.startingTyre === id ? TYRES[id].color : 'var(--line)'
    }
  }
}

// ---------------------------------------------------------------------------
// Session list (Practice / Qualifying / Race)
// ---------------------------------------------------------------------------

function renderSessionList(_champ: Championship, team: Team, round: import('../core/types').RoundState, forecast: ReturnType<typeof forecastForRound> | null): HTMLElement {
  const card = el('div', { class: 'panel' })
  card.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'RACE WEEKEND · SESSIONS')))
  const body = el('div', { class: 'panel-body' })
  const list = el('div', { class: 'session-list' })

  // Practice status
  const existing = (round.practiceBonus ?? {})[team.id]
  const practice = el('div', { class: 'session-row complete' })
  practice.appendChild(el('div', { class: 'session-num' }, '1'))
  practice.appendChild(el('div', { class: 'session-body' },
    el('div', { class: 'name' }, 'Practice'),
    el('div', { class: 'desc' }, existing !== undefined
      ? `Setup confidence ${existing >= 0 ? '+' : ''}${(existing * 100).toFixed(1)}s. (Driver boosts applied.)`
      : 'Not yet run this round.'),
  ))
  practice.appendChild(el('div', { class: 'session-status' }, existing !== undefined ? 'COMPLETE' : 'PENDING'))
  list.appendChild(practice)

  // Qualifying
  const quali = el('div', { class: 'session-row' })
  quali.appendChild(el('div', { class: 'session-num' }, '2'))
  quali.appendChild(el('div', { class: 'session-body' },
    el('div', { class: 'name' }, 'Qualifying'),
    el('div', { class: 'desc' }, forecast ? `Forecast: ${forecast.condition}. Set strategy and pace mode below.` : 'Awaiting forecast.'),
  ))
  quali.appendChild(el('div', { class: 'session-status' }, 'NEXT'))
  list.appendChild(quali)

  // Race
  const race = el('div', { class: 'session-row locked' })
  race.appendChild(el('div', { class: 'session-num' }, '3'))
  race.appendChild(el('div', { class: 'session-body' },
    el('div', { class: 'name' }, 'Race'),
    el('div', { class: 'desc' }, `Locked until qualifying completes. ${round.raceDone ? 'Race complete.' : ''}`),
  ))
  race.appendChild(el('div', { class: 'session-status' }, round.raceDone ? 'COMPLETE' : 'LOCKED'))
  list.appendChild(race)

  body.appendChild(list)
  card.appendChild(body)
  return card
}

// ---------------------------------------------------------------------------
// Practice card
// ---------------------------------------------------------------------------

function renderPracticeCard(champ: Championship, team: Team, round: import('../core/types').RoundState, refresh: () => void) {
  const card = el('div', { class: 'panel' })
  card.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'PRACTICE · SETUP CONFIDENCE')))
  const body = el('div', { class: 'panel-body' })
  const existing = (round.practiceBonus ?? {})[team.id]
  const plan = loadPracticePlan(champ, team)

  // Per-driver confidence using helmet
  const driversBox = el('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-bottom:6px' })
  for (const id of team.driverIds) {
    const d = champ.drivers[id]
    if (!d) continue
    const row = el('div', { style: 'display:flex;align-items:center;gap:10px' })
    row.appendChild(renderHelmet({ id: team.id, name: team.name, colors: team.colors }, id.slice(-2), 'sm'))
    const text = el('div', { style: 'display:flex;flex-direction:column;flex:1;min-width:0' })
    text.appendChild(el('span', { class: 'display', style: 'font-size:13px' }, `${d.firstName[0]}. ${d.lastName}`))
    const bar = el('div', { class: 'driver-agency' })
    bar.style.padding = '8px 12px'
    bar.style.background = 'var(--bg-data-0)'
    const trackWrap = el('div', { style: 'display:flex;align-items:center;gap:8px' })
    const trk = el('div', { class: 'agency-bar', style: 'flex:1' })
    const fill = el('div')
    const base = existing !== undefined ? existing : 0
    const pct = Math.max(8, Math.min(96, 50 + base * 500))
    fill.style.width = `${pct}%`
    fill.style.background = base >= 0 ? 'var(--good)' : 'var(--bad)'
    trk.appendChild(fill)
    trackWrap.appendChild(trk)
    trackWrap.appendChild(el('span', { class: 'val mono' }, existing !== undefined ? `${existing >= 0 ? '+' : ''}${(existing * 100).toFixed(1)}s` : '—'))
    bar.appendChild(trackWrap)
    text.appendChild(bar)
    row.appendChild(text)
    driversBox.appendChild(row)
  }
  body.appendChild(driversBox)

  // Mode toggle
  const modeRow = el('div', { class: 'seg-group' })
  modeRow.appendChild(el('button', { class: plan.mode === 'quickSim' ? 'selected' : '', onclick: () => { plan.mode = 'quickSim'; savePracticePlan(champ, team, plan); refresh() } }, 'Quick Sim'))
  modeRow.appendChild(el('button', { class: plan.mode === 'manual' ? 'selected' : '', onclick: () => { plan.mode = 'manual'; savePracticePlan(champ, team, plan); refresh() } }, 'Manual Plan'))
  body.appendChild(modeRow)

  if (plan.mode === 'manual') {
    const focusRow = el('div', { style: 'display:flex;flex-direction:column;gap:4px' })
    for (const f of ['longRun', 'qualiSim', 'raceSim'] as PracticeFocus[]) {
      const on = plan.focuses.includes(f)
      focusRow.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:flex-start;cursor:pointer' },
        el('input', {
          type: 'checkbox',
          ...(on ? { checked: true } : {}),
          onchange: (e: Event) => {
            const checked = (e.currentTarget as HTMLInputElement).checked
            if (checked) { if (!plan.focuses.includes(f)) plan.focuses.push(f) }
            else { plan.focuses = plan.focuses.filter((x) => x !== f) }
            savePracticePlan(champ, team, plan)
            refresh()
          },
        }),
        el('div', {},
          el('div', { style: 'font-weight:600' }, PRACTICE_FOCUS_LABELS[f].name),
          el('div', { style: 'font-size:11px;color:var(--text-2)' }, PRACTICE_FOCUS_LABELS[f].desc),
        ),
      ))
    }
    body.appendChild(focusRow)

    const effortRow = el('div', { class: 'seg-group' })
    for (const e of ['low', 'standard', 'high'] as const) {
      effortRow.appendChild(el('button', {
        class: plan.effort === e ? 'selected' : '',
        onclick: () => { plan.effort = e; savePracticePlan(champ, team, plan); refresh() },
      }, e.toUpperCase()))
    }
    body.appendChild(effortRow)
  }

  body.appendChild(
    el('button', {
      class: 'primary',
      style: 'margin-top:8px;width:100%',
      onclick: () => {
        const r = runPractice(champ, team, round, plan)
        toast(`${r.summary} (+${(r.bonus * 100).toFixed(1)}s setup confidence)`, r.bonus < 0)
        store.save()
        refresh()
      },
    }, existing !== undefined ? 'Run Practice Again' : 'Run Practice'),
  )

  card.appendChild(body)
  return card
}

const PRACTICE_KEY = 'pitwall.practice'
interface PracticeSaved { [teamId: string]: PracticePlan }

function loadPracticePlan(champ: Championship, team: Team): PracticePlan {
  try {
    const raw = sessionStorage.getItem(`${PRACTICE_KEY}.${champ.id}`)
    if (raw) {
      const parsed = JSON.parse(raw) as PracticeSaved
      if (parsed[team.id]) return parsed[team.id]
    }
  } catch { /* fallthrough */ }
  return defaultManualPlan(team.id)
}

function savePracticePlan(champ: Championship, team: Team, plan: PracticePlan) {
  try {
    const raw = sessionStorage.getItem(`${PRACTICE_KEY}.${champ.id}`)
    const obj: PracticeSaved = raw ? JSON.parse(raw) : {}
    obj[team.id] = plan
    sessionStorage.setItem(`${PRACTICE_KEY}.${champ.id}`, JSON.stringify(obj))
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Rules block
// ---------------------------------------------------------------------------

function rulesBlock(work: WorkState, onChange: () => void): HTMLElement {
  const block = el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:6px' })
  const rules: Array<{ name: string; desc: string; on: boolean; toggle: () => void }> = [
    { name: 'Rain switch', desc: 'Auto-switch to inters on wetness threshold', on: work.strategy.weatherRules[0]?.enabled ?? true, toggle: () => {
      ensureRule(work.strategy.weatherRules, 'wetSwitch', 'wet-auto', 'Switch to rain tyres past wetness threshold').enabled = !work.strategy.weatherRules[0]?.enabled
    } },
    { name: 'Safety Car stop', desc: 'Cheap stop under SC with worn tyres', on: work.strategy.safetyCarRules[0]?.enabled ?? true, toggle: () => {
      ensureRule(work.strategy.safetyCarRules, 'safetyCarPit', 'sc-pit', 'Pit under SC').enabled = !work.strategy.safetyCarRules[0]?.enabled
    } },
    { name: 'Late-race attack', desc: 'Fresh softs for a final charge', on: work.strategy.lateRaceRules[0]?.enabled ?? false, toggle: () => {
      const rule = ensureRule(work.strategy.lateRaceRules, 'lateAttack', 'late-attack', 'Late attack on Softs', { maxLapsRemaining: 9 })
      rule.enabled = !rule.enabled
    } },
  ]
  for (const r of rules) {
    const row = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0' })
    const left = el('div', {},
      el('div', { style: 'font-size:13px;font-weight:600' }, r.name),
      el('div', { style: 'font-size:11px;color:var(--text-2)' }, r.desc),
    )
    const badge = el('span', { class: `badge ${r.on ? 'green' : 'grey'}`, style: 'cursor:pointer;min-width:52px;text-align:center' }, r.on ? 'ON' : 'OFF')
    badge.addEventListener('click', () => {
      r.toggle()
      onChange()
      const nowOn = badge.textContent === 'ON'
      badge.textContent = nowOn ? 'OFF' : 'ON'
      badge.className = `badge ${nowOn ? 'grey' : 'green'}`
    })
    row.append(left, badge)
    block.appendChild(row)
  }
  return block
}

function ensureRule(rules: StrategyPlaybook['weatherRules'], kind: 'wetSwitch' | 'safetyCarPit' | 'lateAttack', id: string, description: string, params?: Record<string, number>) {
  let rule = rules.find((r) => r.kind === kind)
  if (!rule) {
    rule = { id, description, kind, enabled: false, params: params ?? {} }
    rules.push(rule)
  }
  if (params) Object.assign(rule.params, params)
  return rule
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sliderRow(label: string, min: number, max: number, value: number, onChange: (v: number) => void): HTMLElement {
  const box = el('div', { class: 'slider-row' })
  box.appendChild(el('span', { class: 'slabel' }, label))
  const inp = el('input', { type: 'range', min, max, value }) as HTMLInputElement
  const val = el('span', { class: 'sval mono' }, value > 0 ? `+${value}` : String(value))
  inp.addEventListener('input', () => {
    val.textContent = Number(inp.value) > 0 ? `+${inp.value}` : inp.value
    onChange(Number(inp.value))
  })
  box.append(inp, val)
  return box
}

function segmented(label: string, options: string[], current: string, onChange: (v: string) => void): HTMLElement {
  const group = el('div', { class: 'seg-group' })
  for (const opt of options) {
    group.appendChild(
      el('button', {
        class: opt === current ? 'selected' : '',
        onclick: (e: Event) => {
          for (const b of group.querySelectorAll('button')) b.classList.remove('selected')
          ;(e.currentTarget as HTMLElement).classList.add('selected')
          onChange(opt)
        },
      }, opt),
    )
  }
  return el('div', {},
    el('div', { style: 'font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px' }, label),
    group,
  )
}

function selectTyre(current: TyreCompoundId, onChange: (v: TyreCompoundId) => void): HTMLElement {
  const sel = el('select') as HTMLSelectElement
  for (const c of [...DRY_COMPOUNDS, ...WET_COMPOUNDS]) {
    const opt = el('option', { value: c }, TYRES[c].name) as HTMLOptionElement
    if (c === current) opt.selected = true
    sel.appendChild(opt)
  }
  sel.addEventListener('change', () => onChange(sel.value as TyreCompoundId))
  return sel
}

function difficultyLabel(v: number): string {
  return v < 35 ? 'Easy' : v < 55 ? 'Medium' : v < 70 ? 'Hard' : 'Very Hard'
}

// satisfy linter for unused icon imports
void iconCheckered; void iconWrench; void iconBolt; void iconFlag; void renderTeamMark
