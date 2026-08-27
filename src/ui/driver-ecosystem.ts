import { el, toast } from './dom'
import { store } from '../state/store'
import { FEEDER_CATALOG, FEEDER_CIRCUITS } from '../series/catalog'
import { addToWatchlist, fundScoutingForOneWeek, getReport, getTopProspects, getWatchlist, removeFromWatchlist, tierBadgeColor } from '../series/scouting'
import { promoteAcademyToReserve, promoteToTopTeam, assessAcademyOffer } from '../series/contract'
import { refreshAllEligibility } from '../series/eligibility'
import { renderHelmet, renderEmptyState, renderTeamMark } from './renderers'
import type { Championship, Driver, SeriesId, Team } from '../core/types'

/**
 * Junior Series hub — the player's gateway into the feeder
 * pyramid. Shows the three fictional feeder series, each as a
 * card with calendar, current standings, and top prospects.
 * Selecting a series opens series-detail.
 */
export function renderJuniorHub(root: HTMLElement): void {
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h1', {}, 'Junior Series'))
  inner.appendChild(el('p', { style: 'color:var(--text-2);max-width:780px;margin-bottom:8px' },
    'Three fictional feeder championships develop the next generation of talent. Promote prospects through the pyramid — drivers who perform well can earn an Elite Racing Licence to race in the top series.'))

  const hub = el('div', { class: 'junior-hub' })
  const ids: SeriesId[] = ['base.junior.regional', 'base.junior.continental', 'base.junior.aurora']
  for (const id of ids) {
    hub.appendChild(renderSeriesCard(id))
  }
  inner.appendChild(hub)

  inner.appendChild(renderTopProspectsSection())

  page.appendChild(inner)
  root.appendChild(page)
}

function renderSeriesCard(seriesId: SeriesId): HTMLElement {
  const config = FEEDER_CATALOG[seriesId]
  if (!config) return el('div', { class: 'series-card' })
  const champ = store.champ
  const state = champ?.feeder?.[seriesId]
  const calendar = FEEDER_CIRCUITS[seriesId] ?? []
  const card = el('button', { class: 'series-card' })
  ;(card as HTMLElement).style.setProperty('--series-color', config.color)
  card.style.cssText = 'border-top:4px solid ' + config.color + ';font-family:inherit;background:var(--bg-panel-0);color:var(--text-0);cursor:pointer;text-align:left;'
  card.addEventListener('click', () => { location.hash = '#/series/' + seriesId })

  const emblem = el('div', { class: 'series-emblem' })
  emblem.innerHTML = config.emblemSvg
  card.appendChild(emblem)

  card.appendChild(el('div', { class: 'series-tier' }, tierLabelFor(config.tier)))
  card.appendChild(el('div', { class: 'series-name' }, config.name))
  card.appendChild(el('div', { class: 'series-blurb' }, config.blurb))

  // Historical gate: women's series is not yet established in this
  // career save. Show a placeholder card so the hub is not broken.
  const isWomenSeries = config.tier === 'women'
  const isEstablished = !isWomenSeries || (champ?.womenSeriesEstablished ?? false)
  if (!isEstablished) {
    const placeholder = el('div', { class: 'series-stats' })
    placeholder.appendChild(statCell('Status', 'Not yet'))
    placeholder.appendChild(statCell('Era', `S${champ?.config.season ?? 1}`))
    placeholder.appendChild(statCell('Est. era', `S${config.establishedSeason}`))
    card.appendChild(placeholder)
    card.appendChild(el('div', { style: 'font-size:11px;color:var(--text-2);margin-top:6px;line-height:1.5' },
      'A new women’s development championship is planned. Racing begins once the board ratifies the calendar. Continue the career to unlock the series.'))
    const footer = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:6px' })
    footer.appendChild(el('span', { class: 'kicker' }, 'COMING SOON'))
    footer.appendChild(el('span', { class: 'kicker' }, '—'))
    card.appendChild(footer)
    return card
  }

  // Mini stats
  const stats = el('div', { class: 'series-stats' })
  const driverCount = state?.drivers ? Object.keys(state.drivers).length : 0
  const curRound = state ? `${state.currentRoundIndex + 1}/${state.config.rounds}` : '—'
  const curSeason = state ? `S${state.currentSeason}` : '—'
  stats.appendChild(statCell('Season', curSeason))
  stats.appendChild(statCell('Round', curRound))
  stats.appendChild(statCell('Drivers', String(driverCount)))
  card.appendChild(stats)

  // Calendar preview
  const calList = el('div', { style: 'display:flex;flex-direction:column;gap:3px;margin-top:6px;font-size:11px;color:var(--text-2)' })
  for (const c of calendar.slice(0, 4)) {
    calList.appendChild(el('div', {}, c.name))
  }
  if (calendar.length > 4) calList.appendChild(el('div', { style: 'color:var(--text-3)' }, `+${calendar.length - 4} more`))
  card.appendChild(calList)

  // Action footer
  const footer = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:6px' })
  footer.appendChild(el('span', { class: 'kicker' }, 'PROSPECTS'))
  footer.appendChild(el('span', { class: 'kicker' }, 'PRESS TO ENTER →'))
  card.appendChild(footer)

  return card
}

