import { el, money, ratingColor } from './dom'
import { store } from '../state/store'
import { renderEmptyState } from './renderers'
import { iconBolt, iconUsers, iconWrench } from './icons'
import type { Championship, StaffMember, StaffRoleId } from '../core/types'

/**
 * Staff screen — P1 redesign.
 *
 * Group staff into TECHNICAL / RACE / SPORTING / MANAGEMENT.
 * Each member has a role icon, name, salary, contract and a
 * rating bar for the relevant skill.
 */
const ROLE_GROUPS: Record<string, { label: string; icon: (s: number) => string; skills: Array<keyof StaffMember> | 'general' }> = {
  teamPrincipal: { label: 'MANAGEMENT', icon: iconUsers, skills: 'general' },
  technicalDirector: { label: 'TECHNICAL', icon: iconWrench, skills: ['skill'] },
  headOfAero: { label: 'TECHNICAL', icon: iconWrench, skills: ['skill'] },
  chiefDesigner: { label: 'TECHNICAL', icon: iconWrench, skills: ['skill'] },
  raceEngineer: { label: 'RACE', icon: iconBolt, skills: ['skill'] },
  strategist: { label: 'RACE', icon: iconBolt, skills: ['skill'] },
  pitOperations: { label: 'RACE', icon: iconWrench, skills: ['skill'] },
}

const ROLE_DISPLAY: Record<StaffRoleId, string> = {
  teamPrincipal: 'Team Principal',
  technicalDirector: 'Technical Director',
  headOfAero: 'Head of Aerodynamics',
  chiefDesigner: 'Chief Designer',
  raceEngineer: 'Race Engineer',
  strategist: 'Head of Strategy',
  pitOperations: 'Pit Operations Chief',
}

export function renderStaff(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  const team = store.playerTeam!
  const members = team.staffIds
    .map((id) => champ.staffPool.find((x) => x.id === id))
    .filter((x): x is StaffMember => !!x)

  if (members.length === 0) {
    inner.appendChild(renderEmptyState({ title: 'No staff hired.', sub: 'Hire technical and race staff in the Staff market below.' }))
  } else {
    inner.appendChild(el('h1', {}, 'Staff'))

    // Group members
    const groups: Record<string, StaffMember[]> = {}
    for (const m of members) {
      const g = ROLE_GROUPS[m.role]?.label ?? 'OTHER'
      if (!groups[g]) groups[g] = []
      groups[g].push(m)
    }
    for (const groupName of ['TECHNICAL', 'RACE', 'SPORTING', 'MANAGEMENT']) {
      const list = groups[groupName]
      if (!list || list.length === 0) continue
      const panel = el('div', { class: 'panel' })
      panel.appendChild(el('div', { class: 'panel-head' },
        el('h3', {}, `${groupName} · ${list.length} ${list.length === 1 ? 'member' : 'members'}`),
      ))
      const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px' })
      for (const m of list) grid.appendChild(renderStaffCard(m, champ))
      const body = el('div', { class: 'panel-body' })
      body.appendChild(grid)
      panel.appendChild(body)
      inner.appendChild(panel)
    }
  }

  // Staff market — pool members not yet hired
  const marketIds = new Set(champ.staffPool.map((s) => s.id))
  const owned = new Set(team.staffIds)
  const candidates = champ.staffPool.filter((s) => marketIds.has(s.id) && !owned.has(s.id))
  if (candidates.length > 0) {
    inner.appendChild(el('h2', { style: 'margin-top:14px' }, 'Staff Market'))
    const market = el('div', { class: 'panel' })
    market.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'AVAILABLE CANDIDATES · ' + candidates.length)))
    const mbody = el('div', { class: 'panel-body' })
    const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px' })
    for (const c of candidates) grid.appendChild(renderStaffMarketCard(c))
    mbody.appendChild(grid)
    market.appendChild(mbody)
    inner.appendChild(market)
  }

  page.appendChild(inner)
  root.appendChild(page)
}

