import { el, money, toast } from './dom'
import { store } from '../state/store'
import { startFacilityUpgrade } from '../championship/engine'
import { iconFactory, iconCpu, iconWrench, iconUsers, iconBolt, iconLayers, iconCar, iconTarget } from './icons'
import { renderKpiTile, renderEmptyState } from './renderers'

/**
 * Facilities screen — P1 redesign.
 *
 * 8 facilities split into Engineering and Operations groups. Each
 * facility card has a level-pip bar, an effect summary and an
 * upgrade button. Currently all are owned; the P1 pass lays out
 * the campus map. Upgrades are wired to startFacilityUpgrade.
 */
interface FacilityDef { id: keyof import('../core/types').Team['facilities']; name: string; group: 'ENGINEERING' | 'OPERATIONS'; icon: (s: number) => string; desc: string; effect: string }

const FACILITIES: FacilityDef[] = [
  { id: 'designCentre', name: 'Design Centre', group: 'ENGINEERING', icon: iconCpu, desc: 'Design HQ, raises development quality', effect: 'Shorter development cycles' },
  { id: 'windTunnel', name: 'Wind Tunnel', group: 'ENGINEERING', icon: iconLayers, desc: 'Aerodynamic validation', effect: 'High-speed aero confidence' },
  { id: 'cfd', name: 'CFD Cluster', group: 'ENGINEERING', icon: iconCpu, desc: 'Computational fluid dynamics', effect: 'Floor + cooling development' },
  { id: 'factory', name: 'Factory', group: 'ENGINEERING', icon: iconFactory, desc: 'Parts production capacity', effect: 'Build cost reduction' },
  { id: 'simulator', name: 'Simulator', group: 'ENGINEERING', icon: iconTarget, desc: 'Driver-in-loop simulator', effect: 'Driver confidence at new tracks' },
  { id: 'driverDevelopment', name: 'Driver Development Centre', group: 'OPERATIONS', icon: iconUsers, desc: 'Driver gym, media, coaching', effect: 'Driver rating growth over time' },
  { id: 'scoutingNetwork', name: 'Scouting Network', group: 'OPERATIONS', icon: iconCar, desc: 'Free agent intelligence', effect: 'Better market options' },
  { id: 'pitOperationsCentre', name: 'Pit Operations Centre', group: 'OPERATIONS', icon: iconWrench, desc: 'Pit crew training, stop quality', effect: 'Faster, more reliable pit stops' },
]

export function renderFacilities(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  const team = store.playerTeam!
  inner.appendChild(el('h1', {}, 'Facilities'))

  // Top KPI strip
  const totalLevel = FACILITIES.reduce((s, f) => s + (team.facilities[f.id] ?? 0), 0)
  const avgLevel = (totalLevel / FACILITIES.length).toFixed(1)
  const kpis = el('div', { class: 'mini-tiles' })
  kpis.appendChild(renderKpiTile('Total facilities', String(FACILITIES.length), `${totalLevel} levels`))
  kpis.appendChild(renderKpiTile('Average level', avgLevel, 'out of 5'))
  kpis.appendChild(renderKpiTile('Engineering', String(FACILITIES.filter((f) => f.group === 'ENGINEERING').length), 'development'))
  kpis.appendChild(renderKpiTile('Operations', String(FACILITIES.filter((f) => f.group === 'OPERATIONS').length), 'team'))
  inner.appendChild(kpis)

  for (const group of ['ENGINEERING', 'OPERATIONS'] as const) {
    const list = FACILITIES.filter((f) => f.group === group)
    const panel = el('div', { class: 'panel' })
    panel.appendChild(el('div', { class: 'panel-head' },
      el('h3', {}, `${group} · ${list.length} facilities`)))
    const body = el('div', { class: 'panel-body' })
    const grid = el('div', { class: 'facility-grid' })
    for (const f of list) grid.appendChild(renderFacilityCard(f, team))
    body.appendChild(grid)
    panel.appendChild(body)
    inner.appendChild(panel)
  }

  if (FACILITIES.length === 0) {
    inner.appendChild(renderEmptyState({ title: 'No facilities available.', sub: 'Facilities unlock with championship progression.' }))
  }

  page.appendChild(inner)
  root.appendChild(page)
}

function renderFacilityCard(f: FacilityDef, team: import('../core/types').Team): HTMLElement {
  const level = team.facilities[f.id] ?? 0
  const cost = 2200 * Math.pow(1.75, level)
  const card = el('div', { class: 'facility' })
  const head = el('div', { class: 'head' })
  const icon = el('div', { class: 'facility-icon' })
  icon.innerHTML = f.icon(20)
  head.appendChild(icon)
  const headInfo = el('div', { style: 'display:flex;flex-direction:column;gap:2px' })
  headInfo.appendChild(el('div', { class: 'name' }, f.name))
  headInfo.appendChild(el('div', { class: 'kicker' }, f.group))
  head.appendChild(headInfo)
  card.appendChild(head)

  // Level pips
  const pips = el('div', { class: 'level-pips' })
  for (let i = 0; i < 5; i++) {
    pips.appendChild(el('div', { class: i < level ? 'pip on' : 'pip' }))
  }
  card.appendChild(pips)

  card.appendChild(el('div', { class: 'desc' }, f.desc))
  card.appendChild(el('div', { class: 'kicker', style: 'color:var(--accent-2)' }, f.effect))

  card.appendChild(el('button', {
    class: 'small primary',
    disabled: level >= 5 || team.money < cost,
    onclick: () => {
      const ok = startFacilityUpgrade(team, f.id, level)
      toast(ok ? `${f.name} upgrade started.` : 'Cannot afford upgrade.', !ok)
      if (ok) renderFacilities(document.getElementById('app')!.querySelector('.page') as HTMLElement)
    },
  }, level >= 5 ? 'Max level' : `Upgrade · ${money(cost)}`))

  return card
}

void iconFactory; void iconCpu; void iconWrench; void iconUsers; void iconBolt; void iconLayers; void iconCar; void iconTarget
