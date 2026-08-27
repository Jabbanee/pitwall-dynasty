import './styles.css'
import { el, money } from './dom'
import { store } from '../state/store'
import { renderMenu } from './menu'
import { renderNewChampionship } from './new-championship'
import { renderHQ } from './hq'
import { renderStandings } from './standings'
import { renderStaff } from './staff'
import { renderWeekend } from './weekend'
import { renderBroadcast } from './broadcast'
import { renderBroadcast3D } from './three/broadcast3d'
import { renderResults } from './results'
import { renderPaddockPost } from './paddock-post'
import { renderDevTools } from './devtools'
import { renderLobby } from './lobby'
import { renderDevelopment } from './development'
import { renderFacilities } from './facilities'
import { renderSponsors } from './sponsors'
import { renderJuniorHub, renderWatchlist, renderAcademy, renderDriverMarket, renderSeriesDetail, renderDriverProfile } from './driver-ecosystem'
import { renderMultiplayerHQ, renderMultiplayerResults, renderMultiplayerStandings, renderMultiplayerPaddock } from './multiplayer-views'

const app = document.getElementById('app')!

const NAV_ITEMS: Array<{ hash: string; label: string }> = [
  { hash: '#/hq', label: 'Team HQ' },
  { hash: '#/weekend', label: 'Race Weekend' },
  { hash: '#/standings', label: 'Standings' },
  { hash: '#/drivers', label: 'Drivers' },
  { hash: '#/juniors', label: 'Juniors' },
  { hash: '#/watchlist', label: 'Watchlist' },
  { hash: '#/academy', label: 'Academy' },
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

  // Multiplayer broadcast / results / standings routes
  if (store.multi.active && (hash === '#/broadcast' || hash === '#/broadcast2d' || hash === '#/results' || hash === '#/standings' || hash === '#/paddock' || hash === '#/hq')) {
    renderShell(app, hash)
    const root = pageRoot()
    switch (hash) {
      case '#/hq': return renderMultiplayerHQ(root)
      case '#/broadcast': return renderBroadcast3D(root)
      case '#/broadcast2d': return renderBroadcast(root)
      case '#/results': return renderMultiplayerResults(root)
      case '#/standings': return renderMultiplayerStandings(root)
      case '#/paddock': return renderMultiplayerPaddock(root)
    }
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

  // Dynamic routes first so static switch catches what remains
  if (hash.startsWith('#/series/')) {
    const id = hash.slice('#/series/'.length) as import('../core/types').SeriesId
    return renderSeriesDetail(root, id)
  }
  if (hash.startsWith('#/driver/')) {
    const id = hash.slice('#/driver/'.length)
    return renderDriverProfile(root, id)
  }

  switch (hash) {
    case '#/hq': return renderHQ(root)
    case '#/weekend': return renderWeekend(root)
    case '#/broadcast': return renderBroadcast3D(root)
    case '#/broadcast2d': return renderBroadcast(root)
    case '#/results': return renderResults(root)
    case '#/standings': return renderStandings(root)
    case '#/paddock': return renderPaddockPost(root)
    case '#/drivers': return renderDriverMarket(root, 'race')
    case '#/drivers/free': return renderDriverMarket(root, 'free')
    case '#/drivers/reserves': return renderDriverMarket(root, 'reserves')
    case '#/staff': return renderStaff(root)
    case '#/development': return renderDevelopment(root)
    case '#/facilities': return renderFacilities(root)
    case '#/finances': return renderFinances(root)
    case '#/sponsors': return renderSponsors(root)
    case '#/news': return renderNews(root)
    case '#/juniors': return renderJuniorHub(root)
    case '#/watchlist': return renderWatchlist(root)
    case '#/academy': return renderAcademy(root)
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
// Finances
// ---------------------------------------------------------------------------

function renderFinances(root: HTMLElement) {
  const champ = store.champ!
  const team = store.playerTeam!
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h1', {}, 'Finances'))

  let driverSalary = 0
  for (const dId of team.driverIds) {
    const d = champ.drivers[dId]
    if (d?.contract) driverSalary += d.contract.salaryPerSeason / champ.rounds.length
  }
  let staffSalary = 0
  for (const sid of team.staffIds) {
    const s = champ.staffPool.find((x) => x.id === sid)
    if (s?.contract) staffSalary += s.contract.salaryPerSeason / champ.rounds.length
  }
  const sponsorIncome = team.sponsors.reduce((s, x) => s + x.basePaymentPerRace, 0)
  const monthlyBurn = driverSalary + staffSalary

  // KPI tiles row
  const kpis = el('div', { class: 'mini-tiles' })
  kpis.appendChild(bigTile('Balance', money(team.money)))
  kpis.appendChild(bigTile('Est. income / race', money(sponsorIncome)))
  kpis.appendChild(bigTile('Driver salaries / race', money(Math.round(driverSalary))))
  kpis.appendChild(bigTile('Staff salaries / race', money(Math.round(staffSalary))))
  inner.appendChild(kpis)

  // Burn breakdown
  const burnCard = el('div', { class: 'panel' })
  burnCard.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'MONTHLY BURN BREAKDOWN')))
  const burnBody = el('div', { class: 'panel-body' })
  const burn = el('div', { class: 'finance-burn' })
  burn.appendChild(bigTile('Total / race', money(Math.round(monthlyBurn)), 'all costs'))
  burn.appendChild(bigTile('Projected end', money(team.money + (sponsorIncome - monthlyBurn) * (champ.rounds.length - champ.currentRoundIndex)), 'best estimate'))
  burn.appendChild(bigTile('Sponsors', money(sponsorIncome), `${team.sponsors.length} active`))
  burn.appendChild(bigTile('Drivers', money(Math.round(driverSalary)), `${team.driverIds.length} active`))
  burn.appendChild(bigTile('Staff', money(Math.round(staffSalary)), `${team.staffIds.length} active`))
  burnBody.appendChild(burn)
  const note = el('p', { style: 'color:var(--text-1);font-size:13px;line-height:1.6;margin-top:6px' },
    'Income comes from sponsor payments, position bonuses and prize money per points scored. Costs include driver and staff salaries plus a fixed operations baseline. Development projects and facility upgrades are paid upfront when started.')
  burnBody.appendChild(note)
  burnCard.appendChild(burnBody)
  inner.appendChild(burnCard)

  page.appendChild(inner)
  root.appendChild(page)
}