function statCell(k: string, v: string) {
  return el('div', { class: 'stat-cell' },
    el('div', { class: 'k' }, k),
    el('div', { class: 'v' }, v),
  )
}

function tierLabelFor(tier: 'top' | 'upper-junior' | 'lower-junior' | 'women'): string {
  switch (tier) {
    case 'top': return 'TOP'
    case 'upper-junior': return 'UPPER JUNIOR'
    case 'lower-junior': return 'LOWER JUNIOR'
    case 'women': return 'WOMEN'
  }
}

/**
 * Per-series detail. Shows current standings, calendar, top
 * prospects and the player's existing scouting data if any.
 */
export function renderSeriesDetail(root: HTMLElement, seriesId: SeriesId): void {
  root.innerHTML = ''
  const config = FEEDER_CATALOG[seriesId]
  const champ = store.champ
  const state = champ?.feeder?.[seriesId]
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  if (!config) {
    inner.appendChild(el('h1', {}, 'Unknown Series'))
    inner.appendChild(renderEmptyState({ title: 'Series not found.' }))
    page.appendChild(inner)
    root.appendChild(page)
    return
  }
  if (!state) {
    inner.appendChild(el('h1', {}, config.name))
    inner.appendChild(el('p', { style: 'color:var(--text-2);max-width:780px;margin-bottom:8px' }, config.blurb))
    const isWomen = config.tier === 'women'
    const isEstablished = !isWomen || (champ?.womenSeriesEstablished ?? false)
    if (!isEstablished) {
      inner.appendChild(renderEmptyState({
        title: `${config.name} is not yet established.`,
        sub: `This development series is scheduled to begin in season ${config.establishedSeason}. Continue the career — it will unlock automatically.`,
      }))
    } else {
      inner.appendChild(renderEmptyState({
        title: 'No active season yet.',
        sub: 'The series has been approved but no grid has been opened. Simulate the next round to generate the opening roster.',
      }))
    }
    const back = el('div', { style: 'margin-top:12px' })
    back.appendChild(el('button', { onclick: () => location.hash = '#/juniors' }, '← Back to Junior Series'))
    inner.appendChild(back)
    page.appendChild(inner)
    root.appendChild(page)
    return
  }

  inner.appendChild(el('h1', {}, config.name))
  inner.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:14px' }, config.blurb))

  // Action bar
  const bar = el('div', { style: 'display:flex;gap:8px;margin-bottom:14px' })
  bar.appendChild(el('button', { onclick: () => location.hash = '#/juniors' }, '← Back to Junior Series'))
  bar.appendChild(el('button', { class: 'primary', onclick: () => {
    toast(fundScoutingForOneWeek(store.champ!))
  } }, 'Fund Scouting (+1 week)'))
  bar.appendChild(el('button', { onclick: () => { refreshAllEligibility(store.champ!); toast('Eligibility refreshed.') } }, 'Refresh Eligibility'))
  inner.appendChild(bar)

  // Two-column body: standings + calendar
  const detail = el('div', { class: 'series-detail' })

  // Standings panel
  const standings = el('div', { class: 'panel' })
  standings.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'CURRENT STANDINGS')))
  const standBody = el('div', { class: 'panel-body' })
  standBody.appendChild(renderStandings(state))
  standings.appendChild(standBody)
  detail.appendChild(standings)

  // Calendar + prospects panel
  const calendar = state.calendar.map((id) => FEEDER_CIRCUITS[seriesId]?.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c)
  const side = el('div', { class: 'panel' })
  side.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'CALENDAR & TOP PROSPECTS')))
  const sideBody = el('div', { class: 'panel-body' })
  const calList = el('div', { style: 'display:flex;flex-direction:column;gap:6px' })
  for (let i = 0; i < calendar.length; i++) {
    const c = calendar[i]
    const isCurrent = i === state.currentRoundIndex
    calList.appendChild(el('div', { style: `padding:6px 8px;border-radius:4px;background:${isCurrent ? 'rgba(230,57,70,0.08)' : 'transparent'};border:1px solid ${isCurrent ? 'var(--accent)' : 'var(--line-1)'}` },
      el('div', { style: 'font-size:12px' }, c.name),
      el('div', { class: 'kicker' }, isCurrent ? `CURRENT R${i + 1}` : `R${i + 1}`),
    ))
  }
  sideBody.appendChild(calList)
  sideBody.appendChild(el('div', { class: 'kicker', style: 'margin-top:14px' }, 'TOP PROSPECTS'))
  for (const p of state.teams.slice(0, 5)) {
    const card = el('div', { class: 'prospect-card', style: 'margin-top:6px' })
    card.appendChild(renderHelmet({ id: p.id, name: p.name, colors: p.colors }, p.shortName, 'sm'))
    const info = el('div', { class: 'prospect-info' })
    info.appendChild(el('span', { class: 'name' }, p.name))
    info.appendChild(el('span', { class: 'meta' }, p.shortName))
    card.appendChild(info)
    const tier = el('div', { class: 'prospect-tier' })
    tier.appendChild(el('span', { class: 'tier', style: `color:var(--text-3)` }, `REP ${p.reputation}`))
    card.appendChild(tier)
    sideBody.appendChild(card)
  }
  side.appendChild(sideBody)
  detail.appendChild(side)
  inner.appendChild(detail)
  page.appendChild(inner)
  root.appendChild(page)
}

