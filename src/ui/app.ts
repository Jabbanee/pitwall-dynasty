import './styles.css'
import { el, money, toast } from './dom'
import { store } from '../state/store'
import { renderMenu } from './menu'
import { renderNewChampionship } from './new-championship'
import { renderHQ, renderStandings, renderDrivers, renderStaff } from './hq'
import { renderWeekend } from './weekend'
import { renderBroadcast } from './broadcast'
import { renderBroadcast3D } from './three/broadcast3d'
import { renderResults } from './results'
import { renderPaddockPost } from './paddock-post'
import { renderDevTools } from './devtools'
import { renderLobby } from './lobby'
import { startDevelopment, startFacilityUpgrade } from '../championship/engine'
import { SPONSORS } from '../core/content'
import type { Team, DevelopmentProject, CarPerformance, PartStatModifiers } from '../core/types'

const app = document.getElementById('app')!

const NAV_ITEMS: Array<{ hash: string; label: string }> = [
  { hash: '#/hq', label: 'Team HQ' },
  { hash: '#/weekend', label: 'Race Weekend' },
  { hash: '#/standings', label: 'Standings' },
  { hash: '#/drivers', label: 'Drivers' },
  { hash: '#/staff', label: 'Staff' },
  { hash: '#/development', label: 'Development' },
  { hash: '#/facilities', label: 'Facilities' },
  { hash: '#/finances', label: 'Finances' },
  { hash: '#/sponsors', label: 'Sponsors' },
  { hash: '#/news', label: 'News' },
  { hash: '#/mods', label: 'Mods' },
  { hash: '#/settings', label: 'Settings' },
]

let currentRoot: HTMLElement | null = null

function route() {
  const hash = location.hash || '#/'
  app.innerHTML = ''

  // Public screens (no championship needed)
  if (hash === '#/' || hash === '') {
    renderMenu(app)
    return
  }
  if (hash.startsWith('#/new/')) {
    const mode = hash.split('/')[2] === 'career' ? 'career' : 'fast'
    renderShell(app, null)
    const root = pageRoot()
    renderNewChampionship(root, mode)
    return
  }

  // Multiplayer lobby (no shell — full screen)
  if (hash.startsWith('#/lobby')) {
    app.innerHTML = ''
    const root = pageRoot()
    const action = hash.includes('join') ? 'join' : 'create'
    renderLobby(root, action)
    return
  }

  // Championship screens require loaded state
  if (!store.champ) {
    if (!store.tryLoadSave()) {
      location.hash = '#/'
      return
    }
  }

  renderShell(app, hash)
  const root = pageRoot()

  switch (hash) {
    case '#/hq': return renderHQ(root)
    case '#/weekend': return renderWeekend(root)
    case '#/broadcast': return renderBroadcast3D(root)
    case '#/broadcast2d': return renderBroadcast(root)
    case '#/results': return renderResults(root)
    case '#/standings': return renderStandings(root)
    case '#/paddock': return renderPaddockPost(root)
    case '#/drivers': return renderDrivers(root)
    case '#/staff': return renderStaff(root)
    case '#/development': return renderSimpleManagement(root, 'development')
    case '#/facilities': return renderSimpleManagement(root, 'facilities')
    case '#/finances': return renderFinances(root)
    case '#/sponsors': return renderSponsors(root)
    case '#/news': return renderNews(root)
    case '#/mods': case '#/settings': case '#/devtools': return renderDevTools(root)
    default:
      location.hash = '#/hq'
  }
}

function pageRoot(): HTMLElement {
  const root = el('div')
  app.appendChild(root)
  currentRoot = root
  return root
}

