import { el, money } from './dom'
import { store } from '../state/store'
import { createChampionship } from '../championship/create'
import { renderLoadGame } from './load-game'
import { renderSettings } from './settings'
import { getSaveRepository, getSettingsRepository, isDesktopEnvironment } from '../platform/persistence'
import { deserializeSave, loadFromStorage } from '../state/persistence'
import type { Championship } from '../core/types'
import { iconCheckered, iconBolt, iconRoute, iconUsers, iconCarFront, iconWrench, iconTrophy, iconRadio, iconNewspaper, iconDocument, iconSettings } from './icons'

/** PC game title screen. */
export function renderMenu(root: HTMLElement) {
  root.innerHTML = ''

  const screen = el('div', { class: 'title-screen' })

  // Cinematic background layers
  screen.appendChild(el('div', { class: 'ts-bg' }))
  screen.appendChild(el('div', { class: 'ts-scan' }))

  // Decorative circuit board background
  const board = el('div', { class: 'ts-board' })
  board.innerHTML = `<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <linearGradient id="track" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e63946" stop-opacity="0.18"/>
        <stop offset="50%" stop-color="#2a6df4" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#d4a017" stop-opacity="0.10"/>
      </linearGradient>
      <linearGradient id="trackLine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#e63946"/>
        <stop offset="50%" stop-color="#f0c14b"/>
        <stop offset="100%" stop-color="#2a6df4"/>
      </linearGradient>
      <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#e63946" stop-opacity="0.5"/>
        <stop offset="60%" stop-color="#e63946" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#e63946" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <path d="M 80,300 Q 80,120 220,120 L 380,120 Q 480,120 480,240 L 480,360 Q 480,480 380,480 L 220,480 Q 80,480 80,300 Z" fill="none" stroke="url(#trackLine)" stroke-width="3" opacity="0.55"/>
    <path d="M 110,300 Q 110,150 230,150 L 380,150 Q 460,150 460,240 L 460,360 Q 460,460 380,460 L 230,460 Q 110,460 110,300 Z" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <path d="M 80,300 L 130,300 M 480,240 L 480,300 M 480,360 L 480,300 M 380,480 L 380,440" stroke="rgba(255,255,255,0.18)" stroke-width="2" fill="none" stroke-dasharray="3 4"/>
    <circle cx="130" cy="300" r="14" fill="url(#hubGlow)"/>
    <circle cx="130" cy="300" r="5" fill="#e63946"/>
    <text x="138" y="304" font-family="Rajdhani,Inter,sans-serif" font-size="11" font-weight="700" letter-spacing="2" fill="#e63946" opacity="0.9">SF</text>
    <text x="138" y="316" font-family="JetBrains Mono,monospace" font-size="8" letter-spacing="1.5" fill="rgba(255,255,255,0.4)">PITWALL DYNASTY</text>
  </svg>`
  board.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;z-index:0;opacity:0.65;pointer-events:none;mix-blend-mode:screen;'
  screen.appendChild(board)

  const content = el('div', { class: 'ts-content' })

  // Brand block (left)
  const brand = el('div', { class: 'ts-brand' })
  const eyebrow = el('div', { class: 'ts-eyebrow' })
  eyebrow.appendChild(el('span', { class: 'line' }))
  eyebrow.appendChild(el('span', {}, 'PITWALL DYNASTY'))
  brand.appendChild(eyebrow)

  const title = el('h1', { class: 'ts-title' })
  title.innerHTML = 'PITWALL<br/><em>DYNASTY</em>'
  brand.appendChild(title)

  brand.appendChild(el('p', { class: 'ts-tagline' },
    'Build your racing team against your friends. Lock in your decisions. Then watch them play out on track — together, on a shared broadcast.'))

  const meta = el('div', { class: 'ts-meta' })
  meta.appendChild(el('span', {}, el('strong', {}, 'V'), '1.0.0'))
  meta.appendChild(el('span', {}, el('strong', {}, 'SEASON'), '1'))
  meta.appendChild(el('span', {}, el('strong', {}, 'CLASS'), 'OPEN-WHEEL'))
  meta.appendChild(el('span', {}, el('strong', {}, 'NET'), 'AUTHORITATIVE'))
  brand.appendChild(meta)

  content.appendChild(brand)

  // Modes (right)
  const modes = el('div', { class: 'ts-modes' })

  // If a local championship is in progress, show a continue card
  if (store.champ) {
    const cont = el('button', { class: 'ts-mode ts-mode-continue' })
    cont.appendChild(el('div', { class: 'ts-mode-icon', html: iconCarFront(20) }))
    const contText = el('div', { class: 'ts-mode-text' })
    contText.appendChild(el('div', { class: 'ts-mode-title' }, `CONTINUE — ${store.champ.name}`))
    contText.appendChild(el('div', { class: 'ts-mode-desc' }, `Round ${store.champ.currentRoundIndex + 1} of ${store.champ.rounds.length}`))
    cont.appendChild(contText)
    cont.appendChild(el('div', { class: 'ts-mode-cta' }, 'RESUME →'))
    cont.addEventListener('click', () => (location.hash = '#/hq'))
    modes.appendChild(cont)
  }

  // Quick start
  const quick = el('button', { class: 'ts-mode' })
  quick.appendChild(el('div', { class: 'ts-mode-icon', html: iconBolt(20) }))
  const quickText = el('div', { class: 'ts-mode-text' })
  quickText.appendChild(el('div', { class: 'ts-mode-title' }, 'QUICK START'))
  quickText.appendChild(el('div', { class: 'ts-mode-desc' }, 'One-click Fast Championship: 10 teams, 5 rounds, you vs the AI paddock.'))
  quick.appendChild(quickText)
  quick.appendChild(el('div', { class: 'ts-mode-cta' }, 'PLAY →'))
  quick.addEventListener('click', () => quickStart())
  modes.appendChild(quick)

  // Fast Championship
  const fast = el('button', { class: 'ts-mode' })
  fast.appendChild(el('div', { class: 'ts-mode-icon', html: iconCheckered(20) }))
  const fastText = el('div', { class: 'ts-mode-text' })
  fastText.appendChild(el('div', { class: 'ts-mode-title' }, 'FAST CHAMPIONSHIP'))
  fastText.appendChild(el('div', { class: 'ts-mode-desc' }, 'Configure teams, races, timers and rules for one shared session.'))
  fast.appendChild(fastText)
  fast.appendChild(el('div', { class: 'ts-mode-cta' }, 'SETUP →'))
  fast.addEventListener('click', () => openChampConfig('fast'))
  modes.appendChild(fast)

  // Multiplayer
  const mp = el('button', { class: 'ts-mode' })
  mp.appendChild(el('div', { class: 'ts-mode-icon', html: iconUsers(20) }))
  const mpText = el('div', { class: 'ts-mode-text' })
  mpText.appendChild(el('div', { class: 'ts-mode-title' }, 'MULTIPLAYER'))
  mpText.appendChild(el('div', { class: 'ts-mode-desc' }, 'Host or join a real-time Fast Championship with friends. Authoritative server, shared broadcast.'))
  mp.appendChild(mpText)
  mp.appendChild(el('div', { class: 'ts-mode-cta' }, 'PLAY ONLINE →'))
  mp.addEventListener('click', () => openMultiplayer())
  modes.appendChild(mp)

  // Solo Career
  const career = el('button', { class: 'ts-mode' })
  career.appendChild(el('div', { class: 'ts-mode-icon', html: iconRoute(20) }))
  const careerText = el('div', { class: 'ts-mode-text' })
  careerText.appendChild(el('div', { class: 'ts-mode-title' }, 'SOLO CAREER'))
  careerText.appendChild(el('div', { class: 'ts-mode-desc' }, 'Multiple seasons, driver market, facilities and development — at your own pace.'))
  career.appendChild(careerText)
  career.appendChild(el('div', { class: 'ts-mode-cta' }, 'BEGIN →'))
  career.addEventListener('click', () => openChampConfig('career'))
  modes.appendChild(career)

  content.appendChild(modes)
  screen.appendChild(content)

  // Secondary actions (always visible on PC menu)
  const secondary = el('div', { class: 'ts-secondary' })
  const load = el('button', { class: 'ts-secondary-btn' })
  load.appendChild(el('div', { class: 'icon', html: iconDocument(16) }))
  load.appendChild(el('span', {}, 'LOAD GAME'))
  load.addEventListener('click', () => renderLoadGame(root))
  secondary.appendChild(load)

  const settingsBtn = el('button', { class: 'ts-secondary-btn' })
  settingsBtn.appendChild(el('div', { class: 'icon', html: iconSettings(16) }))
  settingsBtn.appendChild(el('span', {}, 'SETTINGS'))
  settingsBtn.addEventListener('click', () => renderSettings(root))
  secondary.appendChild(settingsBtn)

  if (isDesktopEnvironment()) {
    const quit = el('button', { class: 'ts-secondary-btn ts-secondary-quit' })
    quit.appendChild(el('span', {}, 'QUIT GAME'))
    quit.addEventListener('click', () => { window.pitwall?.app.quit() })
    secondary.appendChild(quit)
  } else {
    // In browser dev, "QUIT" simply navigates away.
    const back = el('button', { class: 'ts-secondary-btn' })
    back.appendChild(el('span', {}, 'CLOSE TAB'))
    back.addEventListener('click', () => { try { window.close() } catch (_) {} })
    secondary.appendChild(back)
  }

  screen.appendChild(secondary)

  // Footer
  const footer = el('div', { class: 'ts-footer' })
  const fleft = el('div', { class: 'left' })
  fleft.appendChild(el('span', { class: 'chip' }, 'SHIFTWORKS MOTORSPORT'))
  fleft.appendChild(el('span', { class: 'chip' }, 'A FICTIONAL CHAMPIONSHIP'))
  footer.appendChild(fleft)
  // Surface the running desktop / version info on the right of the footer.
  const right = el('div', { class: 'right' })
  right.appendChild(el('span', { class: 'chip' }, isDesktopEnvironment() ? 'STANDALONE' : 'DEV'))
  right.appendChild(el('span', { class: 'chip' }, 'PRESS ANYWHERE TO BEGIN'))
  footer.appendChild(right)
  screen.appendChild(footer)

  // Asynchronous Continue-slot check: read the latest save and show
  // it as a CONTINUE button if a career exists.
  void ensureContinueShortcut(screen, root)

  root.appendChild(screen)
}

