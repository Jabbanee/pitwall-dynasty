import { el, money, ratingColor, toast } from './dom'
import { store } from '../state/store'
import { fmtMoney, getProjects, signDriver } from '../championship/engine'
import type { Championship, Team, Driver } from '../core/types'

export function teamColorDot(champ: Championship, teamId: string): HTMLElement {
  const t = champ.teams.find((x) => x.id === teamId)
  return el('span', { class: 'team-dot', style: `background:${t?.colors.primary ?? '#666'}` })
}

export function driverName(champ: Championship, id: string): string {
  const d = champ.drivers[id]
  return d ? `${d.firstName[0]}. ${d.lastName}` : id
}

export function renderHQ(root: HTMLElement) {
  const { champ, engine } = store
  if (!champ || !engine) return location.hash = '#/'
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  const team = store.playerTeam!
  const round = champ.rounds[champ.currentRoundIndex]
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const standings = engine.standings()
  const myTeamRow = standings.teamRows.findIndex((r) => r.teamId === team.id) + 1
  const myTeamPoints = standings.teamRows.find((r) => r.teamId === team.id)?.points ?? 0

  // --- Hero next-event card (focal point) ---
  const hero = el('div', { class: 'hero-panel' })
  const heroLeft = el('div', {})
  heroLeft.appendChild(el('div', { class: 'hero-eyebrow' },
    el('span', { class: 'pulse' }),
    el('span', {}, `NEXT EVENT · ${round.raceDone ? 'RESULTS IN' : 'MANAGEMENT PHASE'}`),
  ))
  heroLeft.appendChild(el('div', { class: 'hero-title' }, circuit.name))
  heroLeft.appendChild(el('div', { class: 'hero-sub' }, `${round.raceDone ? 'Race complete' : 'Race weekend opens'} · Round ${round.index + 1} of ${champ.rounds.length}`))
  const heroGrid = el('div', { class: 'hero-grid' })
  heroGrid.appendChild(heroStat('Circuit', circuit.country))
  heroGrid.appendChild(heroStat('Length', `${(circuit.characteristics as { lengthKm?: number }).lengthKm ?? 5.2} km`))
  heroGrid.appendChild(heroStat('Laps', String(circuit.characteristics.laps)))
  heroGrid.appendChild(heroStat('Championship', myTeamRow > 0 ? `P${myTeamRow}` : '—'))
  heroGrid.appendChild(heroStat('Points', String(myTeamPoints)))
  heroGrid.appendChild(heroStat('Forecast', `${Math.round(circuit.characteristics.rainProbability * 100)}% rain`))
  heroLeft.appendChild(heroGrid)
  const heroActions = el('div', { class: 'hero-actions' })
  if (round.raceDone) {
    heroActions.appendChild(el('button', { class: 'primary', onclick: () => (location.hash = '#/results') }, 'View results'))
    heroActions.appendChild(el('button', { class: 'quiet', onclick: () => { store.advanceRound(); renderHQ(root) } }, 'Next round →'))
  } else {
    heroActions.appendChild(el('button', { class: 'primary', onclick: () => (location.hash = '#/weekend') }, 'Enter Race Weekend →'))
  }
  heroLeft.appendChild(heroActions)
  hero.appendChild(heroLeft)

  const heroSide = el('div', { class: 'hero-side' })
  heroSide.appendChild(el('div', { class: 'kicker' }, 'CIRCUIT PREVIEW'))
  const circuitThumb = el('div', { class: 'circuit-thumb' })
  circuitThumb.innerHTML = `<svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
    <defs>
      <linearGradient id="ct" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e63946"/>
        <stop offset="50%" stop-color="#f0c14b"/>
        <stop offset="100%" stop-color="#2a6df4"/>
      </linearGradient>
    </defs>
    <path d="M 30,70 Q 30,30 80,30 L 130,30 Q 180,30 180,70 Q 180,110 130,110 L 80,110 Q 30,110 30,70 Z" fill="none" stroke="url(#ct)" stroke-width="3"/>
    <path d="M 30,70 L 60,70 M 180,70 L 210,70 M 180,70 L 210,110" stroke="rgba(255,255,255,0.18)" stroke-width="2" fill="none" stroke-dasharray="3 3"/>
    <circle cx="60" cy="70" r="3" fill="#fff"/>
    <text x="220" y="60" font-family="JetBrains Mono,monospace" font-size="8" fill="rgba(255,255,255,0.5)">S1</text>
    <text x="220" y="80" font-family="JetBrains Mono,monospace" font-size="8" fill="rgba(255,255,255,0.5)">S2</text>
    <text x="220" y="100" font-family="JetBrains Mono,monospace" font-size="8" fill="rgba(255,255,255,0.5)">S3</text>
    <text x="40" y="125" font-family="Rajdhani,Inter,sans-serif" font-size="9" font-weight="700" letter-spacing="1.5" fill="rgba(255,255,255,0.6)">${circuit.name.toUpperCase()}</text>
  </svg>`
  const sf = el('div', { class: 'sf' }, 'SF / FINISH')
  circuitThumb.appendChild(sf)
  heroSide.appendChild(circuitThumb)
  const heroSideStats = el('div', { class: 'kv-grid' })
  heroSideStats.appendChild(kv('Layout', 'Permanent'))
  heroSideStats.appendChild(kv('High Speed', `${Math.round(circuit.characteristics.highSpeed)}%`))
  heroSideStats.appendChild(kv('Overtake', `${100 - circuit.characteristics.overtakingDifficulty}%`))
  heroSideStats.appendChild(kv('Pit Loss', `${circuit.characteristics.pitLossSeconds.toFixed(1)}s`))
  heroSide.appendChild(heroSideStats)
  hero.appendChild(heroLeft)
  hero.appendChild(heroSide)

  inner.appendChild(hero)

  // --- KPI mini tiles ---
  inner.appendChild(
    el('div', { class: 'mini-tiles' },
      kpiTile('Championship', myTeamRow > 0 ? `P${myTeamRow}` : '—', `${myTeamPoints} pts`),
      kpiTile('Balance', fmtMoney(team.money), `${team.sponsors.length} sponsors`),
      kpiTile('Car pace', avgPace(team).toFixed(0), 'overall index'),
      kpiTile('Drivers', `${team.driverIds.length}`, '2-car team'),
    ),
  )

  // --- Middle grid ---
  const newsCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Paddock News')),
    el('div', { class: 'card-body', style: 'max-height:320px;overflow-y:auto' },
      champ.newsFeed.length === 0
        ? el('div', { class: 'empty-state' }, 'No news yet — race weekends will generate headlines here.')
        : champ.newsFeed.slice(0, 12).map((n) =>
            el('div', { class: 'news-item' },
              el('div', { class: 'news-meta' }, `S${n.season} · R${n.roundIndex + 1}`),
              el('h4', {}, n.headline),
              el('p', {}, n.body),
            ),
          ),
    ),
  )

  const devProjects = getProjects(team)
  const devCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Development'), el('button', { class: 'small', onclick: () => (location.hash = '#/development') }, 'Open')),
    el('div', { class: 'card-body' },
      devProjects.length === 0
        ? el('div', { class: 'empty-state' }, 'No active projects.')
        : devProjects.map((p) =>
            el('div', {},
              el('div', { class: 'stat' }, el('span', {}, p.name), el('span', { class: 'value' }, `${p.weeksRemaining}w left`)),
              progressBar(1 - p.weeksRemaining / p.weeksTotal),
            ),
          ),
    ),
  )

  const standingsCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Constructors'), el('button', { class: 'small', onclick: () => (location.hash = '#/standings') }, 'Full table')),
    miniStandingsTable(champ, standings.teamRows.slice(0, 6)),
  )

  const calendarCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Calendar')),
    el('div', { class: 'card-body' },
      ...champ.rounds.map((r) =>
        el('div', { class: 'stat', style: r.index === champ.currentRoundIndex ? 'color:var(--warn)' : '' },
          el('span', {}, `R${r.index + 1} ${champ.circuits.find((c) => c.id === r.circuitId)?.name ?? ''}`),
          el('span', { class: 'value' }, r.raceDone ? 'Done' : r.index === champ.currentRoundIndex ? 'Current' : 'Upcoming'),
        ),
      ),
    ),
  )

  inner.appendChild(el('div', { class: 'grid cols-2' }, newsCard, devCard))
  inner.appendChild(el('div', { class: 'grid cols-2' }, standingsCard, calendarCard))

  page.appendChild(inner)
  root.appendChild(page)
}

