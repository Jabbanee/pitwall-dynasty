import { el, fmtTime, toast } from './dom'
import { store } from '../state/store'
import { forecastForRound } from '../championship/engine'
import { defaultManualPlan, runPractice, PRACTICE_FOCUS_LABELS, type PracticeFocus, type PracticePlan } from '../championship/practice'
import type { PaceMode, SetupChoice, StrategyPlaybook, TyreCompoundId, Championship, Team } from '../core/types'
import { TYRES, DRY_COMPOUNDS, WET_COMPOUNDS } from '../core/tyres'

/** Race Weekend — the management phase before lock-in. */

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

  // --- Header with countdown ---
  const countdown = el('div', { class: 'countdown mono' }, '--:--')
  inner.appendChild(
    el('div', { class: 'phase-banner' },
      el('div', {},
        el('h2', {}, `Round ${round.index + 1} / ${champ.rounds.length} — ${circuit.name}`),
        el('div', { style: 'color:var(--text-2);font-size:12px' },
          `${circuit.country} · ${circuit.characteristics.lengthKm}km · ${circuit.characteristics.laps} laps · Overtaking: ${difficultyLabel(circuit.characteristics.overtakingDifficulty)} · Tyre stress: ${circuit.characteristics.tyreStress}`),
      ),
      el('div', { class: 'spacer' }),
      el('div', { style: 'text-align:right' },
        el('div', { style: 'font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em' }, round.packagesLocked ? 'Decisions locked' : 'Locks in'),
        countdown,
      ),
    ),
  )

  if (round.packagesLocked) {
    inner.appendChild(
      el('div', { class: 'card' }, el('div', { class: 'card-body', style: 'align-items:center;text-align:center' },
        el('h3', {}, 'Race package sealed'),
        el('p', { style: 'color:var(--text-1);max-width:520px' }, 'All team decisions are immutable. The authoritative simulator is running the race now.'),
        el('button', { class: 'primary', onclick: () => (location.hash = '#/broadcast') }, 'Enter broadcast →'),
      )),
    )
    page.appendChild(inner)
    root.appendChild(page)
    return
  }

  // --- Working state (persisted into pendingStrategy via engine) ---
  const work = loadWork(champ, team)

  // --- Grid layout ---
  const left = el('div', { style: 'display:flex;flex-direction:column;gap:16px' })
  const right = el('div', { style: 'display:flex;flex-direction:column;gap:16px' })

  // Car performance card
  const perf = team.carPerformance
  left.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Car Performance'), el('span', { class: 'badge grey' }, 'vs circuit needs')),
    el('div', { class: 'card-body' },
      ratingBar('Low-speed aero', perf.lowSpeedAero, circuit.characteristics.lowSpeed),
      ratingBar('Medium-speed aero', perf.mediumSpeedAero, circuit.characteristics.mediumSpeed),
      ratingBar('High-speed aero', perf.highSpeedAero, circuit.characteristics.highSpeed),
      ratingBar('Straight line', perf.straightLineSpeed, circuit.characteristics.straightLine),
      ratingBar('Braking', perf.braking, circuit.characteristics.brakingStress),
      ratingBar('Traction', perf.traction, 50),
      ratingBar('Reliability', perf.reliability, 50),
      ratingBar('Cooling', perf.cooling, 50),
      ratingBar('Tyre wear (lower better)', 100 - perf.tyreWear, 100 - circuit.characteristics.tyreStress),
    ),
  ))

  // Weather card
  right.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Weather Forecast')),
    el('div', { class: 'card-body' },
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Expected'), el('span', { class: 'value' }, forecast!.condition)),
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Rain risk'), el('span', { class: 'value' }, `${Math.round(forecast!.rainProbability * 100)}%`)),
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Forecast confidence'), el('span', { class: 'value' }, `${Math.round(forecast!.confidence * 100)}%`)),
      el('p', { style: 'font-size:12px;color:var(--text-2)' }, 'Rain can arrive mid-race. Make sure your wet rules are enabled below.'),
    ),
  ))

  // Setup card
  const setupCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Car Setup')))
  const setupBody = el('div', { class: 'card-body' })
  setupBody.appendChild(sliderRow('Downforce ←→ Top speed', -3, 3, work.setup.downforceBias, (v) => { work.setup.downforceBias = v; persist() }))
  setupBody.appendChild(sliderRow('Mechanical grip ←→ Straights', -3, 3, work.setup.mechanicalGripBias, (v) => { work.setup.mechanicalGripBias = v; persist() }))
  setupCard.appendChild(setupBody)
  right.appendChild(setupCard)

  // Practice card — sets up confidence bonus consumed by the simulator
  const practiceCard = renderPracticeCard(champ, team, round, () => renderWeekend(root))
  right.appendChild(practiceCard)

  // Strategy card
  const stratCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Strategy Playbook')))
  const stratBody = el('div', { class: 'card-body' })

  // Starting tyre
  const tyreRow = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' })
  for (const compound of [...DRY_COMPOUNDS, ...WET_COMPOUNDS]) {
    const t = TYRES[compound]
    tyreRow.appendChild(
      el('button', {
        class: `tyre-chip${work.strategy.startingTyre === compound ? ' selected' : ''}`,
        style: `border-color:${work.strategy.startingTyre === compound ? t.color : 'var(--line)'};color:${t.color}`,
        onclick: () => {
          work.strategy.startingTyre = compound
          refreshTyres()
          persist()
        },
      }, `● ${t.name}`),
    )
  }
  stratBody.appendChild(labelled('Starting tyre', tyreRow))

  // Pit windows
  const stintsBox = el('div', { style: 'display:flex;flex-direction:column;gap:8px' })
  const renderStints = () => {
    stintsBox.innerHTML = ''
    work.strategy.plannedStints.forEach((stint, i) => {
      stintsBox.appendChild(
        el('div', { style: 'display:flex;align-items:center;gap:10px;font-size:13px' },
          el('span', { class: 'mono', style: 'color:var(--text-1)' }, `Stop ${i + 1}: lap`),
          (() => {
            const inp = el('input', { type: 'number', min: 1, max: circuit.characteristics.laps - 1, value: stint.fromLap }) as HTMLInputElement
            inp.style.width = '70px'
            inp.addEventListener('change', () => { stint.fromLap = Math.max(1, Math.min(circuit.characteristics.laps - 1, Number(inp.value))); persist() })
            return inp
          })(),
          selectTyre(stint.compound, (v) => { stint.compound = v; persist() }),
          el('button', { class: 'small ghost', onclick: () => { work.strategy.plannedStints.splice(i, 1); renderStints(); persist() } }, '✕'),
        ),
      )
    })
    if (work.strategy.plannedStints.length < 3) {
      stintsBox.appendChild(el('button', { class: 'small', onclick: () => { work.strategy.plannedStints.push({ fromLap: Math.floor(circuit.characteristics.laps * 0.6), compound: 'hard' }); renderStints(); persist() } }, '+ Add pit stop'))
    }
  }
  renderStints()
  stratBody.appendChild(labelled('Planned pit stops', stintsBox))

  // Modes
  stratBody.appendChild(segmented('Pace mode', ['conserve', 'normal', 'push', 'attack'], work.strategy.paceMode, (v) => { work.strategy.paceMode = v as PaceMode; persist() }))
  stratBody.appendChild(segmented('Tyre usage', ['conserve', 'standard', 'aggressive'], work.strategy.tyreUsage, (v) => { work.strategy.tyreUsage = v as never; persist() }))
  stratBody.appendChild(segmented('Energy', ['harvest', 'balanced', 'deploy'], work.strategy.energy, (v) => { work.strategy.energy = v as never; persist() }))

  // Conditional rules
  stratBody.appendChild(labelled('Conditional rules',
    el('div', { style: 'display:flex;flex-direction:column;gap:6px' },
      ruleToggle('Rain switch', 'Switch to rain tyres when track wetness crosses threshold', work.strategy.weatherRules[0]?.enabled ?? true, (v) => {
        ensureRule(work.strategy.weatherRules, 'wetSwitch', 'wet-auto', 'Switch to rain tyres past wetness threshold').enabled = v
        persist()
      }),
      ruleToggle('Safety Car stop', 'Cheap stop under Safety Car when tyres are worn enough', work.strategy.safetyCarRules[0]?.enabled ?? true, (v) => {
        ensureRule(work.strategy.safetyCarRules, 'safetyCarPit', 'sc-pit', 'Pit under SC').enabled = v
        persist()
      }),
      ruleToggle('Late-race attack', 'Fit fresh Softs for a final charge in the last laps', work.strategy.lateRaceRules[0]?.enabled ?? false, (v) => {
        ensureRule(work.strategy.lateRaceRules, 'lateAttack', 'late-attack', 'Late attack on Softs', { maxLapsRemaining: 9 }).enabled = v
        persist()
      }),
    ),
  ))
  stratCard.appendChild(stratBody)
  right.appendChild(stratCard)

  inner.appendChild(el('div', { class: 'grid cols-2' }, left, right))

  // --- Lock button ---
  inner.appendChild(
    el('div', { style: 'display:flex;justify-content:center;padding:10px 0' },
      el('button', {
        class: 'primary',
        style: 'font-size:16px;padding:12px 44px',
        onclick: () => {
          store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup })
          store.lockAndSimulate()
          location.hash = '#/broadcast'
        },
      }, 'LOCK RACE PACKAGE & SIMULATE'),
    ),
  )

  function refreshTyres() {
    for (const btn of tyreRow.querySelectorAll('.tyre-chip')) {
      const compoundName = btn.textContent!.replace('● ', '').toLowerCase()
      const id = compoundName.startsWith('inter') ? 'inter' : compoundName.startsWith('full') ? 'wet' : (compoundName as TyreCompoundId)
      btn.className = `tyre-chip${work.strategy.startingTyre === id ? ' selected' : ''}`
      ;(btn as HTMLElement).style.borderColor = work.strategy.startingTyre === id ? TYRES[id].color : 'var(--line)'
    }
  }

  function persist() {
    store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup })
  }

  page.appendChild(inner)
  root.appendChild(page)

  // Countdown ticker
  const tickTimer = setInterval(() => {
    const remaining = Math.max(0, (store.managementDeadline - Date.now()) / 1000)
    countdown.textContent = fmtTime(remaining)
    if (remaining <= 0) {
      clearInterval(tickTimer)
      store.engine?.updateStrategy(team.id, { strategy: work.strategy, setup: work.setup })
      store.lockAndSimulate()
      toast('Time expired — race package locked automatically.')
      location.hash = '#/broadcast'
    }
  }, 250)
}