function renderStaffCard(m: StaffMember, _champ: Championship): HTMLElement {
  const card = el('div', { style: 'background:var(--bg-data-0);border:1px solid var(--line-1);border-radius:var(--radius-3);padding:14px;display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden' })
  const head = el('div', { style: 'display:flex;align-items:center;gap:10px' })
  const icon = el('div', { style: 'width:36px;height:36px;border-radius:6px;background:var(--bg-panel-1);border:1px solid var(--line-2);display:flex;align-items:center;justify-content:center;color:var(--accent)' })
  icon.innerHTML = iconBolt(20)
  head.appendChild(icon)
  const headInfo = el('div', { style: 'display:flex;flex-direction:column;flex:1;min-width:0' })
  headInfo.appendChild(el('div', { class: 'display', style: 'font-size:14px' }, m.name))
  headInfo.appendChild(el('div', { class: 'kicker' }, ROLE_DISPLAY[m.role] ?? m.role))
  head.appendChild(headInfo)
  card.appendChild(head)

  // Skill bar
  const skillRow = el('div', { style: 'display:flex;align-items:center;gap:8px' })
  const trk = el('div', { class: 'rating-bar', style: 'flex:1' })
  const fill = el('div')
  fill.style.width = `${m.skill}%`
  fill.style.background = ratingColor(m.skill)
  trk.appendChild(fill)
  skillRow.appendChild(trk)
  skillRow.appendChild(el('div', { class: 'val mono', style: 'min-width:34px;text-align:right' }, String(m.skill)))
  card.appendChild(skillRow)

  // Meta
  const meta = el('div', { style: 'display:flex;justify-content:space-between;font-size:12px;color:var(--text-2)' })
  const salary = m.contract?.salaryPerSeason ?? m.salaryDemandBase
  meta.appendChild(el('span', {}, `${money(salary)}/yr`))
  meta.appendChild(el('span', {}, m.contract ? `Contract until end of S${m.contract.signedSeason + m.contract.seasonsRemaining - 1}` : 'Open contract'))
  card.appendChild(meta)

  return card
}

function renderStaffMarketCard(m: StaffMember): HTMLElement {
  const card = el('div', { style: 'background:var(--bg-data-0);border:1px solid var(--line-1);border-radius:var(--radius-3);padding:14px;display:flex;flex-direction:column;gap:8px' })
  const head = el('div', { style: 'display:flex;align-items:center;gap:10px' })
  const icon = el('div', { style: 'width:36px;height:36px;border-radius:6px;background:var(--bg-panel-1);border:1px solid var(--line-2);display:flex;align-items:center;justify-content:center;color:var(--accent)' })
  icon.innerHTML = iconBolt(20)
  head.appendChild(icon)
  const headInfo = el('div', { style: 'display:flex;flex-direction:column;flex:1;min-width:0' })
  headInfo.appendChild(el('div', { class: 'display', style: 'font-size:14px' }, m.name))
  headInfo.appendChild(el('div', { class: 'kicker' }, ROLE_DISPLAY[m.role] ?? m.role))
  head.appendChild(headInfo)
  card.appendChild(head)

  const skillRow = el('div', { style: 'display:flex;align-items:center;gap:8px' })
  const trk = el('div', { class: 'rating-bar', style: 'flex:1' })
  const fill = el('div')
  fill.style.width = `${m.skill}%`
  fill.style.background = ratingColor(m.skill)
  trk.appendChild(fill)
  skillRow.appendChild(trk)
  skillRow.appendChild(el('div', { class: 'val mono', style: 'min-width:34px;text-align:right' }, String(m.skill)))
  card.appendChild(skillRow)

  const meta = el('div', { style: 'display:flex;justify-content:space-between;font-size:12px;color:var(--text-2)' })
  meta.appendChild(el('span', {}, `Salary demand: ${money(m.salaryDemandBase)}/yr`))
  card.appendChild(meta)
  card.appendChild(el('div', { style: 'font-size:11px;color:var(--text-3);font-style:italic' }, 'Hiring not yet implemented in P1 pass — see TODO.'))

  return card
}

void iconUsers; void iconWrench