function heroStat(k: string, v: string): HTMLElement {
  return el('div', { class: 'stat' },
    el('span', { class: 'stat-label' }, k),
    el('span', { class: 'stat-value' }, v),
  )
}

function kv(k: string, v: string): HTMLElement {
  return el('div', { class: 'kv' },
    el('div', { class: 'k' }, k),
    el('div', { class: 'v' }, v),
  )
}

function kpiTile(label: string, value: string, sub: string): HTMLElement {
  return el('div', { class: 'mini-tile' },
    el('div', { class: 'k' }, label),
    el('div', { class: 'v' }, value),
    el('div', { style: 'font-size:11px;color:var(--text-2);margin-top:2px' }, sub),
  )
}

export function statCard(label: string, value: string, sub?: string, subNode?: HTMLElement): HTMLElement {
  return el('div', { class: 'card' },
    el('div', { class: 'card-body' },
      el('div', { class: 'stat' },
        el('span', { class: 'label' }, label),
        value ? el('span', { class: 'value', style: 'font-size:20px;font-weight:700' }, value) : null,
      ),
      sub ? el('div', { style: 'font-size:12px;color:var(--text-2)' }, sub) : null,
      subNode,
    ),
  )
}

export function progressBar(frac: number, color?: string): HTMLElement {
  const bar = el('div', { class: 'progressbar' })
  const fill = el('div')
  fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`
  if (color) fill.style.background = color
  bar.appendChild(fill)
  return bar
}

function avgPace(team: Team): number {
  const v = Object.values(team.carPerformance)
  return v.reduce((a, b) => a + b, 0) / v.length
}

function miniStandingsTable(champ: Championship, rows: Array<{ teamId: string; points: number; wins: number }>): Node {
  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Team'), el('th', { class: 'num' }, 'Pts'), el('th', { class: 'num' }, 'Wins'))),
  )
  const tbody = el('tbody', {})
  rows.forEach((r, i) => {
    const isMe = r.teamId === store.champ?.playerTeamId
    tbody.appendChild(
      el('tr', { class: isMe ? 'me' : '' },
        el('td', { class: 'num' }, String(i + 1)),
        el('td', {}, teamColorDot(champ, r.teamId), champ.teams.find((t) => t.id === r.teamId)?.name ?? r.teamId),
        el('td', { class: 'num' }, String(r.points)),
        el('td', { class: 'num' }, String(r.wins)),
      ),
    )
  })
  table.appendChild(tbody)
  return table
}

// ---------------------------------------------------------------------------
// Standings screen
// ---------------------------------------------------------------------------

export function renderStandings(root: HTMLElement) {
  const { champ, engine } = store
  if (!champ || !engine) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  const st = engine.standings()

  const driversTable = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Driver'), el('th', {}, 'Team'), el('th', { class: 'num' }, 'Pts'), el('th', { class: 'num' }, 'Wins'))))
  const dtb = el('tbody', {})
  st.driverRows.forEach((r, i) => {
    const d = champ.drivers[r.driverId]
    const team = champ.teams.find((t) => t.driverIds.includes(r.driverId))
    dtb.appendChild(
      el('tr', { class: team?.id === champ.playerTeamId ? 'me' : '' },
        el('td', { class: 'num' }, String(i + 1)),
        el('td', {}, d ? `${d.firstName} ${d.lastName}` : r.driverId),
        el('td', {}, team ? [teamColorDot(champ, team.id), team.shortName] : '—'),
        el('td', { class: 'num' }, String(r.points)),
        el('td', { class: 'num' }, String(r.wins)),
      ),
    )
  })
  driversTable.appendChild(dtb)

  const teamsTable = miniStandingsTable(champ, st.teamRows)

  // History
  const historyCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Past Champions')),
    el('div', { class: 'card-body' },
      champ.history.length === 0
        ? el('div', { class: 'empty-state' }, 'First season in progress.')
        : champ.history.slice().reverse().map((h) =>
            el('div', { class: 'stat' },
              el('span', {}, `Season ${h.season}`),
              el('span', { class: 'value' },
                `${champ.teams.find((t) => t.id === h.championTeamId)?.name ?? '?'} · ${champ.drivers[h.championDriverId]?.lastName ?? h.championDriverId}`),
            ),
          ),
    ),
  )

  inner.appendChild(el('h2', {}, `Season ${champ.config.season} Standings`))
  inner.appendChild(el('div', { class: 'grid cols-2' },
    el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h3', {}, 'Drivers Championship')), driversTable),
    el('div', {}, el('div', { class: 'card', style: 'margin-bottom:16px' }, el('div', { class: 'card-head' }, el('h3', {}, 'Constructors Championship')), teamsTable), historyCard),
  ))
  page.appendChild(inner)
  root.appendChild(page)
}

// ---------------------------------------------------------------------------
// Drivers / Staff screens
// ---------------------------------------------------------------------------

export function renderDrivers(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h2', {}, 'Drivers'))
  const team = store.playerTeam!

  for (const id of team.driverIds) {
    const d = champ.drivers[id]
    if (!d) continue
    inner.appendChild(driverCard(champ, d))
  }

  // Market: available drivers
  const marketIds = Object.values(champ.drivers).filter((d) => !d.contract && !d.retired)
  if (marketIds.length) {
    const marketCard = el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Free Agents — sign to replace a current driver')),
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Age'), el('th', { class: 'num' }, 'Pace'), el('th', { class: 'num' }, 'Ovr'), el('th', {}), )),
      ),
    )
    const tb = el('tbody', {})
    for (const d of marketIds) {
      const ovr = Math.round(Object.values(d.visible).reduce((a, b) => a + b, 0) / 9)
      tb.appendChild(el('tr', {},
        el('td', {}, `${d.firstName} ${d.lastName}`),
        el('td', { class: 'num' }, String(d.age)),
        el('td', { class: 'num', style: `color:${ratingColor(d.visible.pace)}` }, String(d.visible.pace)),
        el('td', { class: 'num' }, String(ovr)),
        el('td', {},
          el('button', {
            class: 'small',
            disabled: team.money < d.salaryDemandBase,
            onclick: () => {
              const err = signDriver(champ, team, d.id, d.salaryDemandBase, 2, champ.config.season)
              if (err) toast(err, true)
              else { toast(`${d.lastName} signed!`); store.save(); store.emit(); renderDrivers(root) }
            },
          }, `Sign (~${money(d.salaryDemandBase)}/season)`)),
      ))
    }
    ;(marketCard.querySelector('table') as HTMLTableElement).appendChild(tb)
    inner.appendChild(marketCard)
  }

  page.appendChild(inner)
  root.appendChild(page)
}

export function driverCard(_champ: Championship, d: Driver): HTMLElement {
  const rows: Array<[string, number]> = [
    ['Pace', d.visible.pace], ['Qualifying', d.visible.qualifying], ['Racecraft', d.visible.racecraft],
    ['Overtaking', d.visible.overtaking], ['Defending', d.visible.defending], ['Consistency', d.visible.consistency],
    ['Wet Skill', d.visible.wetSkill], ['Tyre Mgmt', d.visible.tyreManagement], ['Feedback', d.visible.feedback],
  ]
  const card = el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, `${d.firstName} ${d.lastName} · ${d.nationality} · ${d.age}y`),
      el('span', { class: 'badge grey mono' }, `${money(d.contract?.salaryPerSeason ?? d.salaryDemandBase)}/season · ${d.contract?.seasonsRemaining ?? 0}y left`),
    ),
    el('div', { class: 'card-body' },
      el('div', { class: 'grid cols-2' },
        el('div', {},
          ...rows.map(([label, v]) =>
            el('div', { class: 'rating-row', style: 'margin-bottom:4px' },
              el('span', { class: 'rlabel' }, label),
              el('div', { class: 'rating-bar' }, el('div', { style: `width:${v}%;background:${ratingColor(v)}` })),
              el('span', { class: 'rval' }, String(v)),
            ),
          ),
        ),
        el('div', {},
          moraleStat('Morale', d.dynamic.morale),
          moraleStat('Confidence', d.dynamic.confidence),
          el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Form'),
            el('span', { class: 'value' }, d.dynamic.form >= 0.1 ? '▲ in form' : d.dynamic.form <= -0.1 ? '▼ off form' : '— steady')),
          el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Career points'),
            el('span', { class: 'value' }, String(d.history.reduce((s, h) => s + h.points, 0)))),
        ),
      ),
    ),
  )
  return card
}

function moraleStat(label: string, v: number): Node {
  return el('div', { class: 'rating-row', style: 'margin-bottom:8px' },
    el('span', { class: 'rlabel' }, label),
    el('div', { class: 'rating-bar' }, el('div', { style: `width:${v}%;background:${v > 60 ? 'var(--good)' : v > 35 ? 'var(--warn)' : 'var(--bad)'}` })),
    el('span', { class: 'rval' }, String(Math.round(v))),
  )
}

export function renderStaff(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h2', {}, 'Staff'))
  const team = store.playerTeam!

  const card = el('div', { class: 'card' })
  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Role'), el('th', {}, 'Name'), el('th', { class: 'num' }, 'Skill'), el('th', { class: 'num' }, 'Salary'))))
  const tb = el('tbody', {})
  for (const sid of team.staffIds) {
    const s = champ.staffPool.find((x) => x.id === sid)
    if (!s) continue
    tb.appendChild(el('tr', {},
      el('td', {}, s.role.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())),
      el('td', {}, s.name),
      el('td', { class: 'num', style: `color:${ratingColor(s.skill)}` }, String(s.skill)),
      el('td', { class: 'num' }, money(s.contract?.salaryPerSeason ?? 0)),
    ))
  }
  table.appendChild(tb)
  card.appendChild(table)
  inner.appendChild(card)
  inner.appendChild(el('p', { style: 'color:var(--text-2);font-size:12px' },
    'Strategist skill improves in-race strategy calls. Pit Operations affects stop quality. Race Engineer adds reliability. Technical Director, Head of Aero and Chief Designer accelerate development quality.'))

  page.appendChild(inner)
  root.appendChild(page)
}