function renderShell(container: HTMLElement, activeHash: string | null) {
  const champ = store.champ
  const team = store.playerTeam
  const bar = el('div', { class: 'topbar' })
  bar.appendChild(el('div', { class: 'logo', onclick: () => (location.hash = champ ? '#/hq' : '#/') }, 'PITWALL ', el('span', {}, 'DYNASTY')))

  if (champ) {
    const nav = el('nav', {})
    for (const item of NAV_ITEMS) {
      const link = el('a', { href: item.hash, class: '' }, item.label)
      if (item.hash === activeHash) link.className = 'active'
      nav.appendChild(link)
    }
    bar.appendChild(nav)
    bar.appendChild(
      el('span', { style: 'display:flex;align-items:center;gap:14px' },
        el('span', { style: 'font-size:12px;color:var(--text-2)' }, `S${champ.config.season} · R${Math.min(champ.currentRoundIndex + 1, champ.rounds.length)}/${champ.rounds.length}`),
        team ? el('span', { class: 'money' }, money(team.money)) : null,
        el('button', { class: 'small ghost', onclick: () => store.save() }, 'Save'),
        el('button', { class: 'small ghost', onclick: () => (location.hash = '#/mods') }, 'Dev'),
      ),
    )
  } else {
    bar.appendChild(el('nav', {}))
  }

  container.appendChild(bar)
}

// ---------------------------------------------------------------------------
// Simpler management screens
// ---------------------------------------------------------------------------

function renderSimpleManagement(root: HTMLElement, kind: 'development' | 'facilities') {
  const team = store.playerTeam!
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  if (kind === 'development') {
    inner.appendChild(el('h2', {}, 'Car Development'))
    inner.appendChild(el('p', { style: 'color:var(--text-2)' },
      'Design new parts for the six car areas. Each part trades stats against each other — a high-downforce wing adds drag, cooling packages cost straight-line performance. Projects complete after several rounds.'))

    const gridEl = el('div', { class: 'grid cols-3' })
    for (const slot of ['frontWing', 'rearWing', 'floor', 'chassis', 'suspension', 'cooling'] as const) {
      const part = team.parts[slot]
      const card = el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('h3', {}, slotName(slot))),
        el('div', { class: 'card-body' },
          part
            ? el('div', {},
                el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Installed'), el('span', { class: 'value' }, part.name)),
                ...Object.entries(part.modifiers).map(([k, v]) =>
                  el('div', { class: 'stat' },
                    el('span', { class: 'label' }, k),
                    el('span', { class: 'value', style: `color:${(v ?? 0) > 0 ? 'var(--good)' : 'var(--bad)'}` }, `${(v ?? 0) > 0 ? '+' : ''}${v}`)),
                ),
              )
            : el('div', { class: 'empty-state' }, 'Standard part fitted.'),
          el('button', {
            onclick: () => {
              const mods = proposeModifiersForSlot(slot, team.carPerformance)
              const project = startDevelopment(team, slot, mods)
              if (!project) {
                toast('Not enough budget for this project.', true)
                return
              }
              const projects = getProjectsSafe(team)
              projects.push(project)
              toast(`${project.name} design started.`)
              renderSimpleManagement(root, kind)
            },
          }, 'Start new design (~$1M)'),
        ),
      )
      gridEl.appendChild(card)
    }
    inner.appendChild(gridEl)

    // Active projects
    const projects = getProjectsSafe(team)
    if (projects.length) {
      const pc = el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('h3', {}, 'Active Projects')),
        el('div', { class: 'card-body' },
          ...projects.map((p) =>
            el('div', {},
              el('div', { class: 'stat' }, el('span', {}, p.name), el('span', { class: 'value' }, `ready in ${p.weeksRemaining} rounds`)),
              progressBar(p.weeksRemaining / p.weeksTotal > 0 ? 1 - p.weeksRemaining / p.weeksTotal : 0),
            )),
        ),
      )
      inner.appendChild(pc)
    }
  } else {
    inner.appendChild(el('h2', {}, 'Facilities'))
    inner.appendChild(el('p', { style: 'color:var(--text-2)' }, 'Facilities improve development quality, driver progression and pit stops. Upgrades take multiple rounds and increase weekly upkeep.'))
    const FACILITIES = [
      ['designCentre', 'Design Centre'], ['windTunnel', 'Wind Tunnel'], ['simulator', 'Simulator'],
      ['factory', 'Factory'], ['cfd', 'CFD Cluster'], ['driverDevelopment', 'Driver Development'],
      ['scoutingNetwork', 'Scouting Network'], ['pitOperationsCentre', 'Pit Operations Centre'],
    ] as const
    const gridEl = el('div', { class: 'grid cols-4' })
    for (const [id, name] of FACILITIES) {
      const level = team.facilities[id] ?? 0
      const cost = 2200 * Math.pow(1.75, level)
      gridEl.appendChild(
        el('div', { class: 'card' },
          el('div', { class: 'card-head' }, el('h3', {}, name)),
          el('div', { class: 'card-body' },
            levelBadge(level),
            el('button', {
              disabled: level >= 5 || team.money < cost,
              onclick: () => {
                const ok = startFacilityUpgrade(team, id, level)
                toast(ok ? 'Upgrade started.' : 'Cannot afford upgrade.', !ok)
                renderSimpleManagement(root, kind)
              },
            }, level >= 5 ? 'Max level' : `Upgrade ($${(cost / 1000).toFixed(1)}M)`),
          ),
        ),
      )
    }
    inner.appendChild(gridEl)
  }

  function progressBar(frac: number): HTMLElement {
    const b = el('div', { class: 'progressbar' })
    const f = el('div'); f.style.width = `${frac * 100}%`
    b.appendChild(f)
    return b
  }

  function levelBadge(level: number): Node {
    return el('div', { style: 'display:flex;gap:4px' },
      ...Array.from({ length: 5 }, (_, i) =>
        el('div', { style: `flex:1;height:10px;border-radius:2px;background:${i < level ? 'var(--accent-2)' : 'var(--bg-3)'}` })),
    )
  }

  page.appendChild(inner)
  root.appendChild(page)
}