function renderStandings(state: NonNullable<NonNullable<Championship['feeder']>['base.junior.regional']>): HTMLElement {
  const list = el('div', { class: 'series-standings' })
  const seasonResults = state.results.filter((r) => r.season === state.currentSeason)
  const driverPts = new Map<string, number>()
  const teamPts = new Map<string, number>()
  for (const r of seasonResults) {
    for (const row of r.results) {
      if (row.finishPosition >= 1 && row.finishPosition <= 18) {
        const p = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0][row.finishPosition - 1] ?? 0
        if (p > 0) {
          driverPts.set(row.driverId, (driverPts.get(row.driverId) ?? 0) + p)
          if (row.teamId) teamPts.set(row.teamId, (teamPts.get(row.teamId) ?? 0) + p)
        }
      }
    }
  }
  const teamRanked = [...teamPts.entries()].sort((a, b) => b[1] - a[1])
  if (teamRanked.length === 0) {
    list.appendChild(el('div', { class: 'empty-state' }, 'Season not started yet.'))
  }
  for (let i = 0; i < Math.min(teamRanked.length, 8); i++) {
    const [tid, pts] = teamRanked[i]
    const team = state.teams.find((t) => t.id === tid)
    if (!team) continue
    const top = i < 3
    const row = el('div', { class: top ? 'row top' : 'row' })
    row.appendChild(el('div', { class: 'pos' }, `P${i + 1}`))
    const info = el('div', { style: 'display:flex;flex-direction:column;min-width:0' })
    info.appendChild(el('span', { class: 'name' }, team.name))
    info.appendChild(el('span', { class: 'team' }, team.shortName))
    row.appendChild(info)
    row.appendChild(el('div', { class: 'pts' }, String(pts)))
    list.appendChild(row)
  }
  return list
}

/**
 * Driver profile screen. Shows the driver hero, racecraft,
 * contract, agency state, career history, recent form, team
 * comparison, top prospects etc. For academy/reserve/race drivers
 * the profile shows the appropriate contract. Prospects get the
 * "Add to watchlist" action.
 */
