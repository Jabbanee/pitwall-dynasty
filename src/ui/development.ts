import { el, money, toast } from './dom'
import { store } from '../state/store'
import { startDevelopment, getProjects } from '../championship/engine'
import { iconFrontWing, iconRearWing, iconNose, iconFloor, iconSidepods, iconCooling, iconSuspension, iconBolt, iconCheckered } from './icons'
import { renderEmptyState } from './renderers'
import type { PartStatModifiers, Team } from '../core/types'

/**
 * Car Development screen — P1 redesign.
 *
 * Left: a procedural car blueprint with hotspot buttons for every
 * car module. Right: development project cards filtered by the
 * selected module, plus a "current vs next season" trade-off
 * and a regulation change banner when the era has upcoming
 * regulation shifts.
 */
const MODULES: Array<{ slot: keyof Team['parts']; name: string; icon: (s: number) => string; shortcut: string }> = [
  { slot: 'frontWing', name: 'Front Wing', icon: iconFrontWing, shortcut: 'FW' },
  { slot: 'rearWing', name: 'Rear Wing', icon: iconRearWing, shortcut: 'RW' },
  { slot: 'chassis', name: 'Nose', icon: iconNose, shortcut: 'N' },
  { slot: 'floor', name: 'Floor', icon: iconFloor, shortcut: 'F' },
  { slot: 'suspension', name: 'Suspension', icon: iconSuspension, shortcut: 'S' },
  { slot: 'cooling', name: 'Cooling', icon: iconCooling, shortcut: 'C' },
]