function slotName(slot: string): string {
  return slot.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

function getProjectsSafe(team: Team) {
  return ((team as unknown as Record<string, unknown>)['__devProjects'] as DevelopmentProject[]) ?? []
}

/** Generate balanced tradeoff modifiers for a new part design. */
function proposeModifiersForSlot(slot: string, perf: CarPerformance): PartStatModifiers {
  const gain = 3 + Math.random() * 3 // presentation-layer randomness is fine here
  switch (slot) {
    case 'frontWing':
      return { lowSpeedAero: +gain.toFixed(1), mediumSpeedAero: +(gain * 0.7).toFixed(1), drag: +(gain * 0.5).toFixed(1) }
    case 'rearWing':
      return { highSpeedAero: +gain.toFixed(1), mediumSpeedAero: +(gain * 0.6).toFixed(1), drag: +(gain * 0.8).toFixed(1), straightLineSpeed: -(gain).toFixed(1) as unknown as number }
    case 'floor':
      return { lowSpeedAero: +(gain * 0.6).toFixed(1), mediumSpeedAero: +(gain * 0.9).toFixed(1), traction: +(gain * 0.5).toFixed(1) }
    case 'chassis':
      return { lowSpeedAero: +(gain * 0.4).toFixed(1), highSpeedAero: +(gain * 0.4).toFixed(1), reliability: +(gain * 0.6).toFixed(1) }
    case 'suspension':
      return { traction: +gain.toFixed(1), braking: +(gain * 0.7).toFixed(1), tyreWear: +(gain * 0.3).toFixed(1) }
    case 'cooling':
      return { cooling: +gain.toFixed(1), reliability: +(gain * 0.5).toFixed(1), drag: -(gain * 0.3).toFixed(1) as unknown as number }
    default:
      return perf ? { mediumSpeedAero: gain } : {}
  }
}

function renderFinances(root: HTMLElement) {
  const champ = store.champ!
  const team = store.playerTeam!
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h2', {}, 'Finances'))

  let salaryPerRound = 0
  for (const dId of team.driverIds) {
    const d = champ.drivers[dId]
    if (d?.contract) salaryPerRound += d.contract.salaryPerSeason / champ.rounds.length
  }
  for (const sid of team.staffIds) {
    const s = champ.staffPool.find((x) => x.id === sid)
    if (s?.contract) salaryPerRound += s.contract.salaryPerSeason / champ.rounds.length
  }
  const sponsorIncome = team.sponsors.reduce((s, x) => s + x.basePaymentPerRace, 0)

  inner.appendChild(el('div', { class: 'grid cols-3' },
    bigStat('Balance', money(team.money)),
    bigStat('Est. income per race', money(sponsorIncome)),
    bigStat('Est. salaries per race', money(Math.round(salaryPerRound))),
  ))

  inner.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Ledger Notes')),
    el('div', { class: 'card-body' },
      el('p', { style: 'font-size:13px;color:var(--text-1);line-height:1.6' },
        'Income comes from sponsor payments, position bonuses and prize money per points scored. Costs include driver and staff salaries plus a fixed operations baseline. Development projects and facility upgrades are paid upfront when started.'),
    ),
  ))
  page.appendChild(inner)
  root.appendChild(page)
}

