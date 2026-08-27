import { el, money } from './dom'
import { store } from '../state/store'
import { SPONSORS } from '../core/content'
import { renderKpiTile, renderEmptyState } from './renderers'
import { iconNewspaper, iconTrophy, iconCar } from './icons'
import type { SponsorContract } from '../core/types'

/**
 * Sponsors screen — P1 redesign.
 *
 * Sponsors are grouped into TITLE PARTNER / MAJOR / TECHNICAL
 * tiers. Each sponsor uses the fictional wordmark + colour from
 * the SPONSORS catalog. Each card shows payment, contract
 * remaining, expectations and position bonus.
 */
const TIER_BY_VALUE: Array<{ min: number; label: 'TITLE PARTNER' | 'MAJOR' | 'TECHNICAL' }> = [
  { min: 8000, label: 'TITLE PARTNER' },
  { min: 4000, label: 'MAJOR' },
  { min: 0, label: 'TECHNICAL' },
]

const SPONSOR_COLOR: Record<string, string> = {
  'base.sponsor.hyperion': '#2a6df4',
  'base.sponsor.vortexfuel': '#d4a017',
  'base.sponsor.kage': '#0a0e14',
  'base.sponsor.lattice': '#2bb673',
  'base.sponsor.novasync': '#e63946',
  'base.sponsor.fourthpillar': '#c5cbd1',
  'base.sponsor.atlasforge': '#85471f',
  'base.sponsor.brightline': '#3a6fa6',
  'base.sponsor.orbital': '#6da7d6',
  'base.sponsor.cipher': '#5a6675',
  'base.sponsor.solstice': '#f0c14b',
  'base.sponsor.keryx': '#4ea1ff',
}

function sponsorVisual(id: string): { color: string; textColor: string; shortName: string } {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const color = SPONSOR_COLOR[id] ?? `hsl(${h % 360}, 55%, 35%)`
  const textColor = '#fff'
  const last = id.split('.').pop() ?? id
  const shortName = last.replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase() || 'SPNS'
  return { color, textColor, shortName }
}

export function renderSponsors(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  const team = store.playerTeam!
  inner.appendChild(el('h1', {}, 'Sponsors'))

  const owned = team.sponsors
  if (owned.length === 0) {
    inner.appendChild(renderEmptyState({ title: 'No sponsors yet.', sub: 'Negotiate sponsor deals to fund the team.' }))
  } else {
    // Total / race KPI
    const total = owned.reduce((s, x) => s + x.basePaymentPerRace, 0)
    const kpis = el('div', { class: 'mini-tiles' })
    kpis.appendChild(renderKpiTile('Active sponsors', String(owned.length), 'across all tiers'))
    kpis.appendChild(renderKpiTile('Income / race', money(total)))
    kpis.appendChild(renderKpiTile('Avg. position bonus', money(Math.round(owned.reduce((s, x) => s + x.positionBonus, 0) / owned.length))))
    inner.appendChild(kpis)

    // Tier sections
    for (const tier of ['TITLE PARTNER', 'MAJOR', 'TECHNICAL'] as const) {
      const tierList = owned.filter((sc) => tierFor(sc) === tier)
      if (tierList.length === 0) continue
      const tierPanel = el('div', { class: 'panel' })
      tierPanel.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, `${tier} · ${tierList.length}`)))
      const body = el('div', { class: 'panel-body' })
      const grid = el('div', { class: 'sponsor-tier' })
      const tierGrid = el('div', { class: 'tier-grid' + (tier === 'TITLE PARTNER' ? ' cols-1' : tier === 'MAJOR' ? ' cols-2' : '') })
      for (const sc of tierList) tierGrid.appendChild(renderSponsorCard(sc))
      grid.appendChild(tierGrid)
      body.appendChild(grid)
      tierPanel.appendChild(body)
      inner.appendChild(tierPanel)
    }
  }

  page.appendChild(inner)
  root.appendChild(page)
}

function tierFor(sc: SponsorContract): 'TITLE PARTNER' | 'MAJOR' | 'TECHNICAL' {
  for (const t of TIER_BY_VALUE) {
    if (sc.basePaymentPerRace >= t.min) return t.label
  }
  return 'TECHNICAL'
}

function renderSponsorCard(sc: SponsorContract): HTMLElement {
  const sp = SPONSORS.find((s) => s.id === sc.sponsorId)
  const vis = sponsorVisual(sc.sponsorId)
  const card = el('div', { class: 'sponsor' })
  ;(card as HTMLElement).style.cssText = `--sponsor-color:${vis.color};--sponsor-text:${vis.textColor};`
  const mark = el('div', { class: 'sponsor-mark' }, vis.shortName)
  card.appendChild(mark)
  const info = el('div', { class: 'sponsor-info' })
  info.appendChild(el('div', { class: 'name' }, sp?.name ?? 'Unknown sponsor'))
  info.appendChild(el('div', { class: 'meta' }, `${sp?.industry ?? '—'} · ${sc.seasonsRemaining} season${sc.seasonsRemaining === 1 ? '' : 's'} left`))
  const expectations = el('div', { class: 'meta' })
  expectations.appendChild(el('span', {}, `Expectation: P${sc.expectationPosition} or better`))
  info.appendChild(expectations)
  card.appendChild(info)
  const payment = el('div', { class: 'payment' })
  payment.appendChild(el('div', { style: 'font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.1em' }, 'Per race'))
  payment.appendChild(el('div', {}, money(sc.basePaymentPerRace)))
  payment.appendChild(el('div', { style: 'font-size:10px;color:var(--good);margin-top:2px' }, `+${money(sc.positionBonus)} pos`))
  card.appendChild(payment)
  return card
}

void iconNewspaper; void iconTrophy; void iconCar
