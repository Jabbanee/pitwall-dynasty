import { el } from './dom'
import { store } from '../state/store'
import { createChampionship } from '../championship/create'
import type { Championship } from '../core/types'

/** Main menu / hero screen with Quick Start. */

export function renderMenu(root: HTMLElement) {
  root.innerHTML = ''

  const hero = el('div', { class: 'hero' },
    el('h1', {}, 'PITWALL ', el('span', {}, 'DYNASTY')),
    el('div', { class: 'tagline' },
      'Build your racing team against your friends. Lock in your decisions. Then watch them play out on track — together, on a shared broadcast.'),
    el('div', { class: 'menu-cards' },
      menuCard('Quick Start', 'Jump straight into a Fast Championship: 10 teams, 5 rounds, you vs the AI paddock.', () => quickStart()),
      menuCard('Fast Championship', 'Configure teams, races, timers and rules for one shared session.', () => openChampConfig('fast')),
      menuCard('Solo Career', 'Multiple seasons, driver market, facilities and development — at your own pace.', () => openChampConfig('career')),
    ),
    el('div', { class: 'menu-cards' },
      el('button', { class: 'ghost', onclick: () => tryContinue(root) }, hasSaveLabel()),
    ),
  )
  root.appendChild(hero)
}

function hasSaveLabel(): string {
  return store.champ ? 'Return to current championship' : (localStorage.getItem('pitwall-dynasty.save') ? 'Continue from save' : '')
}

function menuCard(title: string, desc: string, onClick: () => void) {
  return el('button', { class: 'menu-card', onclick: onClick },
    el('h3', {}, title),
    el('p', {}, desc),
  )
}

function quickStart() {
  const champ = createChampionship(
    'fast',
    'Quick Start Championship',
    { numberOfRaces: 5, managementPhaseSeconds: 180 },
    { playerTeamIndex: 0, teamCount: 10, seed: (Date.now() & 0x7fffffff) >>> 0 },
  )
  champ.teams[0].name = 'Your Racing Team'
  champ.teams[0].shortName = 'YOU'
  champ.teams[0].colors = { primary: '#e8443a', secondary: '#ffffff' }
  store.setChampionship(champ)
  location.hash = '#/hq'
}

function openChampConfig(mode: Championship['mode']) {
  location.hash = '#/new/' + mode
}

function tryContinue(_root: HTMLElement) {
  if (store.champ) {
    location.hash = '#/hq'
    return
  }
  if (!store.tryLoadSave()) {
    // nothing to load
  } else {
    location.hash = '#/hq'
  }
}
