import { el, toast } from './dom'
import { store } from '../state/store'
import { createChampionship } from '../championship/create'
import { START_YEARS, regulationsForYear } from '../regulations/regulations'
import type { Championship } from '../core/types'
import { iconCar, iconCheckered, iconFlag, iconWrench, iconLayers, iconCloud, iconCpu, iconTrophy } from './icons'

/**
 * Championship creation screen — P1 redesign.
 *
 * Real / Fictional career choice is a cinematic two-card selection.
 * The era strip is a horizontal scroll of large era tiles. The
 * era-summary card sits below the chosen era and shows the rules
 * that change between eras.
 */

export function renderNewChampionship(root: HTMLElement, mode: Championship['mode']) {
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  let teamCount = 10
  let races = mode === 'career' ? 10 : 5
  let mgmtSeconds = mode === 'career' ? 600 : 180
  let weather = true
  let equalTeams = false
  let teamName = ''
  let careerKind: 'fictional' | 'real' = 'fictional'
  let eraYear = 2022

  const heading = el('h1', {}, mode === 'career' ? 'New Solo Career' : 'New Fast Championship')
  inner.appendChild(heading)

  const form = el('div', { class: 'panel' })
  const body = el('div', { class: 'panel-body' })
  form.appendChild(body)
  inner.appendChild(form)

  const actions = el('div', { style: 'display:flex;gap:10px;justify-content:flex-end;padding:14px 0' },
    el('button', { onclick: () => (location.hash = '#/') }, 'Back'),
    el('button', { class: 'primary', onclick: () => { startChamp() } }, 'Start'),
  )
  inner.appendChild(actions)

  function startChamp() {
    if (teamCount < 4 || races < 1) return
    const champ = createChampionship(
      mode,
      mode === 'career' ? `${teamName || 'My'} Career` : 'Fast Championship',
      {
        numberOfRaces: Math.min(races, 20),
        managementPhaseSeconds: mgmtSeconds,
        weatherEnabled: weather,
        equalTeams,
        ...(mode === 'career' ? { careerKind, eraYear } : {}),
      },
      {
        playerTeamIndex: -1,
        teamCount,
        createTeamName: teamName.trim() || undefined,
        seed: (Date.now() & 0x7fffffff) >>> 0,
      },
    )
    if (!teamName.trim() && champ.playerTeamId === undefined) {
      champ.teams[0].isPlayerControlled = true
      champ.playerTeamId = champ.teams[0].id
      champ.teams[0].name = 'Your Racing Team'
      champ.teams[0].shortName = 'YOU'
    }
    if (mode === 'career') champ.name = `${champ.teams.find((t) => t.isPlayerControlled)?.name ?? 'My'} Career`
    store.setChampionship(champ)
    toast(`${mode === 'career' ? 'Career' : 'Championship'} created. Good luck.`)
    location.hash = '#/hq'
  }

  function render() {
    body.innerHTML = ''
    if (mode === 'career') {
      body.appendChild(renderCareerChoice())
      body.appendChild(renderEraStrip())
      body.appendChild(renderEraSummary(eraYear))
    }
    body.appendChild(renderCommonOptions())
  }

  function renderCareerChoice(): HTMLElement {
    const block = el('div', { class: 'career-choice' })
    const real = el('button', { class: 'career-card' })
    real.appendChild(el('div', { class: 'career-eyebrow' }, 'HISTORICAL SHADOW'))
    real.appendChild(el('div', { class: 'career-name' }, 'REAL CAREER'))
    real.appendChild(el('div', { class: 'career-deck' },
      'Familiar shadow-history timeline. Eras follow real-world trends, regulations move with the calendar, and your decisions rewrite history within those constraints.'))
    real.appendChild(el('div', { class: 'career-features' },
      el('div', { class: 'feature' }, el('span', { class: 'dot' }), 'Era-faithful regulation shifts'),
      el('div', { class: 'feature' }, el('span', { class: 'dot' }), 'Familiar team order rules'),
      el('div', { class: 'feature' }, el('span', { class: 'dot' }), 'Historical regulation calendar'),
    ))
    real.addEventListener('click', () => { careerKind = 'real'; render() })
    if (careerKind === 'real') real.style.borderColor = 'var(--accent)'
    block.appendChild(real)

    const fictional = el('button', { class: 'career-card' })
    fictional.appendChild(el('div', { class: 'career-eyebrow' }, 'EMERGENT HISTORY'))
    fictional.appendChild(el('div', { class: 'career-name' }, 'FICTIONAL CAREER'))
    fictional.appendChild(el('div', { class: 'career-deck' },
      'Same starting era. Future evolves dynamically. Regulation shifts, rival retirements and sponsor turnover are simulated from your choices and outcomes.'))
    fictional.appendChild(el('div', { class: 'career-features' },
      el('div', { class: 'feature' }, el('span', { class: 'dot' }), 'Dynamic era evolution'),
      el('div', { class: 'feature' }, el('span', { class: 'dot' }), 'Branching regulation calendar'),
      el('div', { class: 'feature' }, el('span', { class: 'dot' }), 'Player-driven future'),
    ))
    fictional.addEventListener('click', () => { careerKind = 'fictional'; render() })
    if (careerKind === 'fictional') fictional.style.borderColor = 'var(--accent)'
    block.appendChild(fictional)
    return block
  }

  function renderEraStrip(): HTMLElement {
    const block = el('div', { class: 'panel' })
    block.appendChild(el('div', { class: 'panel-head' },
      el('h3', {}, 'STARTING ERA')))
    const body = el('div', { class: 'panel-body' })
    const strip = el('div', { class: 'era-strip' })
    for (const e of START_YEARS) {
      const era = el('div', { class: 'era' + (eraYear === e.year ? ' selected' : '') })
      era.appendChild(el('div', { class: 'year' }, String(e.year)))
      era.appendChild(el('div', { class: 'name' }, e.eraName))
      era.addEventListener('click', () => { eraYear = e.year; render() })
      strip.appendChild(era)
    }
    body.appendChild(strip)
    block.appendChild(body)
    return block
  }

  function renderEraSummary(year: number): HTMLElement {
    const regs = regulationsForYear(year)
    const block = el('div', { class: 'panel' })
    block.appendChild(el('div', { class: 'panel-head' },
      el('h3', {}, `ERA RULES · ${regs.eraName} (${regs.year})`)))
    const body = el('div', { class: 'panel-body' })
    const grid = el('div', { class: 'kv-grid' })
    grid.appendChild(rulesTile(iconFlag(14), 'Team orders', regs.teamOrders.toUpperCase()))
    grid.appendChild(rulesTile(iconLayers(14), 'Position swaps', regs.positionSwapOrders.toUpperCase()))
    grid.appendChild(rulesTile(iconCheckered(14), 'Qualifying', regs.qualifyingFormat))
    grid.appendChild(rulesTile(iconWrench(14), 'Refuelling', regs.refuelling ? 'ALLOWED' : 'BANNED'))
    grid.appendChild(rulesTile(iconCar(14), 'Compounds', String(regs.tyreCompoundCount)))
    grid.appendChild(rulesTile(iconTrophy(14), 'Points 1/2/3', `${regs.pointsSystem[0]}/${regs.pointsSystem[1]}/${regs.pointsSystem[2]}`))
    grid.appendChild(rulesTile(iconCpu(14), 'Cost cap', regs.costCap ? 'YES' : 'NO'))
    grid.appendChild(rulesTile(iconCloud(14), 'Safety car', regs.safetyCarRules === 'vscOnly' ? 'VSC ONLY' : 'STANDARD'))
    body.appendChild(grid)
    block.appendChild(body)
    return block
  }

  function renderCommonOptions(): HTMLElement {
    const block = el('div', { class: 'panel' })
    block.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'CHAMPIONSHIP')))
    const body = el('div', { class: 'panel-body' })

    // Team name
    const nameWrap = el('div', { class: 'slider-row' })
    nameWrap.appendChild(el('span', { class: 'slabel' }, 'Your team name (optional)'))
    const nameInp = el('input', { type: 'text', placeholder: 'e.g. Falcon Apex Racing' }) as HTMLInputElement
    nameInp.value = teamName
    nameInp.addEventListener('input', () => (teamName = nameInp.value))
    nameWrap.appendChild(nameInp)
    body.appendChild(nameWrap)

    // Number of teams
    body.appendChild(rangeRow('Number of teams', 4, 11, teamCount, (v) => (teamCount = v)))
    body.appendChild(rangeRow('Races in season', 2, 16, races, (v) => (races = v)))
    body.appendChild(rangeRow(mode === 'career' ? 'Management time per round (s)' : 'Management phase length (s)', 30, 900, mgmtSeconds, (v) => (mgmtSeconds = v)))
    body.appendChild(toggleRow('Weather', weather, (v) => (weather = v)))
    body.appendChild(toggleRow('Equal performance teams', equalTeams, (v) => (equalTeams = v)))
    block.appendChild(body)
    return block
  }

  function rulesTile(icon: string, k: string, v: string): HTMLElement {
    return el('div', { class: 'kv' },
      el('div', { class: 'k', style: 'display:flex;align-items:center;gap:6px' },
        el('span', { style: 'display:inline-flex;color:var(--accent-2)' }, icon),
        k,
      ),
      el('div', { class: 'v' }, v),
    )
  }

  render()
  page.appendChild(inner)
  root.appendChild(page)
}