function bigTile(label: string, value: string, sub?: string) {
  return el('div', { class: 'mini-tile' },
    el('div', { class: 'k' }, label),
    el('div', { class: 'v' }, value),
    sub ? el('div', { style: 'font-size:11px;color:var(--text-2);margin-top:2px' }, sub) : null,
  )
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

function renderNews(root: HTMLElement) {
  const champ = store.champ!
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h1', {}, 'News Feed'))
  if (champ.newsFeed.length === 0) {
    inner.appendChild(el('div', { class: 'panel' }, el('div', { class: 'panel-body' },
      el('div', { class: 'empty-state' }, 'No news yet. Race weekends will generate headlines here.'),
    )))
  } else {
    const card = el('div', { class: 'panel' })
    const body = el('div', { class: 'panel-body' })
    for (const n of champ.newsFeed) {
      body.appendChild(
        el('div', { class: 'news-item' },
          el('div', { class: 'news-meta' }, `Season ${n.season} · Round ${n.roundIndex + 1}`),
          el('h4', {}, n.headline),
          el('p', {}, n.body),
        ),
      )
    }
    card.appendChild(body)
    inner.appendChild(card)
  }
  page.appendChild(inner)
  root.appendChild(page)
}

window.addEventListener('hashchange', route)
if (!location.hash) location.hash = '#/'
route()

export { currentRoot }
