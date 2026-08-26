import { el, toast } from './dom'
import { store } from '../state/store'
import { simulateRace } from '../sim/race-sim'
import { CIRCUITS, DRIVERS, buildDefaultTeams } from '../core/content'
import { finalizePackage } from '../championship/engine'
import { validateMod, sampleMod, modHash } from '../content/modding'
import type { RacePackage } from '../core/types'

/**
 * Dev Tools — clearly separated from normal gameplay. Batch simulation,
 * instant race, seed inspection, save reset, mod validation.
 */

export function renderDevTools(root: HTMLElement) {
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h2', {}, 'Developer Tools'))
  inner.appendChild(el('p', { style: 'color:var(--text-2)' }, 'Utilities for testing and balance analysis. Not part of normal gameplay.'))

  // --- Batch simulation ---
  const batchOut = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Batch Simulation')),
    el('div', { class: 'card-body' },
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
        el('button', { onclick: () => runBatch(100) }, 'Simulate 100 races'),
        el('button', { onclick: () => runBatch(500) }, 'Simulate 500 races'),
      ),
      el('div', { id: 'batch-results', style: 'margin-top:10px;font-family:var(--mono);font-size:12px;line-height:1.7' }),
    ),
  )

  // --- Instant race (current championship) ---
  const champCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Current Championship')),
    el('div', { class: 'card-body', style: 'display:flex;gap:10px;flex-wrap:wrap' },
      el('button', {
        onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          store.lockAndSimulate()
          location.hash = '#/results'
        },
      }, 'Simulate current round instantly'),
      el('button', {
        onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          store.advanceRound()
          store.emit()
          location.hash = '#/hq'
          toast('Skipped to next round.')
        },
      }, 'Jump to next round'),
      el('button', {
        class: 'primary',
        onclick: () => {
          if (confirm('Delete the saved game and return to the main menu?')) {
            localStorage.removeItem('pitwall-dynasty.save')
            sessionStorage.removeItem('pitwall.work')
            location.hash = '#/'
            location.reload()
          }
        },
      }, 'Reset save'),
    ),
  )

  // --- Modding ---
  const mod = sampleMod()
  const modValidation = validateMod(mod)
  const modCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Mod Validation')),
    el('div', { class: 'card-body' },
      el('div', { class: 'stat' }, el('span', { class: 'label' }, `Sample: ${mod.name} (${mod.id})`), el('span', { class: 'value mono' }, `hash ${modHash(mod).slice(0, 8)}`)),
      el('div', {},
        modValidation.valid
          ? el('span', { class: 'badge green' }, 'VALID')
          : el('span', { class: 'badge red' }, 'INVALID'),
        ...modValidation.issues.map((i) =>
          el('div', { style: 'font-size:12px;margin-top:4px;color:var(--text-1)' }, `${i.severity === 'error' ? '✖' : '⚠'} ${i.message}`)),
      ),
      el('details', {},
        el('summary', { style: 'cursor:pointer;font-size:13px' }, 'View sample manifest structure'),
        el('pre', { style: 'font-family:var(--mono);font-size:11px;background:var(--bg-2);padding:10px;border-radius:6px;margin-top:8px;overflow-x:auto' },
          JSON.stringify({ id: mod.id, name: mod.name, version: mod.version, gameVersion: mod.gameVersion, author: mod.author, contentKeys: Object.keys(mod.content ?? {}) }, null, 2)),
      ),
    ),
  )

  inner.append(batchOut, champCard, modCard)
  page.appendChild(inner)
  root.appendChild(page)

  function runBatch(n: number) {
    const out = document.getElementById('batch-results')!
    out.innerHTML = 'Simulating…'
    setTimeout(() => {
      const circuit = CIRCUITS[0]
      const teams = buildDefaultTeams().slice(0, 10)
      const driverMap = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))
      const packages: RacePackage[] = teams.flatMap((t) =>
        t.driverIds.slice(0, 2).map((driverId, ci) =>
          finalizePackage({
            championshipId: 'batch', roundId: '0', teamId: t.id,
            driverId,
            teammateId: t.driverIds.find((d) => d !== driverId),
            carNumber: ci + 1,
            selectedParts: {} as never,
            carPerformance: t.carPerformance,
            componentWear: { frontWing: 0, rearWing: 0, floor: 0, chassis: 0, suspension: 0, cooling: 0 },
            setup: { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 },
            tyreAllocation: {},
            strategy: defaultStrategyFor(circuit.characteristics.laps),
            reliability: 80,
            staffModifiers: { strategySkill: 70, pitCrewSkill: 70, engineerSkill: 70 },
            weatherForecast: { condition: 'dry', rainProbability: 0.15, confidence: 0.8 },
            version: 1, lockedAt: Date.now(),
          }),
        ),
      )
      const wins: Record<string, number> = {}
      const podiums: Record<string, number> = {}
      let dnfs = 0
      let totalPits = 0
      let scCount = 0
      let overtakes = 0
      const start = performance.now()
      for (let i = 0; i < n; i++) {
        const res = simulateRace({
          roundId: String(i), circuit, packages: structuredClone(packages),
          drivers: driverMap, seed: 100000 + i * 7919, weatherEnabled: true,
        })
        const winner = res.results.find((r) => r.finishPosition === 1)
        if (winner) wins[winner.teamId] = (wins[winner.teamId] ?? 0) + 1
        for (const r of res.results.filter((x) => x.classified && x.finishPosition <= 3)) {
          podiums[r.teamId] = (podiums[r.teamId] ?? 0) + 1
        }
        dnfs += res.results.filter((r) => !r.classified).length
        totalPits += res.results.reduce((s, r) => s + r.pitStops, 0)
        scCount += res.safetyCarCount + res.vscCount
        overtakes += res.events.filter((e) => e.type === 'overtake').length
      }
      const elapsed = performance.now() - start
      const winLines = Object.entries(wins)
        .sort((a, b) => b[1] - a[1])
        .map(([teamId, w]) => {
          const t = teams.find((x) => x.id === teamId)
          const pct = ((w / n) * 100).toFixed(0)
          return `<div>${t?.name.padEnd(22) ?? teamId} ${'█'.repeat(Math.round(w / Math.max(1, n / 40)))} ${w} (${pct}%)</div>`
        }).join('')
      out.innerHTML =
        `<div><b>${n} races simulated in ${elapsed.toFixed(0)}ms (${(elapsed / n).toFixed(1)}ms/race)</b></div>` +
        `<div>DNF rate: ${((dnfs / (n * 20)) * 100).toFixed(1)}% · Avg pits/car/race: ${(totalPits / (n * 20)).toFixed(2)} · SC/VSC per race: ${(scCount / n).toFixed(2)} · Overtakes per race: ${(overtakes / n).toFixed(1)}</div>` +
        `<div style="margin-top:8px"><b>Win distribution:</b></div>${winLines}`
    }, 30)
  }
}

function defaultStrategyFor(laps: number): import('../core/types').StrategyPlaybook {
  return {
    startingTyre: 'medium',
    plannedStints: [{ fromLap: Math.floor(laps * 0.45), compound: 'hard' }],
    weatherRules: [{ id: 'wet-auto', description: '', kind: 'wetSwitch', enabled: true, params: { threshold: 25 } }],
    safetyCarRules: [{ id: 'sc-pit', description: '', kind: 'safetyCarPit', enabled: true, params: { minTyreAge: 6, maxLapFraction: 0.7 } }],
    lateRaceRules: [],
    paceMode: 'normal',
    tyreUsage: 'standard',
    energy: 'balanced',
    teamOrder: 'freeToRace',
  }
}
