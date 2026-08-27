import { el } from './dom'
import { store } from '../state/store'
import { renderHelmet } from './renderers'
import { iconTrophy } from './icons'
import type { Championship } from '../core/types'

/**
 * Standings screen — P1 redesign.
 *
 * Drivers' championship and Constructors' championship with team
 * colour identity, position deltas, and a TITLE BATTLE card at
 * the top showing the gap between the top three drivers.
 */
export function renderStandings(root: HTMLElement) {
  const { champ, engine } = store
  if (!champ || !engine) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  const st = engine.standings()
  inner.appendChild(el('h1', {}, `Season ${champ.config.season} Standings`))

  // --- Title battle card ---
  if (st.driverRows.length >= 3) {
    const a = st.driverRows[0], b = st.driverRows[1], c = st.driverRows[2]
    const ad = champ.drivers[a.driverId], bd = champ.drivers[b.driverId], cd = champ.drivers[c.driverId]
    const at = champ.teams.find((t) => t.id === ad?.contract?.teamId)
    const bt = champ.teams.find((t) => t.id === bd?.contract?.teamId)
    const ct = champ.teams.find((t) => t.id === cd?.contract?.teamId)
    const battle = el('div', { class: 'title-battle' })
    battle.appendChild(el('div', { class: 'kicker' }, 'TITLE BATTLE · TOP 3'))
    const board = el('div', { class: 'leaderboard' })
    const rows = [
      { pos: 1, drv: ad, team: at, pts: a.points },
      { pos: 2, drv: bd, team: bt, pts: b.points },
      { pos: 3, drv: cd, team: ct, pts: c.points },
    ]
    for (const r of rows) {
      const row = el('div', { class: 'row' })
      row.appendChild(el('div', { class: `pos p${r.pos}` }, String(r.pos)))
      const name = el('div', { class: 'name' })
      if (r.drv && r.team) {
        name.appendChild(renderHelmet({ id: r.team.id, name: r.team.name, colors: r.team.colors }, r.drv.id.slice(-2), 'sm'))
        const info = el('div', { style: 'display:flex;flex-direction:column;min-width:0' })
        info.appendChild(el('span', {}, `${r.drv.firstName[0]}. ${r.drv.lastName}`))
        info.appendChild(el('span', { style: 'font-size:10px;color:var(--text-2)' }, r.team.shortName))
        name.appendChild(info)
      } else {
        name.appendChild(el('span', {}, r.drv?.lastName ?? '—'))
      }
      row.appendChild(name)
      row.appendChild(el('div', { class: 'pts' }, String(r.pts)))
      board.appendChild(row)
    }
    battle.appendChild(board)
    const gap = a.points - b.points
    battle.appendChild(el('div', { class: 'gap-line' }, `${gap} pts covers the top 2`))
    inner.appendChild(battle)
  }

  // --- Drivers' championship table ---
  const driversPanel = el('div', { class: 'panel' })
  driversPanel.appendChild(el('div', { class: 'panel-head' },
    el('h3', {}, 'Drivers Championship')))
  const driversBody = el('div', { class: 'panel-body' })
  driversBody.appendChild(buildDriverTable(champ, st.driverRows))
  driversPanel.appendChild(driversBody)
  inner.appendChild(driversPanel)

  // --- Constructors' championship table ---
  const teamsPanel = el('div', { class: 'panel' })
  teamsPanel.appendChild(el('div', { class: 'panel-head' },
    el('h3', {}, 'Constructors Championship')))
  const teamsBody = el('div', { class: 'panel-body' })
  teamsBody.appendChild(buildConstructorTable(champ, st.teamRows))
  teamsPanel.appendChild(teamsBody)
  inner.appendChild(teamsPanel)

  // --- History ---
  const historyCard = el('div', { class: 'panel' })
  historyCard.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'Past Champions')))
  const historyBody = el('div', { class: 'panel-body' })
  if (champ.history.length === 0) {
    historyBody.appendChild(el('div', { class: 'empty-state' }, 'First season in progress.'))
  } else {
    for (const h of champ.history.slice().reverse()) {
      const team = champ.teams.find((t) => t.id === h.championTeamId)
      const driver = champ.drivers[h.championDriverId]
      const row = el('div', { class: 'stat' },
        el('span', {}, `Season ${h.season}`),
        el('span', { class: 'value' },
          `${team?.name ?? '?'} · ${driver?.lastName ?? h.championDriverId}`),
      )
      historyBody.appendChild(row)
    }
  }
  historyCard.appendChild(historyBody)
  inner.appendChild(historyCard)

  page.appendChild(inner)
  root.appendChild(page)
}

function buildDriverTable(champ: Championship, rows: Array<{ driverId: string; points: number; wins: number }>): HTMLElement {
  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, '#'),
      el('th', {}, 'Driver'),
      el('th', {}, 'Team'),
      el('th', { class: 'num' }, 'Wins'),
      el('th', { class: 'num' }, 'Points'),
    )),
  )
  const tb = el('tbody', {})
  rows.forEach((r, i) => {
    const d = champ.drivers[r.driverId]
    const team = champ.teams.find((t) => t.id === d?.contract?.teamId)
    const isMe = team?.id === champ.playerTeamId
    const tr = el('tr', { class: isMe ? 'me' : '' },
      el('td', { class: 'num' }, String(i + 1)),
      el('td', {},
        el('div', { style: 'display:flex;align-items:center;gap:8px' },
          team ? renderHelmet({ id: team.id, name: team.name, colors: team.colors }, d?.id.slice(-2) ?? '?', 'sm') : null,
          el('div', {},
            el('div', { style: 'font-weight:600' }, d ? `${d.firstName[0]}. ${d.lastName}` : r.driverId),
            el('div', { style: 'font-size:11px;color:var(--text-2)' }, d?.nationality ?? ''),
          ),
        ),
      ),
      el('td', {},
        team ? [el('span', { style: 'display:inline-block;width:10px;height:10px;border-radius:2px;background:' + team.colors.primary + ';margin-right:6px' }), team.shortName] : '—',
      ),
      el('td', { class: 'num' }, String(r.wins)),
      el('td', { class: 'num', style: 'font-weight:700' }, String(r.points)),
    )
    tb.appendChild(tr)
  })
  table.appendChild(tb)
  return table
}

function buildConstructorTable(champ: Championship, rows: Array<{ teamId: string; points: number; wins: number }>): HTMLElement {
  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, '#'),
      el('th', {}, 'Team'),
      el('th', { class: 'num' }, 'Wins'),
      el('th', { class: 'num' }, 'Points'),
    )),
  )
  const tb = el('tbody', {})
  rows.forEach((r, i) => {
    const team = champ.teams.find((t) => t.id === r.teamId)
    if (!team) return
    const isMe = team.id === champ.playerTeamId
    const tr = el('tr', { class: isMe ? 'me' : '' },
      el('td', { class: 'num' }, String(i + 1)),
      el('td', {},
        el('div', { style: 'display:flex;align-items:center;gap:8px' },
          el('span', { style: 'display:inline-block;width:14px;height:14px;border-radius:3px;background:' + team.colors.primary }),
          el('span', { style: 'font-weight:600' }, team.name),
        ),
      ),
      el('td', { class: 'num' }, String(r.wins)),
      el('td', { class: 'num', style: 'font-weight:700' }, String(r.points)),
    )
    tb.appendChild(tr)
  })
  table.appendChild(tb)
  return table
}

// satisfy linter
void iconTrophy