// ---------------------------------------------------------------------------
// Practice card
// ---------------------------------------------------------------------------

function renderPracticeCard(champ: Championship, team: Team, round: import('../core/types').RoundState, refresh: () => void) {
  const card = el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h3', {}, 'Practice')))
  const body = el('div', { class: 'card-body' })
  const existing = (round.practiceBonus ?? {})[team.id]
  const plan = loadPracticePlan(champ, team)

  body.appendChild(el('p', { style: 'color:var(--text-2);font-size:12px;margin-bottom:6px' },
    'Run practice to learn the track, dial in the setup, and seed driver confidence. Quick sim is low effort, Manual lets you pick focuses.'))

  // Mode toggle
  const modeRow = el('div', { class: 'seg-group' })
  const quickBtn = el('button', { class: plan.mode === 'quickSim' ? 'selected' : '', onclick: () => { plan.mode = 'quickSim'; savePracticePlan(champ, team, plan); refresh() } }, 'Quick Sim')
  const manualBtn = el('button', { class: plan.mode === 'manual' ? 'selected' : '', onclick: () => { plan.mode = 'manual'; savePracticePlan(champ, team, plan); refresh() } }, 'Manual Plan')
  modeRow.append(quickBtn, manualBtn)
  body.appendChild(labelled('Approach', modeRow))

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
            if (checked) {
              if (!plan.focuses.includes(f)) plan.focuses.push(f)
            } else {
              plan.focuses = plan.focuses.filter((x) => x !== f)
            }
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
    body.appendChild(labelled('Focus areas', focusRow))

    const effortRow = el('div', { class: 'seg-group' })
    for (const e of ['low', 'standard', 'high'] as const) {
      effortRow.appendChild(el('button', {
        class: plan.effort === e ? 'selected' : '',
        onclick: () => { plan.effort = e; savePracticePlan(champ, team, plan); refresh() },
      }, e.toUpperCase()))
    }
    body.appendChild(labelled('Effort', effortRow))
  }

  // Status / run button
  const status = el('div', { class: 'practice-status' })
  if (existing !== undefined) {
    const pct = (existing * 100).toFixed(1)
    const cls = existing >= 0.04 ? 'good' : existing >= 0 ? 'warn' : 'bad'
    status.appendChild(el('div', { class: `stat` },
      el('span', {}, 'Last result'),
      el('span', { class: 'value', style: `color:var(--${cls === 'good' ? 'good' : cls === 'warn' ? 'warn' : 'bad'})` }, `${existing >= 0 ? '+' : ''}${pct}s bonus`),
    ))
  } else {
    status.appendChild(el('div', { style: 'font-size:12px;color:var(--text-2)' }, 'No practice run yet for this round.'))
  }
  body.appendChild(status)

  body.appendChild(
    el('button', {
      class: 'primary',
      style: 'margin-top:6px',
      onclick: () => {
        const r = runPractice(champ, team, round, plan)
        toast(`${r.summary} (+${(r.bonus * 100).toFixed(1)}s setup confidence)`, r.bonus < 0)
        store.save()
        refresh()
      },
    }, 'Run Practice'),
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

function labelled(label: string, control: HTMLElement): HTMLElement {
  return el('div', {},
    el('div', { style: 'font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px' }, label),
    control,
  )
}

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
        onclick: (e) => {
          for (const b of group.querySelectorAll('button')) b.classList.remove('selected')
          ;(e.currentTarget as HTMLElement).classList.add('selected')
          onChange(opt)
        },
      }, opt),
    )
  }
  return labelled(label, group)
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