export function renderDevelopment(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  const team = store.playerTeam!
  inner.appendChild(el('h1', {}, 'Car Development'))

  // --- Regulation change banner (every era has a shift) ---
  const regBanner = el('div', { class: 'regulation-banner' })
  regBanner.innerHTML = `<div class="reg-icon">${iconBolt(20)}</div>
    <div>
      <div class="reg-title">2027 Technical Regulation Change</div>
      <div class="reg-sub">Affects floor, front wing, weight, component limits</div>
    </div>
    <div class="reg-readiness">
      <div class="label">Research readiness</div>
      <div class="bar"><div style="width:36%"></div></div>
      <div class="pct">36%</div>
    </div>`
  inner.appendChild(regBanner)

  // --- Two-column body ---
  const left = el('div', { style: 'display:flex;flex-direction:column;gap:16px' })
  const right = el('div', { style: 'display:flex;flex-direction:column;gap:16px' })

  // Car stage with hotspots
  const stagePanel = el('div', { class: 'panel' })
  stagePanel.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'CAR BLUEPRINT')))
  const stageBody = el('div', { class: 'panel-body' })
  const stage = el('div', { class: 'car-stage' })
  stage.innerHTML = `
    <div class="stage-label"><span class="dot"></span>${team.name.toUpperCase()} · ${(champ.config as { eraYear?: number }).eraYear ?? 2022}</div>
    <div class="stage-grid"></div>
    <svg viewBox="0 0 600 220" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${team.colors.primary}"/><stop offset="1" stop-color="${team.colors.secondary}"/>
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="120" rx="40" ry="22" fill="url(#body)" stroke="rgba(255,255,255,0.2)"/>
      <rect x="80" y="100" width="380" height="40" rx="8" fill="url(#body)" stroke="rgba(255,255,255,0.2)"/>
      <rect x="450" y="96" width="120" height="48" rx="6" fill="url(#body)" stroke="rgba(255,255,255,0.2)"/>
      <rect x="100" y="92" width="200" height="10" rx="2" fill="${team.colors.secondary}" opacity="0.8"/>
      <circle cx="120" cy="148" r="20" fill="#0a0e14" stroke="${team.colors.secondary}" stroke-width="2"/>
      <circle cx="450" cy="148" r="20" fill="#0a0e14" stroke="${team.colors.secondary}" stroke-width="2"/>
      <rect x="60" y="80" width="30" height="6" fill="${team.colors.secondary}" opacity="0.6"/>
      <rect x="480" y="80" width="60" height="14" fill="${team.colors.secondary}" opacity="0.6"/>
      ${((champ.config as { eraYear?: number }).eraYear ?? 2022) >= 2014 ? '<path d="M250 80 Q300 60 350 80" stroke="#f0c14b" stroke-width="3" fill="none"/>' : ''}
      <text x="60" y="200" font-family="JetBrains Mono,monospace" font-size="9" fill="rgba(255,255,255,0.5)">FW</text>
      <text x="540" y="200" font-family="JetBrains Mono,monospace" font-size="9" fill="rgba(255,255,255,0.5)">RW</text>
      <text x="280" y="200" font-family="JetBrains Mono,monospace" font-size="9" fill="rgba(255,255,255,0.5)">FLOOR</text>
      <text x="300" y="70" font-family="JetBrains Mono,monospace" font-size="8" fill="rgba(255,255,255,0.5)">NOSE</text>
    </svg>
  `
  // Add hotspots
  const hotspots: Array<{ left: number; top: number; mod: typeof MODULES[number] }> = [
    { left: 60, top: 90, mod: MODULES[0] },
    { left: 540, top: 90, mod: MODULES[1] },
    { left: 300, top: 70, mod: MODULES[2] },
    { left: 320, top: 130, mod: MODULES[3] },
    { left: 200, top: 150, mod: MODULES[4] },
    { left: 480, top: 50, mod: MODULES[5] },
  ]
  let activeSlot: string | null = null
  for (const h of hotspots) {
    const dot = el('button', { class: 'hotspot' })
    ;(dot as HTMLElement).style.left = `${h.left}px`
    ;(dot as HTMLElement).style.top = `${h.top}px`
    dot.innerHTML = `<span class="pulse-dot"></span><span class="pulse-label">${h.mod.shortcut}</span>`
    dot.title = h.mod.name
    dot.addEventListener('click', () => {
      activeSlot = h.mod.slot as string
      for (const hs of stage.querySelectorAll('.hotspot')) hs.classList.remove('active')
      dot.classList.add('active')
      renderProjects()
    })
    stage.appendChild(dot)
  }
  stageBody.appendChild(stage)
  stagePanel.appendChild(stageBody)
  left.appendChild(stagePanel)

  // --- Season tradeoff block ---
  const tradeoffPanel = el('div', { class: 'panel' })
  tradeoffPanel.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'CURRENT vs NEXT SEASON')))
  const tradeoffBody = el('div', { class: 'panel-body' })
  const tradeoff = el('div', { class: 'season-tradeoff' })
  const left2 = el('div', { class: 'tradeoff-side' })
  left2.appendChild(el('div', { class: 'kicker' }, 'CURRENT CAR · ' + ((champ.config as { eraYear?: number }).eraYear ?? 2022)))
  left2.appendChild(el('div', { style: 'font-size:13px;color:var(--text-1)' },
    'Reliability ' + team.carPerformance.reliability + ' · Cooling ' + team.carPerformance.cooling + ' · Braking ' + team.carPerformance.braking))
  left2.appendChild(el('div', { style: 'font-size:12px;color:var(--text-3);margin-top:4px' }, 'Win in the now, but the regulation shift will hurt you next year.'))
  tradeoff.appendChild(left2)
  const arrow = el('div', { class: 'arrow' }, '→')
  tradeoff.appendChild(arrow)
  const right2 = el('div', { class: 'tradeoff-side' })
  right2.appendChild(el('div', { class: 'kicker' }, 'NEXT-SEASON RESEARCH'))
  right2.appendChild(el('div', { style: 'font-size:13px;color:var(--text-1)' }, '36% ready · 4 of 6 modules researched'))
  right2.appendChild(el('div', { style: 'font-size:12px;color:var(--text-3);margin-top:4px' }, 'Lose a little pace now, gain eligibility for the new aero cap.'))
  tradeoff.appendChild(right2)
  tradeoffBody.appendChild(tradeoff)
  tradeoffPanel.appendChild(tradeoffBody)
  left.appendChild(tradeoffPanel)

  // --- Projects right column ---
  const projectsPanel = el('div', { class: 'panel' })
  projectsPanel.appendChild(el('div', { class: 'panel-head' },
    el('h3', {}, 'DEVELOPMENT PROJECTS')))
  const projectsBody = el('div', { class: 'panel-body' })
  projectsPanel.appendChild(projectsBody)
  right.appendChild(projectsPanel)

  function renderProjects() {
    projectsBody.innerHTML = ''
    const projects = getProjects(team)
    if (projects.length === 0) {
      projectsBody.appendChild(renderEmptyState({ title: 'No active projects.', sub: 'Start a new design to begin research.' }))
    }
    for (const p of projects) {
      const mods = p.modifiers as PartStatModifiers
      const cards: Array<{ name: string; val: number }> = []
      for (const [k, v] of Object.entries(mods)) {
        if (typeof v === 'number') cards.push({ name: prettyModName(k), val: v })
      }
      const project = el('div', { class: 'car-project' })
      const info = el('div', { class: 'info' })
      info.appendChild(el('div', { class: 'name' }, prettyProjectName(p.slot as string)))
      const stats = el('div', { class: 'stats' })
      for (const c of cards.slice(0, 4)) {
        const cls = c.val > 0 ? 'pos' : c.val < 0 ? 'neg' : ''
        stats.appendChild(el('div', { class: 'stat-line' },
          el('span', { class: 'label' }, c.name),
          el('span', { class: `val ${cls}` }, (c.val > 0 ? '+' : '') + c.val.toFixed(1)),
        ))
      }
      info.appendChild(stats)
      const meta = el('div', { style: 'display:flex;gap:14px;margin-top:4px;font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.06em' })
      meta.appendChild(el('span', {}, `Cost ${money(p.costTotal)}`))
      meta.appendChild(el('span', {}, `${p.weeksRemaining} of ${p.weeksTotal} weeks`))
      meta.appendChild(el('span', {}, 'Risk MEDIUM'))
      info.appendChild(meta)
      project.appendChild(info)
      project.appendChild(el('div', { style: 'align-self:start' },
        el('span', { class: 'pill live' }, 'IN PROGRESS'),
      ))
      projectsBody.appendChild(project)
    }
    // New project tiles
    const slotOptions = activeSlot
      ? MODULES.filter((m) => m.slot === activeSlot)
      : MODULES
    for (const m of slotOptions) {
      const newProject = el('div', { class: 'car-project', style: 'opacity:0.85' })
      const info = el('div', { class: 'info' })
      info.appendChild(el('div', { class: 'name', style: 'display:flex;align-items:center;gap:6px' },
        el('span', { style: 'width:20px;height:20px;color:var(--accent)' }, ...[] as never[]),
        `${prettyProjectName(m.slot)} UPGRADE`,
      ))
      info.appendChild(el('div', { class: 'stats' },
        el('div', { class: 'stat-line' },
          el('span', { class: 'label' }, 'Cost'),
          el('span', { class: 'val' }, money(1800)),
        ),
        el('div', { class: 'stat-line' },
          el('span', { class: 'label' }, 'Time'),
          el('span', { class: 'val' }, '4-6 weeks'),
        ),
      ))
      newProject.appendChild(info)
      newProject.appendChild(el('button', {
        class: 'small primary',
        onclick: () => {
          const mods = proposeModifiersForSlot(m.slot as string, team.carPerformance)
          const proj = startDevelopment(team, m.slot, mods)
          if (!proj) { toast('Not enough budget for this project.', true); return }
          const list = getProjects(team)
          list.push(proj)
          toast(`${proj.name} design started.`)
          renderProjects()
        },
      }, 'Start project'))
      projectsBody.appendChild(newProject)
    }
  }
  renderProjects()

  inner.appendChild(el('div', { class: 'grid cols-2' }, left, right))
  page.appendChild(inner)
  root.appendChild(page)
}

