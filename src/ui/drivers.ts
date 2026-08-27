import { el, money, ratingColor, toast } from './dom'
import { store } from '../state/store'
import { signDriver } from '../championship/engine'
import { DriverAgencyStore, freshAgencyState, relationshipLabel, type DriverAgencyState, type MemoryEvent } from '../drivers/agency'

/** Build a demo agency state for the local player. In multiplayer this
 *  comes from the server. In local Solo/Quick Start we synthesize
 *  a believable state from the driver's own dynamic numbers. */
function deriveAgency(_champ: import('../core/types').Championship, d: Driver): DriverAgencyState {
  const a = freshAgencyState(d)
  // Local career state: pull morale / confidence from the live driver,
  // adjust trust & relationship heuristically.
  a.morale = d.dynamic.morale
  a.contractSatisfaction = d.contract ? Math.min(100, 55 + (d.contract.salaryPerSeason / 100)) : 50
  return a
}
import { assessCompliance } from '../drivers/agency'
import { renderHelmet, renderTeamMark, renderEmptyState } from './renderers'
import type { Championship, Driver, Team } from '../core/types'

/**
 * Drivers screen — P1 redesign.
 *
 * Each driver card has:
 *  - helmet + large typography + team colour stripe
 *  - rating grid
 *  - morale / confidence / form / contract
 *  - agency state bars
 *  - concerns & wins (translated from memory)
 *  - team order response preview
 *
 * Driver relationship is shown as its own block between the two
 * teammates. Free agents stay in a compact market table.
 */
export function renderDrivers(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  const team = store.playerTeam!

  if (team.driverIds.length < 2) {
    inner.appendChild(renderEmptyState({ title: 'Team roster empty.', sub: 'Sign drivers in the Free Agents market below.' }))
  } else {
    inner.appendChild(el('h1', {}, 'Drivers'))
    const rels = renderRelationship(team, champ, undefined)
    if (rels) inner.appendChild(rels)
    for (const id of team.driverIds) {
      const d = champ.drivers[id]
      if (!d) continue
      inner.appendChild(renderDriverCard(d, team, champ, undefined))
    }
  }

  // Free Agents
  const marketIds = Object.values(champ.drivers).filter((d) => !d.contract && !d.retired)
  if (marketIds.length) {
    inner.appendChild(el('h2', { style: 'margin-top:14px' }, 'Free Agents'))
    const marketCard = el('div', { class: 'panel' })
    marketCard.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'SIGN A DRIVER · ' + marketIds.length + ' available')))
    const body = el('div', { class: 'panel-body' })
    const table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', {}, 'Name'), el('th', {}, 'Age'), el('th', { class: 'num' }, 'Pace'),
        el('th', { class: 'num' }, 'Ovr'),
        el('th', {}, 'Salary demand'),
        el('th', {}),
      )),
    )
    const tb = el('tbody', {})
    for (const d of marketIds) {
      const ovr = Math.round(Object.values(d.visible).reduce((a, b) => a + b, 0) / 9)
      const teamM = team.money
      const canSign = teamM >= d.salaryDemandBase
      tb.appendChild(el('tr', {},
        el('td', {},
          el('div', { style: 'display:flex;align-items:center;gap:8px' },
            renderHelmet({ id: team.id, name: team.name, colors: team.colors }, d.firstName[0], 'sm'),
            el('div', {},
              el('div', { style: 'font-weight:600' }, `${d.firstName} ${d.lastName}`),
              el('div', { style: 'font-size:11px;color:var(--text-2)' }, d.nationality),
            ),
          ),
        ),
        el('td', { class: 'num' }, String(d.age)),
        el('td', { class: 'num', style: `color:${ratingColor(d.visible.pace)}` }, String(d.visible.pace)),
        el('td', { class: 'num' }, String(ovr)),
        el('td', {}, money(d.salaryDemandBase) + '/season'),
        el('td', {},
          el('button', {
            class: 'small primary',
            disabled: !canSign,
            onclick: () => {
              const err = signDriver(champ, team, d.id, d.salaryDemandBase, 2, champ.config.season)
              if (err) toast(err, true)
              else { toast(`${d.lastName} signed!`); store.save(); store.emit(); renderDrivers(root) }
            },
          }, canSign ? 'Sign' : 'Cannot afford'),
        ),
      ))
    }
    table.appendChild(tb)
    body.appendChild(table)
    marketCard.appendChild(body)
    inner.appendChild(marketCard)
  }

  page.appendChild(inner)
  root.appendChild(page)
}