export function renderDriverProfile(root: HTMLElement, driverId: string): void {
  root.innerHTML = ''
  const champ = store.champ
  if (!champ) { root.appendChild(renderEmptyState({ title: 'No championship loaded.' })); return }
  const d = champ.drivers[driverId]
  if (!d) { root.appendChild(renderEmptyState({ title: 'Driver not found.' })); return }
  const team = d.contract?.teamId
    ? champ.teams.find((t) => t.id === d.contract!.teamId)
    : d.reserveContract?.teamId
      ? champ.teams.find((t) => t.id === d.reserveContract!.teamId)
      : d.academyContract?.teamId
        ? champ.teams.find((t) => t.id === d.academyContract!.teamId)
        : null
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h1', {}, `${d.firstName[0]}. ${d.lastName}`))

  // Hero card
  const hero = el('div', { class: 'driver-profile-hero' })
  ;(hero as HTMLElement).style.setProperty('--team-color', team?.colors.primary ?? 'var(--accent)')
  const headshot = el('div', { class: 'helmet' })
  headshot.appendChild(renderHelmet(team ?? { id: d.id, name: d.lastName, colors: { primary: 'var(--accent)', secondary: 'var(--text-0)' } }, d.firstName[0], 'lg'))
  hero.appendChild(headshot)
  const info = el('div', {})
  const nameLine = el('div', { class: 'name' })
  nameLine.innerHTML = `<span class="num">#${d.firstName[0]}${d.lastName[0] ?? ''}</span>${d.firstName} ${d.lastName}`
  info.appendChild(nameLine)
  const meta = el('div', { class: 'meta' })
  meta.appendChild(el('span', { class: 'badge' }, d.gender))
  meta.appendChild(el('span', { class: 'badge' }, d.nationality))
  meta.appendChild(el('span', { class: 'badge' }, `${d.age}y`))
  if (team) {
    const tm = el('span', { class: 'badge' })
    tm.appendChild(renderTeamMark(team, 'sm'))
    info.appendChild(tm)
  }
  info.appendChild(meta)
  hero.appendChild(info)
  inner.appendChild(hero)

  // Two-column body
  const two = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px' })

  // Skills card
  const skills = el('div', { class: 'panel' })
  skills.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'SKILLS')))
  const skillsBody = el('div', { class: 'panel-body' })
  const v = d.visible
  for (const [k, val] of Object.entries(v)) {
    const row = el('div', { class: 'rating-row' })
    row.appendChild(el('span', { class: 'rlabel' }, k))
    const trk = el('div', { class: 'rating-bar' })
    const fill = el('div')
    fill.style.width = `${val}%`
    fill.style.background = val >= 75 ? 'var(--good)' : val >= 55 ? 'var(--accent-3)' : val >= 40 ? 'var(--warn)' : 'var(--bad)'
    trk.appendChild(fill)
    row.appendChild(trk)
    row.appendChild(el('span', { class: 'rval' }, String(val)))
    skillsBody.appendChild(row)
  }
  skills.appendChild(skillsBody)
  two.appendChild(skills)

  // Agency card
  const agency = el('div', { class: 'driver-agency' })
  agency.appendChild(el('div', { class: 'kicker' }, 'DRIVER AGENCY STATE'))
  const agRows: Array<[string, number, 'good' | 'warn' | 'bad']> = [
    ['Morale', d.dynamic.morale, d.dynamic.morale >= 70 ? 'good' : d.dynamic.morale >= 40 ? 'warn' : 'bad'],
    ['Trust', d.dynamic.confidence, d.dynamic.confidence >= 70 ? 'good' : d.dynamic.confidence >= 40 ? 'warn' : 'bad'],
    ['Form', Math.round(d.dynamic.form * 100 + 50), d.dynamic.form >= 0.1 ? 'good' : d.dynamic.form <= -0.1 ? 'bad' : 'warn'],
  ]
  for (const [k, v2, tone] of agRows) {
    const row = el('div', { class: 'agency-row' })
    row.appendChild(el('div', { class: 'lbl' }, k))
    const trk = el('div', { class: 'agency-bar' })
    const fill = el('div')
    fill.style.width = `${Math.max(0, Math.min(100, v2))}%`
    fill.style.background = tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : 'var(--bad)'
    trk.appendChild(fill)
    row.appendChild(trk)
    row.appendChild(el('div', { class: 'val' }, String(v2)))
    agency.appendChild(row)
  }
  // Career goals
  const goals = el('div', { class: 'agency-concerns' })
  goals.appendChild(el('div', { class: 'kicker' }, 'CONCERNS & WINS'))
  if (d.dynamic.morale < 50) goals.appendChild(concernRow('⚠', 'Morale is low — consider positive action.', 'bad'))
  if (d.dynamic.confidence < 50) goals.appendChild(concernRow('⚠', 'Confidence is fragile — avoid public criticism.', 'bad'))
  if (d.hidden.potential >= 92) goals.appendChild(concernRow('✓', 'Elite prospect on the rise.', 'good'))
  if (d.dynamic.form >= 0.1) goals.appendChild(concernRow('✓', 'In form — strong recent performances.', 'good'))
  agency.appendChild(goals)
  two.appendChild(agency)

  inner.appendChild(two)

  // Scout report (if any)
  const report = getReport(store.champ!, d.id)
  if (report) {
    const sr = el('div', { class: 'scout-report', style: 'margin-top:18px' })
    sr.appendChild(el('div', { class: 'kicker' }, 'SCOUT REPORT'))
    const head = el('div', { class: 'scout-head' })
    head.appendChild(el('div', { class: 'name' }, `${d.firstName[0]}. ${d.lastName}`))
    head.appendChild(el('div', { class: 'meta' }, `Confidence ${Math.round(report.confidence * 100)}% · ${report.visible.potentialTier}`))
    sr.appendChild(head)
    // Confidence bar
    const cb = el('div', { class: 'confidence-bar', style: 'margin-top:10px' })
    const cbl = el('div', { class: 'label' })
    cbl.appendChild(el('span', {}, 'SCOUTING CONFIDENCE'))
    cbl.appendChild(el('span', {}, `${Math.round(report.confidence * 100)}%`))
    cb.appendChild(cbl)
    const ctrack = el('div', { class: 'bar' })
    const cfill = el('div', { class: 'fill' })
    cfill.style.width = `${report.confidence * 100}%`
    ctrack.appendChild(cfill)
    cb.appendChild(ctrack)
    sr.appendChild(cb)
    // Visible ranges
    const rg = el('div', { class: 'range-grid', style: 'margin-top:12px' })
    for (const k of ['pace', 'qualifying', 'racecraft', 'wetSkill'] as const) {
      const [lo, hi] = report.visible[k]
      const row = el('div', { class: 'range-row' })
      row.appendChild(el('div', { class: 'lbl' }, k))
      const trk = el('div', { class: 'track' })
      const fill = el('div', { class: 'fill' })
      fill.style.left = `${lo}%`
      fill.style.width = `${hi - lo}%`
      trk.appendChild(fill)
      row.appendChild(trk)
      row.appendChild(el('div', { class: 'val' }, `${lo}-${hi}`))
      rg.appendChild(row)
    }
    sr.appendChild(rg)
    // Tier
    const tr = el('div', { class: 'tier-row', style: 'margin-top:12px' })
    tr.appendChild(el('span', { class: 'kicker' }, 'POTENTIAL'))
    tr.appendChild(el('span', { class: 'tier' }, report.visible.potentialTier))
    sr.appendChild(tr)
    inner.appendChild(sr)
  }

  // Career history timeline
  const hist = el('div', { class: 'panel', style: 'margin-top:18px' })
  hist.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'CAREER HISTORY')))
  const histBody = el('div', { class: 'panel-body' })
  if (d.history.length === 0) {
    histBody.appendChild(el('div', { class: 'empty-state' }, 'No recorded seasons yet.'))
  } else {
    for (const h of d.history.slice().reverse().slice(0, 6)) {
      const r = el('div', { class: 'stat' })
      r.appendChild(el('span', {}, `S${h.season} ${h.seriesId === 'base.championship.wgp' ? 'WGP' : h.seriesId.split('.').pop()?.toUpperCase()}`))
      r.appendChild(el('span', { class: 'value' }, h.teamId ?? '—'))
      r.appendChild(el('span', { class: 'value' }, `P${h.championshipPosition} · ${h.points}pts · ${h.wins}W`))
      histBody.appendChild(r)
    }
  }
  hist.appendChild(histBody)
  inner.appendChild(hist)

  // Actions
  const actions = el('div', { style: 'display:flex;gap:10px;margin-top:18px' })
  const champ_ = store.champ
  if (champ_) {
    // Watchlist is always available for any driver — the player
    // can track prospects even if they are signed by another
    // organisation. Scout creates the initial report.
    const watchBtn = el('button', { onclick: () => {
      const r = addToWatchlist(champ_, d.id)
      toast(r.added ? `${d.lastName} added to watchlist` : r.reason ?? 'Already on watchlist.')
    } }, '☆ Add to watchlist')
    actions.appendChild(watchBtn)
    if (getReport(champ_, d.id) === undefined) {
      const scoutBtn = el('button', { onclick: () => {
        getReport(champ_, d.id) // creates report
        toast(`Initial scout report on ${d.lastName} ready.`)
      } }, '🔍 Scout')
      actions.appendChild(scoutBtn)
    }
    if (champ_.playerTeamId) {
      const playerTeam = champ_.teams.find((t) => t.id === champ_.playerTeamId)
      if (playerTeam) {
        if (d.academyContract?.teamId === playerTeam.id) {
          actions.appendChild(el('button', { class: 'primary', onclick: () => {
            const r = promoteAcademyToReserve(champ_, d)
            toast(r.ok ? r.reason : r.reason, !r.ok)
            if (r.ok) location.reload()
          } }, 'Promote to Reserve'))
        }
        if (d.reserveContract?.teamId === playerTeam.id) {
          actions.appendChild(el('button', { class: 'primary', onclick: () => {
            const r = promoteToTopTeam(champ_, d)
            toast(r.ok ? r.reason : r.reason, !r.ok)
            if (r.ok) location.reload()
          } }, 'Promote to Race Seat'))
          actions.appendChild(el('button', { class: 'danger', onclick: () => {
            d.reserveContract = undefined
            toast(`${d.lastName} released from reserves.`)
            location.reload()
          } }, 'Release'))
        }
        if (d.academyContract && d.academyContract.teamId !== playerTeam.id) {
          // Feeder driver at another organisation. The player can
          // attempt to poach by offering an academy contract.
          actions.appendChild(el('button', { class: 'primary', onclick: () => {
            const verdict = assessAcademyOffer(d, playerTeam.name, { teamId: playerTeam.id, signedSeason: champ_.config.season, seasonsRemaining: 2, stipendPerSeason: 200 })
            toast(verdict.reason, !verdict.accepted)
            if (verdict.accepted) {
              d.academyContract = { teamId: playerTeam.id, signedSeason: champ_.config.season, seasonsRemaining: 2, stipendPerSeason: 200 }
              location.reload()
            }
          } }, 'Offer Academy Contract'))
        }
      }
    }
  }
  actions.appendChild(el('button', { onclick: () => history.back() }, '← Back'))
  inner.appendChild(actions)

  page.appendChild(inner)
  root.appendChild(page)
}

