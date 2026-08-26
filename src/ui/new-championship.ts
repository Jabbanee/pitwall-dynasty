import { el, toast } from './dom'
import { store } from '../state/store'
import { createChampionship } from '../championship/create'
import { START_YEARS } from '../regulations/regulations'
import type { Championship } from '../core/types'

/** Championship creation screen (Fast Championship / Career configuration). */

export function renderNewChampionship(root: HTMLElement, mode: Championship['mode']) {
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner', style: 'max-width:760px' })

  inner.appendChild(el('h2', {}, mode === 'career' ? 'New Solo Career' : 'New Fast Championship'))

  const form = el('div', { class: 'card' }, el('div', { class: 'card-body' }))
  const body = form.querySelector('.card-body')!

  let teamCount = 10
  let races = mode === 'career' ? 10 : 5
  let mgmtSeconds = mode === 'career' ? 600 : 180
  let weather = true
  let equalTeams = false
  let teamName = ''
  let careerKind: 'fictional' | 'real' = 'fictional'
  let eraYear = 2022

  const rebuild = () => {
    body.innerHTML = ''
    const careerFields: Array<Node> = mode === 'career'
      ? [
          field('Career type',
            segmented2([
              { value: 'fictional', label: 'Fictional Career', desc: 'Emergent alternate history — anything can happen' },
              { value: 'real', label: 'Real Career', desc: 'Historical shadow timeline — eras follow real-world trends' },
            ], careerKind, (v) => { careerKind = v as 'fictional' | 'real'; rebuild() })),
          field('Starting era',
            selectEra(eraYear, (v) => { eraYear = v })),
        ]
      : []
    body.append(
      ...careerFields,
      field('Your team name (optional)', inputText(teamName, (v) => (teamName = v), 'e.g. Falcon Apex Racing')),
      field('Number of teams', slider(4, 11, teamCount, (v) => (teamCount = v))),
      field('Races in season', slider(2, 16, races, (v) => (races = v))),
      field(mode === 'career' ? 'Management time per round' : 'Management phase length', slider(30, 900, mgmtSeconds, (v) => (mgmtSeconds = v), 's')),
      field('Weather', toggle(weather, (v) => (weather = v))),
      field('Equal performance teams', toggle(equalTeams, (v) => (equalTeams = v))),
    )
  }
  rebuild()

  inner.appendChild(form)
  inner.appendChild(
    el('div', { style: 'display:flex;gap:10px;justify-content:flex-end' },
      el('button', { onclick: () => (location.hash = '#/') }, 'Back'),
      el('button',
        {
          class: 'primary',
          onclick: () => {
            if (teamCount < 4 || races < 1) return
            const champ = createChampionship(
              mode,
              mode === 'career' ? `${teamName || 'My'} Career` : 'Fast Championship',
              {
                numberOfRaces: Math.min(races, 20),
                managementPhaseSeconds: mgmtSeconds,
                weatherEnabled: weather,
                equalTeams,
              },
              {
                playerTeamIndex: -1,
                teamCount,
                createTeamName: teamName.trim() || undefined,
                seed: (Date.now() & 0x7fffffff) >>> 0,
              },
            )
            if (!teamName.trim() && champ.playerTeamId === undefined) {
              // no custom name — give the first team to the player
              champ.teams[0].isPlayerControlled = true
              champ.playerTeamId = champ.teams[0].id
              champ.teams[0].name = 'Your Racing Team'
              champ.teams[0].shortName = 'YOU'
            }
            if (mode === 'career') champ.name = `${champ.teams.find((t) => t.isPlayerControlled)?.name ?? 'My'} Career`
            store.setChampionship(champ)
            toast(`${mode === 'career' ? 'Career' : 'Championship'} created. Good luck.`)
            location.hash = '#/hq'
          },
        },
        'Start'),
    ),
  )

  page.appendChild(inner)
  root.appendChild(page)

  function field(label: string, control: HTMLElement) {
    const row = el('div', { class: 'slider-row' })
    row.appendChild(el('span', { class: 'slabel' }, label))
    row.appendChild(control)
    return row
  }
}

function inputText(value: string, onChange: (v: string) => void, placeholder?: string): HTMLElement {
  const inp = el('input', { type: 'text', placeholder: placeholder ?? '' }) as HTMLInputElement
  inp.value = value
  inp.addEventListener('input', () => onChange(inp.value))
  return inp.parentElement ?? wrap(inp)
}
function wrap(node: HTMLElement) {
  const d = document.createElement('div')
  d.appendChild(node)
  return d
}

function slider(min: number, max: number, value: number, onChange: (v: number) => void, unit = ''): HTMLElement {
  const box = document.createElement('div')
  box.style.display = 'flex'
  box.style.alignItems = 'center'
  box.style.gap = '12px'
  const inp = el('input', { type: 'range', min, max, value }) as HTMLInputElement
  const val = el('span', { class: 'sval mono' }, `${value}${unit}`)
  inp.addEventListener('input', () => {
    val.textContent = `${inp.value}${unit}`
    onChange(Number(inp.value))
  })
  box.append(inp, val)
  return box
}

function toggle(value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const group = el('div', { class: 'seg-group' })
  const onBtn = el('button', { class: value ? 'selected' : '', onclick: () => { onChange(true); refresh() } }, 'On')
  const offBtn = el('button', { class: !value ? 'selected' : '', onclick: () => { onChange(false); refresh() } }, 'Off')
  function refresh() {
    onBtn.className = value ? 'selected' : ''
    offBtn.className = !value ? 'selected' : ''
  }
  group.append(onBtn, offBtn)
  return group
}

interface SegOption { value: string; label: string; desc: string }

function segmented2(options: SegOption[], current: string, onChange: (v: string) => void): HTMLElement {
  const box = document.createElement('div')
  box.style.display = 'flex'
  box.style.flexDirection = 'column'
  box.style.gap = '6px'
  for (const opt of options) {
    const card = el('button', {
      class: `menu-card${opt.value === current ? ' era-selected' : ''}`,
      style: 'width:100%;padding:12px 16px',
      onclick: () => onChange(opt.value),
    },
      el('h3', { style: 'font-size:13px;margin-bottom:4px' }, opt.label),
      el('p', { style: 'font-size:11px' }, opt.desc),
    )
    box.appendChild(card)
  }
  return box
}

function selectEra(current: number, onChange: (v: number) => void): HTMLElement {
  const sel = el('select') as HTMLSelectElement
  for (const era of START_YEARS) {
    const opt = el('option', { value: era.year }, `${era.year} — ${era.eraName}`) as HTMLOptionElement
    if (era.year === current) opt.selected = true
    sel.appendChild(opt)
  }
  sel.addEventListener('change', () => onChange(Number(sel.value)))
  return sel
}