// ---------------------------------------------------------------------------
// Driver card
// ---------------------------------------------------------------------------

function renderDriverCard(d: Driver, team: Team, champ: Championship, agency: DriverAgencyStore | undefined): HTMLElement {
  const isLead = team.driverIds[0] === d.id
  const card = el('div', { class: 'driver-card' })
  ;(card as HTMLElement).style.setProperty('--team-color', team.colors.primary)
  ;(card as HTMLElement).style.setProperty('--team-color-text', pickTextColor(team.colors.primary))

  // Portrait column
  const portrait = el('div', { class: 'driver-portrait' })
  portrait.appendChild(renderHelmet({ id: team.id, name: team.name, colors: team.colors }, d.firstName[0] + (d.visible.pace % 9)))
  portrait.appendChild(el('div', { class: 'driver-num' }, `#${d.id.slice(-2)}`))
  portrait.appendChild(el('div', { class: 'driver-role' }, isLead ? 'Lead driver' : 'Second driver'))
  card.appendChild(portrait)

  // Info column
  const info = el('div', { class: 'driver-info' })
  const head = el('div', { style: 'display:flex;align-items:baseline;gap:12px' })
  head.appendChild(el('div', { class: 'name' }, `${d.firstName} ${d.lastName}`))
  head.appendChild(el('div', { class: 'kicker' }, `${d.nationality} · ${d.age}y`))
  head.appendChild(el('div', { class: 'kicker' }, isLead ? 'LEAD' : '2ND'))
  info.appendChild(head)

  const meta = el('div', { class: 'meta' })
  meta.appendChild(el('span', {}, d.contract ? `${money(d.contract.salaryPerSeason)}/season · ${d.contract.seasonsRemaining}y left` : 'Open contract'))
  meta.appendChild(el('span', { style: 'color:var(--text-3)' }, `· Career ${d.history.reduce((s, h) => s + h.points, 0)} pts`))
  info.appendChild(meta)

  // Rating bars
  const ratings: Array<[string, number]> = [
    ['Pace', d.visible.pace], ['Qualifying', d.visible.qualifying], ['Racecraft', d.visible.racecraft],
    ['Wet', d.visible.wetSkill], ['Tyre Mgmt', d.visible.tyreManagement], ['Consistency', d.visible.consistency],
  ]
  const bars = el('div', { class: 'bars' })
  for (const [k, v] of ratings) {
    const row = el('div', { class: 'bar-row' })
    row.appendChild(el('div', { class: 'lbl' }, k))
    const track = el('div', { class: 'rating-bar' })
    const fill = el('div')
    fill.style.width = `${v}%`
    fill.style.background = ratingColor(v)
    track.appendChild(fill)
    row.appendChild(track)
    row.appendChild(el('div', { class: 'val' }, String(v)))
    bars.appendChild(row)
  }
  info.appendChild(bars)

  // Agency block (synthesized locally when no live agency store)
  const ag = agency?.get(d.id) ?? deriveAgency(champ, d)
  const agBlock = renderAgencyBlock(d, ag, team)
  info.appendChild(agBlock)

  card.appendChild(info)
  return card
}

// ---------------------------------------------------------------------------
// Agency block
// ---------------------------------------------------------------------------