function concernRow(glyph: string, text: string, kind: 'good' | 'bad' | 'neutral') {
  return el('div', { class: `item ${kind}` },
    el('span', { class: 'glyph' }, glyph),
    el('span', {}, text),
  )
}

/**
 * Top prospects — the public-facing list of the most highly-rated
 * scouted drivers. Shown on the Junior hub, the Drivers menu, and
 * the top HQ widget.
 */
function renderTopProspectsSection(): HTMLElement {
  const block = el('div', { class: 'panel', style: 'margin-top:18px' })
  block.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'TOP PROSPECTS')))
  const body = el('div', { class: 'panel-body' })
  const champ = store.champ
  if (!champ) {
    body.appendChild(el('div', { class: 'empty-state' }, 'No championship loaded.'))
  } else {
    const prospects = getTopProspects(champ, 8)
    if (prospects.length === 0) {
      body.appendChild(el('div', { class: 'empty-state' }, 'No scouted drivers yet. Use Dev tools → Reveal scouting to seed, or sign free agents and scout them.'))
    } else {
      const grid = el('div', { class: 'watchlist-card', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px' })
      for (const p of prospects) {
        const card = el('div', { class: 'prospect-card' })
        card.appendChild(renderHelmet({ id: p.driver.id, name: p.driver.lastName, colors: { primary: 'var(--accent)', secondary: 'var(--text-0)' } }, p.driver.firstName[0], 'sm'))
        const info = el('div', { class: 'prospect-info' })
        info.appendChild(el('span', { class: 'name' }, `${p.driver.firstName[0]}. ${p.driver.lastName}`))
        info.appendChild(el('span', { class: 'meta' }, `${p.driver.age}y · ${p.driver.nationality}`))
        info.appendChild(el('span', { class: 'meta' }, p.series))
        card.appendChild(info)
        const tier = el('div', { class: 'prospect-tier' })
        tier.appendChild(el('span', { class: 'tier', style: `color:${tierBadgeColor(p.tier)}` }, p.tier))
        tier.appendChild(el('span', { class: 'confidence' }, `Scout ${Math.round(p.confidence * 100)}%`))
        card.appendChild(tier)
        card.style.cursor = 'pointer'
        card.addEventListener('click', () => { location.hash = '#/driver/' + p.driver.id })
        grid.appendChild(card)
      }
      body.appendChild(grid)
    }
  }
  block.appendChild(body)
  return block
}

export { renderTopProspectsSection as renderTopProspects }

/**
 * Watchlist screen. Shows all drivers the player is tracking,
 * sorted by addedAt. Each card shows the latest scout assessment.
 */
export function renderWatchlist(root: HTMLElement): void {
  root.innerHTML = ''
  const champ = store.champ
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h1', {}, 'Watchlist'))
  inner.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:14px' }, 'Drivers you are tracking. Funding the scouting department each week tightens the visible ranges.'))

  if (!champ) {
    inner.appendChild(renderEmptyState({ title: 'No championship loaded.' }))
  } else {
    const entries = getWatchlist(champ)
    if (entries.length === 0) {
      inner.appendChild(renderEmptyState({ title: 'Watchlist is empty.', sub: 'Add prospects from the Drivers menu to track their development.' }))
    } else {
      const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px' })
      for (const w of entries) {
        const d = champ.drivers[w.driverId]
        if (!d) continue
        const r = getReport(champ, d.id)
        const card = el('div', { class: 'watchlist-card' })
        card.appendChild(renderHelmet({ id: d.id, name: d.lastName, colors: { primary: 'var(--accent)', secondary: 'var(--text-0)' } }, d.firstName[0], 'sm'))
        const info = el('div', { class: 'prospect-info' })
        info.appendChild(el('span', { class: 'name' }, `${d.firstName[0]}. ${d.lastName}`))
        info.appendChild(el('span', { class: 'meta' }, `${d.age}y · ${d.nationality} · ${d.gender}`))
        if (r) info.appendChild(el('span', { class: 'meta' }, `Scout ${Math.round(r.confidence * 100)}% · ${r.visible.potentialTier}`))
        card.appendChild(info)
        const actions = el('div', { class: 'actions' })
        actions.appendChild(el('button', { class: 'small', onclick: () => { location.hash = '#/driver/' + d.id } }, 'View'))
        actions.appendChild(el('button', { class: 'small danger', onclick: () => {
          removeFromWatchlist(champ, d.id)
          toast(`${d.lastName} removed from watchlist.`)
          renderWatchlist(root)
        } }, 'Remove'))
        card.appendChild(actions)
        grid.appendChild(card)
      }
      inner.appendChild(grid)
    }
  }
  page.appendChild(inner)
  root.appendChild(page)
}

/**
 * Driver Academy screen. Shows the player's academy slots, current
 * members, and signs new prospects into open slots.
 */
export function renderAcademy(root: HTMLElement): void {
  root.innerHTML = ''
  const champ = store.champ
  if (!champ) { root.appendChild(renderEmptyState({ title: 'No championship loaded.' })); return }
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h1', {}, 'Driver Academy'))
  inner.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:14px' }, 'A limited pool of slots. Higher-level facilities expand capacity. Sign promising juniors and promote them into a reserve role.'))

  const team = champ.teams.find((t) => t.id === champ.playerTeamId)
  if (!team) {
    inner.appendChild(renderEmptyState({ title: 'No player team.' }))
    page.appendChild(inner)
    root.appendChild(page)
    return
  }
  const slots = academySlotsFor(team)
  inner.appendChild(el('div', { class: 'kicker' }, `SLOTS · ${usedAcademySlots(champ) + 0} / ${slots}`))
  const grid = el('div', { class: 'academy-grid' })
  for (const m of academyMembers(champ, team.id)) {
    grid.appendChild(renderAcademyMember(champ, m, slots, root))
  }
  while (grid.children.length < slots) {
    grid.appendChild(renderAcademyEmpty())
  }
  inner.appendChild(grid)
  page.appendChild(inner)
  root.appendChild(page)
}

function academySlotsFor(_team: Team): number {
  // Approximation; the real value depends on the team's facility
  // levels. We use a simple cap here that the real career loop
  // can refine in a follow-up.
  return 5
}

function usedAcademySlots(champ: Championship): number {
  let n = 0
  for (const d of Object.values(champ.drivers)) {
    if (d.academyContract?.teamId === champ.playerTeamId) n++
  }
  return n
}

function academyMembers(champ: Championship, teamId: string): Driver[] {
  return Object.values(champ.drivers).filter((d) => d.academyContract?.teamId === teamId)
}

function renderAcademyMember(champ: Championship, d: Driver, _slots: number, root: HTMLElement): HTMLElement {
  const card = el('div', { class: 'academy-slot' })
  const head = el('div', { style: 'display:flex;align-items:center;gap:12px' })
  head.appendChild(renderHelmet({ id: d.id, name: d.lastName, colors: { primary: 'var(--accent)', secondary: 'var(--text-0)' } }, d.firstName[0], 'sm'))
  const info = el('div', { class: 'prospect-info' })
  info.appendChild(el('span', { class: 'name' }, `${d.firstName[0]}. ${d.lastName}`))
  info.appendChild(el('span', { class: 'meta' }, `${d.age}y · ${d.gender} · PACE ${d.visible.pace}`))
  head.appendChild(info)
  card.appendChild(head)
  card.appendChild(el('div', { class: 'slot-meta' }, `Contract: ${d.academyContract?.seasonsRemaining ?? 0} seasons`))
  card.appendChild(el('div', { class: 'slot-meta' }, `Stipend: ${d.academyContract?.stipendPerSeason ?? 0}/yr`))
  const actions = el('div', { style: 'display:flex;gap:8px;margin-top:6px' })
  actions.appendChild(el('button', { class: 'small primary', onclick: () => {
    const r = promoteAcademyToReserve(champ, d)
    toast(r.ok ? r.reason : r.reason, !r.ok)
    if (r.ok) renderAcademy(root)
  } }, 'Promote → Reserve'))
  actions.appendChild(el('button', { class: 'small danger', onclick: () => {
    d.academyContract = undefined
    toast(`${d.lastName} released from academy.`)
    renderAcademy(root)
  } }, 'Release'))
  card.appendChild(actions)
  return card
}

function renderAcademyEmpty(): HTMLElement {
  const card = el('div', { class: 'academy-slot empty' })
  card.appendChild(el('div', { class: 'slot-label' }, 'EMPTY SLOT'))
  card.appendChild(el('div', { class: 'slot-meta' }, 'Sign a prospect to fill this slot.'))
  return card
}

/**
 * Driver market: unified entry point. Shows tabs for RACE DRIVERS,
 * RESERVES, FREE AGENTS, JUNIOR SERIES, WATCHLIST and DRIVER
 * ACADEMY.
 */
export function renderDriverMarket(root: HTMLElement, _tab: string): void {
  // The Driver market has six tabs. For the P1 pass we keep the
  // architecture simple — every tab renders the same shell and
  // delegates to a sub-renderer. Each tab lives at its own hash so
  // the URLs are stable.
  const tab = (_tab || 'race').toLowerCase()
  if (tab === 'junior') { renderJuniorHub(root); return }
  if (tab === 'watchlist') { renderWatchlist(root); return }
  if (tab === 'academy') { renderAcademy(root); return }
  if (tab === 'reserves') {
    root.innerHTML = ''
    const inner = el('div', { class: 'page-inner' })
    inner.appendChild(el('h1', {}, 'Reserve Drivers'))
    const champ = store.champ
    if (champ) {
      const reserves = Object.values(champ.drivers).filter((d) => d.reserveContract?.teamId === champ.playerTeamId)
      if (reserves.length === 0) {
        inner.appendChild(renderEmptyState({ title: 'No reserve drivers in your org.' }))
      } else {
        for (const d of reserves) inner.appendChild(renderReserveCard(champ, d))
      }
    }
    const p = el('div', { class: 'page' })
    p.appendChild(inner)
    root.appendChild(p)
    return
  }
  // Race drivers and free agents share a generic list view
  root.innerHTML = ''
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h1', {}, tab === 'free' ? 'Free Agents' : 'Race Drivers'))
  const champ = store.champ
  if (!champ) {
    inner.appendChild(renderEmptyState({ title: 'No championship loaded.' }))
  } else {
    const drivers = Object.values(champ.drivers)
    const filtered = tab === 'free'
      ? drivers.filter((d) => !d.contract && !d.reserveContract && !d.academyContract)
      : drivers.filter((d) => d.contract?.teamId === champ.playerTeamId)
    if (filtered.length === 0) {
      inner.appendChild(renderEmptyState({ title: tab === 'free' ? 'No free agents available.' : 'No race drivers in your team.' }))
    } else {
      const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px' })
      for (const d of filtered) grid.appendChild(renderDriverPreviewCard(champ, d))
      inner.appendChild(grid)
    }
  }
  const p = el('div', { class: 'page' })
  p.appendChild(inner)
  root.appendChild(p)
}

function renderReserveCard(champ: Championship, d: Driver): HTMLElement {
  const card = el('div', { class: 'driver-card' })
  card.appendChild(renderHelmet({ id: d.id, name: d.lastName, colors: { primary: 'var(--accent)', secondary: 'var(--text-0)' } }, d.firstName[0], 'sm'))
  const info = el('div', { class: 'prospect-info' })
  info.appendChild(el('span', { class: 'name' }, `${d.firstName[0]}. ${d.lastName}`))
  info.appendChild(el('span', { class: 'meta' }, `RESERVE · expires S${(d.reserveContract?.signedSeason ?? 0) + (d.reserveContract?.seasonsRemaining ?? 0)}`))
  card.appendChild(info)
  const actions = el('div', { style: 'display:flex;gap:8px;margin-top:6px' })
  actions.appendChild(el('button', { class: 'small primary', onclick: () => {
    const r = promoteToTopTeam(champ, d)
    toast(r.ok ? r.reason : r.reason, !r.ok)
  } }, 'Promote → Race Seat'))
  actions.appendChild(el('button', { class: 'small danger', onclick: () => {
    d.reserveContract = undefined
    toast(`${d.lastName} released from reserves.`)
  } }, 'Release'))
  card.appendChild(actions)
  return card
}

function renderDriverPreviewCard(_champ: Championship, d: Driver): HTMLElement {
  const card = el('div', { class: 'driver-card', style: 'cursor:pointer' })
  card.addEventListener('click', () => { location.hash = '#/driver/' + d.id })
  card.appendChild(renderHelmet({ id: d.id, name: d.lastName, colors: { primary: 'var(--accent)', secondary: 'var(--text-0)' } }, d.firstName[0], 'sm'))
  const info = el('div', { class: 'prospect-info' })
  info.appendChild(el('span', { class: 'name' }, `${d.firstName[0]}. ${d.lastName}`))
  info.appendChild(el('span', { class: 'meta' }, `${d.age}y · ${d.nationality} · PACE ${d.visible.pace}`))
  card.appendChild(info)
  return card
}
