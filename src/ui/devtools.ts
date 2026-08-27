import { el, toast } from './dom'
import { store } from '../state/store'
import { simulateRace } from '../sim/race-sim'
import { CIRCUITS, DRIVERS, buildDefaultTeams } from '../core/content'
import { finalizePackage } from '../championship/engine'
import { validateMod, sampleMod, modHash } from '../content/modding'
import { ensureFeeder, tickFeeder } from '../series/background'
import { refreshAllEligibility } from '../series/eligibility'
import { fundScoutingForOneWeek, ensureScouting, scoutDriver, getTopProspects } from '../series/scouting'
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

  // --- Driver Ecosystem (DEV) ---
  const ecoOut = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Driver Ecosystem — DEV')),
    el('div', { class: 'card-body' },
      el('p', { style: 'color:var(--text-2);font-size:12px;margin-bottom:8px' },
        'All actions below modify the loaded championship. They are intended for visual QA, balance testing and stress-testing the career loop. Restricted to Dev Tools.'),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          ensureFeeder(store.champ)
          store.save()
          store.emit()
          renderDevTools(root)
          toast('Feeder series initialised.')
        } }, 'Ensure feeder series'),
        el('button', { onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          tickFeeder(store.champ)
          store.save()
          store.emit()
          renderDevTools(root)
          toast('One feeder round ticked.')
        } }, 'Simulate 1 feeder round'),
        el('button', { onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          ensureFeeder(store.champ)
          for (let i = 0; i < 16; i++) tickFeeder(store.champ)
          refreshAllEligibility(store.champ)
          store.save()
          store.emit()
          renderDevTools(root)
          toast('Simulated a full feeder season.')
        } }, 'Simulate feeder season'),
        el('button', { onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          for (let i = 0; i < 6; i++) fundScoutingForOneWeek(store.champ)
          store.save()
          store.emit()
          renderDevTools(root)
          toast('Funded 6 weeks of scouting.')
        } }, 'Fund scouting ×6'),
        el('button', { onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          ensureScouting(store.champ)
          // Scout the first 5 free-agent drivers
          const freeAgents = Object.values(store.champ.drivers)
            .filter((d) => !d.contract && !d.reserveContract && !d.academyContract)
            .slice(0, 5)
          for (const d of freeAgents) scoutDriver(store.champ, d.id)
          store.save()
          store.emit()
          renderDevTools(root)
          toast(`Scouted ${freeAgents.length} free agents.`)
        } }, 'Scout top free agents'),
        el('button', { class: 'primary', onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          store.champ.womenSeriesEstablished = true
          ensureFeeder(store.champ)
          store.save()
          store.emit()
          renderDevTools(root)
          toast('Aurora formation event triggered.')
        } }, 'Trigger Aurora formation event'),
        el('button', { onclick: () => {
          if (!store.champ) return toast('No championship loaded.', true)
          for (let i = 0; i < 3; i++) tickFeeder(store.champ)
          store.champ.config.season++
          ensureFeeder(store.champ)
          refreshAllEligibility(store.champ)
          store.save()
          store.emit()
          renderDevTools(root)
          toast('Advanced feeder by one year.')
        } }, 'Advance feeder by 1 year'),
      ),
      el('div', { id: 'dev-eco-summary', style: 'margin-top:10px;font-family:var(--font-mono);font-size:12px;line-height:1.7' }),
    ),
  )
  // Populate summary after each render
  setTimeout(() => {
    const out = document.getElementById('dev-eco-summary')
    if (!out || !store.champ) return
    const f = store.champ.feeder ?? {}
    const lines: string[] = []
    const ids: Array<keyof typeof f | string> = ['base.junior.regional', 'base.junior.continental', 'base.junior.aurora']
    for (const sid of ids) {
      const st = (f as Record<string, { config: { name: string; establishedSeason: number }; currentSeason: number; currentRoundIndex: number; drivers: Record<string, { gender: string }> }>)[sid as string]
      if (!st) { lines.push(`${sid}: not initialised (womenSeriesEstablished=${store.champ.womenSeriesEstablished})`); continue }
      const drivers = Object.values(st.drivers)
      const female = drivers.filter((d) => d.gender === 'female').length
      const male = drivers.filter((d) => d.gender === 'male').length
      const nonb = drivers.filter((d) => d.gender === 'nonbinary').length
      lines.push(`${st.config.name.padEnd(22)} S${st.currentSeason} R${st.currentRoundIndex}/${st.config.establishedSeason} · drivers=${drivers.length} (M ${male} / F ${female} / NB ${nonb})`)
    }
    lines.push(`Scouting reports: ${Object.keys(store.champ.scouting?.reports ?? {}).length} · Watchlist: ${store.champ.scouting?.watchlist.length ?? 0}`)
    const top = getTopProspects(store.champ, 5)
    if (top.length) {
      lines.push('Top prospects:')
      for (const p of top) {
        lines.push(`  - ${p.driver.lastName} (${p.driver.gender}) tier=${p.tier} conf=${(p.confidence * 100).toFixed(0)}%`)
      }
    }
    out.innerHTML = lines.join('<br>')
  }, 0)

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

  inner.append(batchOut, champCard, ecoOut, modCard)
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