function ruleToggle(name: string, desc: string, enabled: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px' })
  const leftSide = el('div', {},
    el('div', { style: 'font-size:13px;font-weight:600' }, name),
    el('div', { style: 'font-size:11px;color:var(--text-2)' }, desc),
  )
  const badgeEl = el('span', { class: `badge ${enabled ? 'green' : 'grey'}`, style: 'cursor:pointer;min-width:52px;text-align:center' }, enabled ? 'ON' : 'OFF')
  badgeEl.addEventListener('click', () => {
    const nowOn = badgeEl.textContent === 'ON'
    badgeEl.textContent = nowOn ? 'OFF' : 'ON'
    badgeEl.className = `badge ${nowOn ? 'grey' : 'green'}`
    onChange(!nowOn)
  })
  row.append(leftSide, badgeEl)
  return row
}

function ratingBar(label: string, value: number, target: number): HTMLElement {
  const color = value >= 75 ? '#3fa34d' : value >= 55 ? '#8fd44a' : value >= 40 ? '#f2c744' : '#e8443a'
  return el('div', {},
    el('div', { style: 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px' },
      el('span', { style: 'color:var(--text-1)' }, label),
      el('span', { class: 'mono' }, `${value.toFixed(0)}${target ? ` (track ${Math.round(target)})` : ''}`),
    ),
    el('div', { class: 'rating-bar' }, el('div', { style: `width:${value}%;background:${color}` })),
  )
}

function difficultyLabel(v: number): string {
  return v < 35 ? 'Easy' : v < 55 ? 'Medium' : v < 70 ? 'Hard' : 'Very Hard'
}

function ensureRule(rules: StrategyPlaybook['weatherRules'], kind: 'wetSwitch' | 'safetyCarPit' | 'lateAttack', id: string, description: string, params?: Record<string, number>) {
  let rule = rules.find((r) => r.kind === kind)
  if (!rule) {
    rule = { id, description, kind, enabled: false, params: params ?? {} }
    rules.push(rule)
  }
  Object.assign(rule.params, params ?? {})
  return rule
}

const WORK_KEY = 'pitwall.work'

interface WorkState { strategy: StrategyPlaybook; setup: SetupChoice }

function loadWork(champ: Championship, _team: Team): WorkState {
  try {
    const raw = sessionStorage.getItem(WORK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorkState
      if (parsed.strategy && parsed.setup) return parsed
    }
  } catch { /* fallthrough */ }
  // Sensible defaults derived from circuit + car
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
