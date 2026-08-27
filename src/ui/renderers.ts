import { el } from './dom'
import type { Driver } from '../core/types'

/**
 * Reusable rendering helpers for the game design system. These wrap
 * the design-system primitives so per-screen templates stay small
 * and consistent.
 *
 * All helpers return HTMLElement. They take data, never state.
 */

export interface TeamLike { id: string; name: string; colors: { primary: string; secondary: string } }

/** .helmet with team-themed base, stripe and number */
export function renderHelmet(team: TeamLike, number: number | string, size: 'sm' | 'md' | 'lg' = 'md') {
  const cssSize = size === 'sm' ? '' : size === 'lg' ? 'lg' : ''
  const helmet = el('div', { class: `helmet ${cssSize}`.trim() })
  ;(helmet as HTMLElement).style.setProperty('--helmet-base', team.colors.primary)
  ;(helmet as HTMLElement).style.setProperty('--helmet-stripe', team.colors.secondary)
  ;(helmet as HTMLElement).style.setProperty('--helmet-text', pickTextColor(team.colors.primary))
  helmet.innerHTML = `<span class="helmet-number">${number}</span>`
  return helmet
}

/** .team-mark with team colour block, optional size class */
export function renderTeamMark(team: TeamLike, size: 'sm' | 'md' | 'lg' = 'md') {
  const sizeCls = size === 'sm' ? '' : size === 'lg' ? 'team-mark-xl' : 'team-mark-lg'
  const wrap = el('div', { class: `team-mark ${sizeCls}`.trim() })
  ;(wrap as HTMLElement).style.setProperty('--team-color', team.colors.primary)
  ;(wrap as HTMLElement).style.setProperty('--team-color-text', pickTextColor(team.colors.primary))
  wrap.textContent = team.name.slice(0, 2).toUpperCase()
  return wrap
}

/** Full driver identity: helmet + name + team-mark + stripe */
export function renderDriverIdentity(opts: { driver: Driver; team: TeamLike; number: number; showTeam?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const { driver, team, number, showTeam = true, size = 'md' } = opts
  const wrap = el('div', { class: 'driver-identity', style: 'display:flex;align-items:center;gap:10px' })
  wrap.appendChild(renderHelmet(team, number, size))
  const text = el('div', { style: 'display:flex;flex-direction:column;min-width:0' })
  const name = el('div', { class: 'display' })
  name.style.cssText = 'font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
  name.textContent = `${driver.firstName[0]}. ${driver.lastName}`
  text.appendChild(name)
  if (showTeam) {
    const sub = el('div', { style: 'font-size:11px;color:var(--text-2);display:flex;align-items:center;gap:6px' })
    sub.appendChild(renderTeamMark(team, 'sm'))
    sub.appendChild(el('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, team.name))
    text.appendChild(sub)
  }
  wrap.appendChild(text)
  return wrap
}

/** .mini-tile stat block */
export function renderKpiTile(label: string, value: string, sub?: string) {
  return el('div', { class: 'mini-tile' },
    el('div', { class: 'k' }, label),
    el('div', { class: 'v' }, value),
    sub ? el('div', { style: 'font-size:11px;color:var(--text-2);margin-top:2px' }, sub) : null,
  )
}

/** .event-header for race weekend */
export function renderEventHeader(opts: { eyebrow: string; title: string; sub: string; side: HTMLElement; circuitSvg?: string }) {
  const head = el('div', { class: 'event-header' })
  const left = el('div', {})
  left.appendChild(el('div', { class: 'event-eyebrow' }, opts.eyebrow))
  left.appendChild(el('div', { class: 'event-title' }, opts.title))
  left.appendChild(el('div', { class: 'event-sub' }, opts.sub))
  head.appendChild(left)
  const side = el('div', { class: 'event-side' })
  if (opts.circuitSvg) {
    const thumb = el('div', { class: 'circuit-thumb' })
    thumb.innerHTML = opts.circuitSvg
    side.appendChild(thumb)
  }
  side.appendChild(opts.side)
  head.appendChild(side)
  return head
}

/** .state-message empty / loading state */
export function renderEmptyState(opts: { title: string; sub?: string; kind?: 'empty' | 'loading' }) {
  const box = el('div', { class: 'state-message' })
  if (opts.kind !== 'empty') {
    box.appendChild(el('div', { class: 'state-pulse' }))
  }
  box.appendChild(el('div', { class: 'state-title' }, opts.title))
  if (opts.sub) box.appendChild(el('div', { class: 'state-sub' }, opts.sub))
  return box
}

/** .team-bar (4px vertical bar) */
export function renderTeamBar(team: TeamLike) {
  const bar = el('span', { class: 'team-bar' })
  ;(bar as HTMLElement).style.setProperty('--team-color', team.colors.primary)
  return bar
}

/** .badge with optional kind */
export function renderBadge(text: string, kind?: 'gold' | 'silver' | 'bronze' | 'red' | 'green' | 'yellow' | 'blue' | 'grey') {
  return el('span', { class: `badge ${kind ?? ''}`.trim() }, text)
}

/** Pick a readable text colour for a given background */
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
