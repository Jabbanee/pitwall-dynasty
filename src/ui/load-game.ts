// Load Game — list existing saves and let the player pick one.
// Uses the platform SaveRepository (file-backed on desktop,
// localStorage-backed in browser dev).

import { el, toast } from './dom'
import { store } from '../state/store'
import { getSaveRepository, isDesktopEnvironment } from '../platform/persistence'
import { deserializeSave } from '../state/persistence'
import { renderMenu } from './menu'
import { iconCheckered } from './icons'
import type { SaveMeta } from '../platform/persistence'

export function renderLoadGame(root: HTMLElement) {
  root.innerHTML = ''

  const page = el('div', { class: 'page page-load' })
  const inner = el('div', { class: 'page-inner' })
  const head = el('div', { class: 'load-head' })
  head.appendChild(el('h1', {}, 'Load Game'))
  head.appendChild(el('p', { class: 'kicker' }, isDesktopEnvironment() ? 'Saves are stored under %APPDATA%\\Pitwall Dynasty\\saves\\' : 'Saves are stored in this browser\u2019s local storage.'))
  inner.appendChild(head)

  const list = el('div', { class: 'load-list' })
  inner.appendChild(list)

  const nav = el('div', { class: 'load-nav' })
  const back = el('button', { onclick: () => renderMenu(root) }, '← Back to Main Menu')
  nav.appendChild(back)
  inner.appendChild(nav)

  page.appendChild(inner)
  root.appendChild(page)

  void (async () => {
    let saves: SaveMeta[] = []
    try {
      saves = await getSaveRepository().list()
    } catch (e) {
      list.appendChild(el('div', { class: 'empty-state' }, `Could not read saves: ${(e as Error).message}`))
      return
    }
    if (!saves.length) {
      list.appendChild(el('div', { class: 'empty-state' }, 'No saves found. Start a new championship from the main menu.'))
      return
    }
    for (const save of saves) {
      list.appendChild(renderSaveRow(root, save))
    }
  })()
}

function renderSaveRow(root: HTMLElement, save: SaveMeta): HTMLElement {
  const card = el('div', { class: 'load-row' })
  const icon = el('div', { class: 'load-row-icon', html: iconCheckered(20) })
  card.appendChild(icon)
  const info = el('div', { class: 'load-row-info' })
  const title = el('div', { class: 'load-row-title' }, `${save.team}`)
  info.appendChild(title)
  const sub = el('div', { class: 'load-row-sub' },
    `${(save.mode || '').toString().toUpperCase()} · Season ${save.season} · Round ${(save.round ?? 0) + 1} of ${save.roundCount || '?'}`,
  )
  info.appendChild(sub)
  const meta = el('div', { class: 'load-row-meta' })
  if (save.savedAt) meta.appendChild(el('span', {}, new Date(save.savedAt).toLocaleString()))
  if (save.schema) meta.appendChild(el('span', {}, `Schema v${save.schema}`))
  if (save.size) meta.appendChild(el('span', {}, formatSize(save.size)))
  info.appendChild(meta)
  card.appendChild(info)
  const actions = el('div', { class: 'load-row-actions' })
  const load = el('button', { class: 'primary' }, 'LOAD')
  load.addEventListener('click', () => void loadSave(root, save.slot))
  actions.appendChild(load)
  const del = el('button', { class: 'danger' }, 'DELETE')
  del.addEventListener('click', () => void deleteSave(root, save.slot, card))
  actions.appendChild(del)
  card.appendChild(actions)
  return card
}

async function loadSave(_root: HTMLElement, slot: string) {
  const repo = getSaveRepository()
  const res = await repo.read(slot)
  if (!res.ok || !res.contents) {
    toast(res.message || 'Save could not be loaded.', true)
    return
  }
  const parsed = deserializeSave(res.contents)
  if (!parsed.ok || !parsed.champ) {
    toast(parsed.error || 'Save is corrupt or unsupported.', true)
    return
  }
  store.setChampionship(parsed.champ)
  // In browser dev we also have a parallel localStorage copy.
  if (!isDesktopEnvironment()) {
    try { localStorage.setItem('pitwall-dynasty.save', res.contents) } catch (_) {}
  }
  location.hash = '#/hq'
}

async function deleteSave(_root: HTMLElement, slot: string, card: HTMLElement) {
  const confirmed = confirm(`Delete save "${slot}"? This cannot be undone.`)
  if (!confirmed) return
  const repo = getSaveRepository()
  const res = await repo.remove(slot)
  if (!res.ok) {
    toast(res.error || 'Could not delete save.', true)
    return
  }
  card.remove()
  toast('Save deleted.')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