function rangeRow(label: string, min: number, max: number, value: number, onChange: (v: number) => void, unit = ''): HTMLElement {
  const box = el('div', { class: 'slider-row' })
  box.appendChild(el('span', { class: 'slabel' }, label))
  const inp = el('input', { type: 'range', min, max, value }) as HTMLInputElement
  const val = el('span', { class: 'sval mono' }, `${value}${unit}`)
  inp.addEventListener('input', () => { val.textContent = `${inp.value}${unit}`; onChange(Number(inp.value)) })
  box.append(inp, val)
  return box
}

function toggleRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const group = el('div', { class: 'seg-group' })
  group.style.display = 'grid'
  group.style.gridTemplateColumns = '130px 1fr 1fr'
  group.style.alignItems = 'center'
  const lbl = el('span', { style: 'color:var(--text-1);font-size:12px;padding-right:6px' }, label)
  const onBtn = el('button', { class: value ? 'selected' : '', onclick: () => { onChange(true); rerender() } }, 'On')
  const offBtn = el('button', { class: !value ? 'selected' : '', onclick: () => { onChange(false); rerender() } }, 'Off')
  function rerender() {
    onBtn.className = value ? 'selected' : ''
    offBtn.className = !value ? 'selected' : ''
  }
  group.append(lbl, onBtn, offBtn)
  return group
}