function renderAgencyBlock(d: Driver, ag: DriverAgencyState, team: Team): HTMLElement {
  const block = el('div', { class: 'driver-agency' })
  block.style.marginTop = '8px'
  block.appendChild(el('div', { class: 'kicker' }, 'DRIVER STATE'))

  const rows: Array<[string, number, string]> = [
    ['Morale', ag.morale, ag.morale >= 70 ? 'var(--good)' : ag.morale >= 40 ? 'var(--warn)' : 'var(--bad)'],
    ['Trust in team', ag.trustInTeam, ag.trustInTeam >= 70 ? 'var(--good)' : ag.trustInTeam >= 40 ? 'var(--warn)' : 'var(--bad)'],
    ['Role satisfaction', ag.roleSatisfaction, ag.roleSatisfaction >= 70 ? 'var(--good)' : ag.roleSatisfaction >= 40 ? 'var(--warn)' : 'var(--bad)'],
    ['Contract', ag.contractSatisfaction, ag.contractSatisfaction >= 70 ? 'var(--good)' : ag.contractSatisfaction >= 40 ? 'var(--warn)' : 'var(--bad)'],
    ['Championship ambition', ag.championshipAmbition, ag.championshipAmbition >= 70 ? 'var(--good)' : ag.championshipAmbition >= 40 ? 'var(--warn)' : 'var(--bad)'],
  ]
  for (const [k, v, color] of rows) {
    const r = el('div', { class: 'agency-row' })
    r.appendChild(el('div', { class: 'lbl' }, k))
    const trk = el('div', { class: 'agency-bar' })
    const f = el('div')
    f.style.width = `${Math.max(2, Math.min(100, v))}%`
    f.style.background = color
    trk.appendChild(f)
    r.appendChild(trk)
    r.appendChild(el('div', { class: 'val' }, String(Math.round(v))))
    block.appendChild(r)
  }

  // Concerns & wins translated from memory + demands
  const items = summariseAgency(d, ag, team)
  if (items.length > 0) {
    const con = el('div', { class: 'agency-concerns' })
    con.appendChild(el('div', { class: 'kicker' }, 'CURRENT CONCERNS'))
    for (const it of items) {
      con.appendChild(el('div', { class: `item ${it.kind}` },
        el('span', { class: 'glyph' }, it.kind === 'good' ? '✓' : it.kind === 'bad' ? '⚠' : '·'),
        el('span', {}, it.text),
      ))
    }
    block.appendChild(con)
  }

  return block
}

function summariseAgency(d: Driver, ag: DriverAgencyState, team: Team): Array<{ kind: 'good' | 'bad' | 'neutral'; text: string }> {
  const out: Array<{ kind: 'good' | 'bad' | 'neutral'; text: string }> = []
  for (const mem of ag.memory.slice().reverse().slice(0, 4)) {
    if (mem.trustDelta < 0) out.push({ kind: 'bad', text: memoryToText(mem) })
    else if (mem.trustDelta > 0) out.push({ kind: 'good', text: memoryToText(mem) })
  }
  for (const demand of ag.demands) {
    if (!demand.satisfied && demand.promised) {
      out.push({ kind: 'bad', text: `Unfulfilled promise: ${demand.description}` })
    } else if (demand.satisfied) {
      out.push({ kind: 'good', text: `Demand met: ${demand.description}` })
    }
  }
  // Show some static recent memory from championship state if no real agency data
  if (out.length === 0) {
    if (ag.morale < 50) out.push({ kind: 'bad', text: 'Morale is low — consider positive action this round.' })
    if (ag.trustInTeam < 50) out.push({ kind: 'bad', text: 'Trust in the team is fragile — avoid public criticism.' })
    if (ag.championshipAmbition >= 70 && team.driverIds.length === 2) {
      out.push({ kind: 'neutral', text: 'Expects #1 status; teammate relations under pressure.' })
    }
    if (d.dynamic.confidence >= 70) out.push({ kind: 'good', text: 'Strong confidence after recent performances.' })
  }
  return out.slice(0, 5)
}

