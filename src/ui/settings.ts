// Settings screen — display / graphics / audio / controls.
// Values are persisted via the platform SettingsRepository
// (file-backed on desktop, localStorage in browser dev).

import { el, toast } from './dom'
import { renderMenu } from './menu'
import { getSettingsRepository, isDesktopEnvironment } from '../platform/persistence'
import type { Settings } from '../platform/persistence'

const DEFAULTS: Settings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  radioVolume: 0.8,
  displayMode: 'windowed',
  resolution: { width: 1920, height: 1080 },
  vsync: true,
  fpsLimit: 60,
  graphicsQuality: 'high',
  uiScale: 1.0,
  reducedMotion: false,
  multiplayerEndpoint: 'ws://localhost:8080',
  lastSaveSlot: null,
}

let current: Settings = { ...DEFAULTS }

export async function renderSettings(root: HTMLElement) {
  root.innerHTML = ''
  try {
    current = await getSettingsRepository().load()
  } catch (_) {
    current = { ...DEFAULTS }
  }

  const page = el('div', { class: 'page page-settings' })
  const inner = el('div', { class: 'page-inner' })
  const head = el('div', { class: 'settings-head' })
  head.appendChild(el('h1', {}, 'Settings'))
  head.appendChild(el('p', { class: 'kicker' }, isDesktopEnvironment() ? 'Settings are stored under %APPDATA%\\Pitwall Dynasty\\settings.json' : 'Settings are stored in this browser\u2019s local storage.'))
  inner.appendChild(head)

  // ---- Display ----
  inner.appendChild(buildSection('Display', [
    fieldSelect('Display Mode', 'displayMode', [
      ['Windowed', 'windowed'],
      ['Borderless Windowed', 'borderless'],
      ['Fullscreen', 'fullscreen'],
    ]),
    fieldSelect('Resolution', 'resolution', [
      ['1920 × 1080', { width: 1920, height: 1080 }],
      ['2560 × 1440', { width: 2560, height: 1440 }],
      ['1366 × 768', { width: 1366, height: 768 }],
      ['1280 × 720', { width: 1280, height: 720 }],
    ]),
    fieldToggle('VSync', 'vsync'),
    fieldSelect('FPS Limit', 'fpsLimit', [
      ['30 FPS', 30],
      ['60 FPS', 60],
      ['120 FPS', 120],
      ['144 FPS', 144],
      ['Unlimited', 0],
    ]),
  ]))

  // ---- Graphics ----
  inner.appendChild(buildSection('Graphics', [
    fieldSelect('Graphics Quality', 'graphicsQuality', [
      ['Low', 'low'],
      ['Medium', 'medium'],
      ['High', 'high'],
      ['Ultra', 'ultra'],
    ]),
    fieldRange('UI Scale', 'uiScale', 0.8, 1.4, 0.05),
    fieldToggle('Reduced Motion', 'reducedMotion'),
  ]))

  // ---- Audio ----
  inner.appendChild(buildSection('Audio', [
    fieldRange('Master Volume', 'masterVolume', 0, 1, 0.05),
    fieldRange('Music Volume', 'musicVolume', 0, 1, 0.05),
    fieldRange('SFX Volume', 'sfxVolume', 0, 1, 0.05),
    fieldRange('Radio Volume', 'radioVolume', 0, 1, 0.05),
  ]))

  // ---- Multiplayer ----
  inner.appendChild(buildSection('Multiplayer', [
    fieldText('Server Endpoint', 'multiplayerEndpoint'),
  ]))

  // ---- Keyboard ----
  inner.appendChild(buildNote([
    'ESC: back / close modal',
    'Enter: confirm',
    'Alt + Enter: toggle fullscreen',
    'Alt + F4: quit game',
  ]))

  // ---- Actions ----
  const actions = el('div', { class: 'settings-actions' })
  const reset = el('button', { class: 'ghost' }, 'RESET TO DEFAULTS')
  reset.addEventListener('click', () => resetToDefaults())
  actions.appendChild(reset)
  const back = el('button', { class: 'primary' }, 'DONE')
  back.addEventListener('click', () => renderMenu(root))
  actions.appendChild(back)
  inner.appendChild(actions)

  page.appendChild(inner)
  root.appendChild(page)

  // Re-render full settings if a controlled select updates state.
  bindEvents()
}