async function ensureContinueShortcut(screen: HTMLElement, root: HTMLElement) {
  try {
    const saves = await getSaveRepository().list()
    if (!saves.length) return
    const latest = saves[0]
    // Avoid duplicating the existing CONTINUE card; only add the
    // cross-platform continue button if the current store has nothing.
    if (store.champ) return
    const cont = el('button', { class: 'ts-mode ts-mode-continue' })
    cont.appendChild(el('div', { class: 'ts-mode-icon', html: iconCarFront(20) }))
    const contText = el('div', { class: 'ts-mode-text' })
    contText.appendChild(el('div', { class: 'ts-mode-title' }, `CONTINUE — ${latest.team}`))
    contText.appendChild(el('div', { class: 'ts-mode-desc' }, `${latest.mode.toUpperCase()} · Season ${latest.season} · Round ${latest.round + 1}/${latest.roundCount || '?'} · ${(latest.savedAt ? new Date(latest.savedAt).toLocaleString() : '')}`))
    cont.appendChild(contText)
    cont.appendChild(el('div', { class: 'ts-mode-cta' }, 'RESUME →'))
    cont.addEventListener('click', () => loadSaveAndRoute(latest.slot, root))
    const modes = screen.querySelector('.ts-modes')
    if (modes) modes.insertBefore(cont, modes.firstChild)
  } catch (e) {
    // Continue is best-effort; ignore on failure.
  }
}