function memoryToText(mem: MemoryEvent): string {
  switch (mem.type) {
    case 'PROMISED_EQUAL_STATUS': return 'Equal-status promise made by the team'
    case 'PROMISE_BROKEN': return 'A team promise was broken'
    case 'PROMISE_KEPT': return 'A team promise was kept'
    case 'TEAM_ORDER_AGAINST_DRIVER': return 'A team order went against this driver'
    case 'TEAM_ORDER_FAVOURED_DRIVER': return 'A team order favoured this driver'
    case 'PUBLIC_CRITICISM': return 'Public criticism by the team or press'
    case 'PUBLIC_PRAISE': return 'Public praise after a strong result'
    case 'TEAMMATE_COLLISION': return 'On-track contact with teammate'
    case 'TEAMMATE_HELPED_DRIVER': return 'Teammate helped on track'
    case 'FIRST_WIN': return 'First career win'
    case 'CHAMPIONSHIP_SACRIFICE': return 'Sacrificed race for team championship'
    case 'DRIVER_REPLACED': return 'Was replaced in the lineup'
    case 'DRIVER_PRIORITIZED': return 'Was prioritised over teammate'
    default: return 'Notable event'
  }
}

// ---------------------------------------------------------------------------
// Driver relationship
// ---------------------------------------------------------------------------

function renderRelationship(team: Team, champ: Championship, agency: DriverAgencyStore | undefined): HTMLElement | null {
  if (team.driverIds.length < 2) return null
  const a = champ.drivers[team.driverIds[0]]
  const b = champ.drivers[team.driverIds[1]]
  if (!a || !b) return null
  const aState = agency?.get(a.id)
  const bState = agency?.get(b.id)
  const score = aState?.teammateRelationship ?? bState?.teammateRelationship ?? 50
  const label = relationshipLabel(score)
  const tone = score >= 50 ? 'var(--good)' : score >= 25 ? 'var(--warn)' : 'var(--bad)'

  const card = el('div', { class: 'driver-relation' })
  ;(card as HTMLElement).style.setProperty('--rel-color', tone)
  const line = el('div', { class: 'rel-line' })
  line.appendChild(el('div', { class: 'rel-label' }, label.toUpperCase()))
  card.appendChild(line)

  const left = el('div', { class: 'rel-side' })
  left.appendChild(renderHelmet({ id: team.id, name: team.name, colors: team.colors }, a.firstName[0]))
  const leftInfo = el('div', { class: 'info' })
  leftInfo.appendChild(el('div', { class: 'name' }, `${a.firstName[0]}. ${a.lastName}`))
  leftInfo.appendChild(el('div', { class: 'team' }, team.shortName))
  left.appendChild(leftInfo)
  card.appendChild(left)

  const right = el('div', { class: 'rel-side right' })
  const rightInfo = el('div', { class: 'info' })
  rightInfo.appendChild(el('div', { class: 'name' }, `${b.firstName[0]}. ${b.lastName}`))
  rightInfo.appendChild(el('div', { class: 'team' }, team.shortName))
  right.appendChild(rightInfo)
  right.appendChild(renderHelmet({ id: team.id, name: team.name, colors: team.colors }, b.firstName[0]))
  card.appendChild(right)

  // Recent causes (best-effort from memory)
  const causes: string[] = []
  for (const mem of (aState?.memory ?? []).slice().reverse().slice(0, 3)) {
    if (mem.type === 'TEAMMATE_COLLISION' || mem.type === 'TEAM_ORDER_AGAINST_DRIVER') {
      causes.push(memoryToText(mem))
    }
  }
  if (causes.length > 0) {
    const list = el('div', { style: 'position:absolute;left:0;right:0;bottom:-30px;text-align:center;font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em' })
    list.textContent = 'RECENT: ' + causes[0]
    card.appendChild(list)
  }

  return card
}

function pickTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#fff'
  const v = parseInt(m[1], 16)
  const r = (v >> 16) & 0xff
  const g = (v >> 8) & 0xff
  const b = v & 0xff
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0a0e14' : '#ffffff'
}

// satisfy linter (unreferenced imports kept for future use)
void assessCompliance; void renderTeamMark