function bigStat(label: string, value: string): HTMLElement {
  return el('div', { class: 'card' }, el('div', { class: 'card-body' },
    el('div', { class: 'stat' }, el('span', { class: 'label' }, label)),
    el('div', { class: 'mono', style: 'font-size:26px;font-weight:700;margin-top:4px' }, value),
  ))
}

function renderSponsors(root: HTMLElement) {
  const team = store.playerTeam!
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h2', {}, 'Sponsors'))
  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Sponsor'), el('th', {}, 'Industry'), el('th', { class: 'num' }, 'Per race'),
      el('th', { class: 'num' }, 'Pos bonus'), el('th', { class: 'num' }, 'Expects'), el('th', { class: 'num' }, 'Years left'))))
  const tb = el('tbody', {})
  for (const sc of team.sponsors) {
    const sp = sponsorLookup(sc.sponsorId)
    tb.appendChild(el('tr', {},
      el('td', {}, sp?.name ?? sc.sponsorId),
      el('td', {}, sp?.industry ?? '—'),
      el('td', { class: 'num' }, `$${sc.basePaymentPerRace}K`),
      el('td', { class: 'num' }, `$${sc.positionBonus}K`),
      el('td', { class: 'num' }, `P${sc.expectationPosition} or better`),
      el('td', { class: 'num' }, String(sc.seasonsRemaining)),
    ))
  }
  table.appendChild(tb)
  inner.appendChild(el('div', { class: 'card' }, table))
  page.appendChild(inner)
  root.appendChild(page)
}

function sponsorLookup(id: string) {
  return SPONSORS.find((s) => s.id === id)
}

function renderNews(root: HTMLElement) {
  const champ = store.champ!
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h2', {}, 'News Feed'))
  const card = el('div', { class: 'card' }, el('div', { class: 'card-body' }))
  const body = card.querySelector('.card-body')!
  if (champ.newsFeed.length === 0) {
    body.appendChild(el('div', { class: 'empty-state' }, 'No news yet.'))
  } else {
    for (const n of champ.newsFeed) {
      body.appendChild(
        el('div', { class: 'news-item' },
          el('div', { class: 'news-meta' }, `Season ${n.season} · Round ${n.roundIndex + 1}`),
          el('h4', {}, n.headline),
          el('p', {}, n.body),
        ),
      )
    }
  }
  inner.appendChild(card)
  page.appendChild(inner)
  root.appendChild(page)
}

// ---------------------------------------------------------------------------

window.addEventListener('hashchange', route)
if (!location.hash) location.hash = '#/'
route()

export { currentRoot }