function buildSection(title: string, fields: HTMLElement[]): HTMLElement {
  const section = el('section', { class: 'settings-section' })
  section.appendChild(el('h2', {}, title))
  const grid = el('div', { class: 'settings-grid' })
  for (const f of fields) grid.appendChild(f)
  section.appendChild(grid)
  return section
}

function buildNote(items: string[]): HTMLElement {
  const section = el('section', { class: 'settings-section' })
  section.appendChild(el('h2', {}, 'Keyboard'))
  const list = el('ul', { class: 'settings-keys' })
  for (const i of items) list.appendChild(el('li', {}, i))
  section.appendChild(list)
  return section
}

function fieldToggle(label: string, key: keyof Settings): HTMLElement {
  const wrapper = el('label', { class: 'settings-field settings-toggle' })
  wrapper.appendChild(el('span', { class: 'label' }, label))
  const checkbox = el('input', { type: 'checkbox' }) as HTMLInputElement
  checkbox.checked = Boolean(current[key])
  checkbox.addEventListener('change', () => { (current as any)[key] = checkbox.checked; commit() })
  wrapper.appendChild(checkbox)
  const slider = el('span', { class: 'switch' })
  wrapper.appendChild(slider)
  return wrapper
}

function fieldRange(label: string, key: keyof Settings, min: number, max: number, step: number): HTMLElement {
  const wrapper = el('label', { class: 'settings-field settings-range' })
  const lbl = el('span', { class: 'label' }, label)
  const value = el('span', { class: 'value' }, formatRangeValue(current[key] as number, step))
  wrapper.appendChild(lbl)
  wrapper.appendChild(value)
  const range = el('input', { type: 'range' }) as HTMLInputElement
  range.min = String(min); range.max = String(max); range.step = String(step)
  range.value = String(current[key])
  range.addEventListener('input', () => {
    const v = Number(range.value)
    ;(current as any)[key] = v
    value.textContent = formatRangeValue(v, step)
  })
  range.addEventListener('change', () => commit())
  wrapper.appendChild(range)
  return wrapper
}

function fieldSelect<T>(label: string, key: keyof Settings, options: Array<[string, T]>): HTMLElement {
  const wrapper = el('label', { class: 'settings-field settings-select' })
  wrapper.appendChild(el('span', { class: 'label' }, label))
  const sel = el('select') as HTMLSelectElement
  for (const [text, value] of options) {
    const opt = el('option', { value: String(value as any) }, text) as HTMLOptionElement
    if ((current as any)[key] === value) opt.selected = true
    sel.appendChild(opt)
  }
  sel.addEventListener('change', () => {
    const opt = options.find((o) => String(o[1]) === sel.value)
    if (!opt) return
    ;(current as any)[key] = opt[1]
    if (key === 'displayMode' && isDesktopEnvironment() && window.pitwall) {
      void window.pitwall.window.setDisplayMode(opt[1] as any)
    }
    if (key === 'resolution' && isDesktopEnvironment() && window.pitwall) {
      const r = opt[1] as { width: number; height: number }
      void window.pitwall.window.setDisplayMode(current.displayMode)
      void r
    }
    commit()
  })
  wrapper.appendChild(sel)
  return wrapper
}

function fieldText(label: string, key: keyof Settings): HTMLElement {
  const wrapper = el('label', { class: 'settings-field settings-text' })
  wrapper.appendChild(el('span', { class: 'label' }, label))
  const input = el('input', { type: 'text' }) as HTMLInputElement
  input.value = String(current[key] ?? '')
  input.addEventListener('change', () => { (current as any)[key] = input.value; commit() })
  wrapper.appendChild(input)
  return wrapper
}

function bindEvents() {
  // DisplayMode select must be triggered when its value changes so we
  // can resize the actual window. The per-field handler covers that.
}

function formatRangeValue(v: number, step: number): string {
  if (step >= 0.1) return `${Math.round(v * 100)}%`
  if (step >= 1) return String(Math.round(v))
  return v.toFixed(2)
}

async function commit() {
  try {
    const next = await getSettingsRepository().save(current)
    if (next) {
      // Apply runtime side-effects that the desktop bridge supports.
      if (isDesktopEnvironment() && window.pitwall) {
        // No-op: the main process keeps the persisted values.
      }
    }
  } catch (e) {
    toast('Could not save settings: ' + (e as Error).message, true)
  }
}

async function resetToDefaults() {
  if (!confirm('Reset all settings to defaults?')) return
  current = { ...DEFAULTS }
  await commit()
  renderSettings(document.querySelector('#app') as HTMLElement)
  toast('Settings reset.')
}