async function loadSaveAndRoute(slot: string, _root: HTMLElement) {
  const repo = getSaveRepository()
  const res = await repo.read(slot)
  if (!res.ok || !res.contents) {
    if (window.pitwall) {
      // Surface a generic toast — desktop builds always have toasts.
    }
    return
  }
  if (isDesktopEnvironment()) {
    // Use the canonical deserializer so schema migration runs.
    const parsed = deserializeSave(res.contents)
    if (!parsed.ok || !parsed.champ) return
    store.setChampionship(parsed.champ)
    // Persist the loaded save as the active "last" slot.
    const settings = await getSettingsRepository().load()
    await getSettingsRepository().save({ lastSaveSlot: slot })
    void settings
  } else {
    // In browser dev, the in-game store still has the live champ.
    // If the player pressed LOAD GAME without a current champ we
    // must construct one. As a fallback we reload from localStorage.
    const loaded = loadFromStorage()
    if (loaded.ok && loaded.champ) store.setChampionship(loaded.champ)
  }
  location.hash = '#/hq'
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
  champ.teams[0].colors = { primary: '#e63946', secondary: '#ffffff' }
  store.setChampionship(champ)
  location.hash = '#/hq'
}

function openChampConfig(mode: Championship['mode']) {
  location.hash = '#/new/' + mode
}

function openMultiplayer() {
  location.hash = '#/lobby'
}

void money
void iconWrench
void iconTrophy
void iconRadio
void iconNewspaper