function prettyModName(k: string): string {
  const map: Record<string, string> = {
    lowSpeedAero: 'Low spd aero',
    mediumSpeedAero: 'Med spd aero',
    highSpeedAero: 'High spd aero',
    drag: 'Drag',
    straightLineSpeed: 'Top speed',
    braking: 'Braking',
    traction: 'Traction',
    tyreWear: 'Tyre wear',
    cooling: 'Cooling',
    reliability: 'Reliability',
  }
  return map[k] ?? k
}

function prettyProjectName(slot: string): string {
  const m: Record<string, string> = {
    frontWing: 'Major Front Wing Package',
    rearWing: 'Major Rear Wing Package',
    chassis: 'Nose + Chassis Package',
    floor: 'Major Floor Package',
    suspension: 'Suspension Geometry',
    cooling: 'Cooling System Upgrade',
  }
  return m[slot] ?? slot
}

function proposeModifiersForSlot(slot: string, perf: Team['carPerformance']): PartStatModifiers {
  const gain = 3 + Math.random() * 3
  switch (slot) {
    case 'frontWing':
      return { lowSpeedAero: +gain.toFixed(1) as unknown as number, mediumSpeedAero: +(gain * 0.7).toFixed(1) as unknown as number, drag: +(gain * 0.5).toFixed(1) as unknown as number }
    case 'rearWing':
      return { highSpeedAero: +gain.toFixed(1) as unknown as number, mediumSpeedAero: +(gain * 0.6).toFixed(1) as unknown as number, drag: +(gain * 0.8).toFixed(1) as unknown as number, straightLineSpeed: -(gain).toFixed(1) as unknown as number }
    case 'floor':
      return { lowSpeedAero: +(gain * 0.6).toFixed(1) as unknown as number, mediumSpeedAero: +(gain * 0.9).toFixed(1) as unknown as number, traction: +(gain * 0.5).toFixed(1) as unknown as number }
    case 'chassis':
      return { lowSpeedAero: +(gain * 0.4).toFixed(1) as unknown as number, highSpeedAero: +(gain * 0.4).toFixed(1) as unknown as number, reliability: +(gain * 0.6).toFixed(1) as unknown as number }
    case 'suspension':
      return { traction: +gain.toFixed(1) as unknown as number, braking: +(gain * 0.7).toFixed(1) as unknown as number, tyreWear: +(gain * 0.3).toFixed(1) as unknown as number }
    case 'cooling':
      return { cooling: +gain.toFixed(1) as unknown as number, reliability: +(gain * 0.5).toFixed(1) as unknown as number, drag: -(gain * 0.3).toFixed(1) as unknown as number }
    default:
      return perf ? { mediumSpeedAero: gain } : {}
  }
}

void iconFrontWing; void iconRearWing; void iconNose; void iconFloor; void iconSidepods; void iconSuspension; void iconCooling; void iconCheckered
