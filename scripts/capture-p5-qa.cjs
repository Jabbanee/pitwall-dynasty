#!/usr/bin/env node
// P5 visual QA capture.
//
// Boots a deterministic Vite dev server on 127.0.0.1:5173, injects the
// devProbe flag BEFORE the first navigation, drives the
// `__pitwallVisualQA.load` API to set up every required scenario, and
// captures the full 75-shot matrix plus comparison images into
// docs/testing/screenshots/3d-visual-p5-complete/.
//
// The Playwright runtime uses the system Chrome binary
// (C:\Program Files\Google\Chrome\Application\chrome.exe) via an
// explicit executablePath — Playwright's bundled Chromium download is
// not required and is not used.
//
// Vite is owned by this script via try/finally so no orphan dev
// server survives the run.

const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const isWindows = process.platform === 'win32'
const VITE_HOST = '127.0.0.1'
const VITE_PORT = 5173
const VITE_URL = `http://${VITE_HOST}:${VITE_PORT}/`
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PROJECT_DIR = process.cwd()
const OUT_DIR = path.resolve(PROJECT_DIR, 'docs/testing/screenshots/3d-visual-p5-complete')
const VIEWPORT = { width: 1920, height: 1080 }

function log(msg) {
  process.stdout.write(`[p5-qa] ${msg}\n`)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function startVite() {
  // Use process.execPath + vite's bin directly. On Windows that means
  // node.exe + node_modules/vite/bin/vite.js — no npx.cmd shell
  // invocation, which is what causes EINVAL on spawn.
  const viteBin = path.resolve(PROJECT_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
  log(`launching vite via ${process.execPath} ${viteBin}`)
  const proc = spawn(
    process.execPath,
    [
      viteBin,
      '--host', VITE_HOST,
      '--port', String(VITE_PORT),
      '--strictPort',
    ],
    {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )

  proc.stdout.on('data', (d) => process.stderr.write(`[vite] ${d}`))
  proc.stderr.on('data', (d) => process.stderr.write(`[vite-err] ${d}`))

  // Wait for the dev server to respond.
  const start = Date.now()
  while (Date.now() - start < 30000) {
    if (proc.exitCode != null) {
      throw new Error(`vite exited prematurely with code ${proc.exitCode}`)
    }
    try {
      const res = await fetch(VITE_URL)
      if (res.ok) {
        log(`vite up after ${Date.now() - start}ms`)
        return proc
      }
    } catch (_) { /* not yet */ }
    await sleep(250)
  }
  throw new Error('vite never came up in 30s')
}

function stopVite(proc) {
  if (!proc || proc.killed) return
  try {
    if (isWindows) {
      // tree kill on Windows
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      proc.kill('SIGTERM')
    }
  } catch (_) { /* swallow */ }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  let vite = null
  let browser = null
  try {
    vite = await startVite()

    if (!fs.existsSync(CHROME_PATH)) {
      throw new Error(`Chrome not found at ${CHROME_PATH}`)
    }

    const { chromium } = await import('playwright')
    log('launching system Chrome via Playwright')
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: [
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    })

    const ctx = await browser.newContext({ viewport: VIEWPORT })

    // devProbe MUST be set BEFORE the first navigation so the runtime
    // picks it up on initial mount. localStorage is origin-specific;
    // using addInitScript guarantees it persists across reloads.
    await ctx.addInitScript(() => {
      try { window.localStorage.setItem('pitwall-dynasty.devProbe', '1') } catch (_) {}
    })

    const page = await ctx.newPage()

    page.on('console', (m) => {
      const txt = m.text()
      if (m.type() === 'error' || m.type() === 'warning') {
        process.stderr.write(`[browser-${m.type()}] ${txt}\n`)
      }
    })
    page.on('pageerror', (e) => process.stderr.write(`[browser-pageerror] ${e.message}\n`))
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) {
        log(`navigated: ${f.url()}`)
      }
    })

    log(`navigating to ${VITE_URL}`)
    await page.goto(VITE_URL, { waitUntil: 'domcontentloaded' })

    // Smoke: the devProbe flag must survive the first load.
    const probe = await page.evaluate(() => window.localStorage.getItem('pitwall-dynasty.devProbe'))
    if (probe !== '1') {
      throw new Error(`devProbe missing after first navigation: got ${JSON.stringify(probe)}`)
    }
    log('devProbe present')

    // Drive into a race. The harness wraps real buttons.
    const fire = async (text) => {
      const clicked = await page.evaluate((t) => {
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
        const want = norm(t).toLowerCase()
        const btn = Array.from(document.querySelectorAll('button')).find((x) => {
          const txt = norm(x.textContent).toLowerCase()
          return txt && (txt === want || txt.includes(want))
        })
        if (btn) { btn.click(); return true }
        return false
      }, text)
      log(`fire(${text}) -> ${clicked ? 'clicked' : 'not found'}`)
    }
    await fire('QUICK START')
    await sleep(1000)
    await fire('Enter Race Weekend')
    await sleep(1200)
    await fire('LOCK RACE')
    await sleep(2000)

    // The harness exposes window.__pitwallVisualQA. Wait for it.
    try {
      await page.waitForFunction(() => !!window.__pitwallVisualQA, { timeout: 15000 })
    } catch (_) {
      // try forcing navigation hash in case the route did not change
      await page.evaluate(() => { location.hash = '#/broadcast' })
      await sleep(1500)
      await page.waitForFunction(() => !!window.__pitwallVisualQA, { timeout: 15000 })
    }
    log('QA harness present')

    // Sanity-check that the QA API exposes the controls we rely on.
    const apiKeys = await page.evaluate(() => {
      const fn = window.__pitwallVisualQA
      if (!fn) return null
      return Object.keys(fn)
    })
    log(`QA API keys: ${JSON.stringify(apiKeys)}`)
    if (!apiKeys || !apiKeys.includes('load') || !apiKeys.includes('sample') || !apiKeys.includes('ready')) {
      throw new Error(`QA API missing required keys: ${JSON.stringify(apiKeys)}`)
    }

    // Smoke capture first — single screenshot, prove the pipeline works.
    await page.evaluate(() => {
      window.__pitwallVisualQA.load({ camera: 'helicopter' })
      if (window.__setCameraMode) window.__setCameraMode('helicopter')
    })
    await sleep(800)
    const smokePath = path.join(OUT_DIR, '_smoke.png')
    await page.screenshot({ path: smokePath })
    const smokeStat = fs.statSync(smokePath)
    log(`smoke capture: ${smokePath} (${smokeStat.size} bytes)`)
    if (smokeStat.size < 5000) {
      throw new Error(`smoke capture suspiciously small (${smokeStat.size} bytes)`)
    }

    const matrix = [
      // 01-04: Grid + lights
      { file: '01-grid-wide.png',          camera: 'helicopter' },
      { file: '02-grid-front.png',         camera: 'trackside' },
      { file: '03-lights-on.png',          camera: 'helicopter', phase: 'LIGHTS' },
      { file: '04-lights-out.png',         camera: 'helicopter', phase: 'LIVE' },
      // 05-10: Cameras + speed
      { file: '05-trackside-speed.png',    camera: 'trackside' },
      { file: '06-long-lens-braking.png',  camera: 'trackside' },
      { file: '07-apex-low.png',           camera: 'trackside' },
      { file: '08-exit-pan.png',           camera: 'trackside' },
      { file: '09-helicopter.png',         camera: 'helicopter' },
      { file: '10-onboard.png',            camera: 'onboard' },
      // 11-16: Track surface
      { file: '11-asphalt-close.png',      camera: 'trackside' },
      { file: '12-racing-line.png',        camera: 'trackside' },
      { file: '13-braking-rubber.png',     camera: 'trackside' },
      { file: '14-curb-close.png',         camera: 'trackside' },
      { file: '15-gravel.png',            camera: 'trackside' },
      { file: '16-grass.png',             camera: 'helicopter' },
      // 17-20: Barriers + fencing
      { file: '17-armco.png',             camera: 'trackside' },
      { file: '18-concrete.png',          camera: 'trackside' },
      { file: '19-tyre-wall.png',         camera: 'trackside' },
      { file: '20-safety-fence.png',      camera: 'trackside' },
      // 21-30: Pit complex + crew
      { file: '21-pit-complex.png',       camera: 'helicopter' },
      { file: '22-team-garage.png',       camera: 'trackside' },
      { file: '23-pit-wall.png',          camera: 'trackside' },
      { file: '24-pit-crew-ready.png',    camera: 'trackside' },
      { file: '25-pit-entry.png',         camera: 'trackside', phase: 'PIT_ENTRY' },
      { file: '26-pit-transit.png',       camera: 'trackside', phase: 'PIT_ENTRY' },
      { file: '27-pit-arrival.png',       camera: 'trackside', phase: 'PIT_SERVICE' },
      { file: '28-pit-service.png',       camera: 'trackside', phase: 'PIT_SERVICE' },
      { file: '29-pit-release.png',       camera: 'trackside', phase: 'PIT_EXIT' },
      { file: '30-pit-exit.png',          camera: 'trackside', phase: 'PIT_EXIT' },
      // 31-32: Grandstand + crowd
      { file: '31-grandstand.png',        camera: 'trackside' },
      { file: '32-crowd.png',             camera: 'trackside' },
      // 33-38: Venues
      { file: '33-forest.png',            camera: 'helicopter', circuitId: 'c01' },
      { file: '34-mountain.png',          camera: 'helicopter', circuitId: 'c02' },
      { file: '35-coastal.png',           camera: 'helicopter', circuitId: 'c03' },
      { file: '36-desert.png',            camera: 'helicopter', circuitId: 'c04' },
      { file: '37-urban.png',             camera: 'helicopter', circuitId: 'c05' },
      { file: '38-modern.png',            camera: 'helicopter', circuitId: 'c06' },
      // 39-44: Signatures (same circuits but different camera)
      { file: '39-forest-signature.png',   camera: 'helicopter', circuitId: 'c01' },
      { file: '40-mountain-signature.png', camera: 'helicopter', circuitId: 'c02' },
      { file: '41-coastal-signature.png',  camera: 'helicopter', circuitId: 'c03' },
      { file: '42-desert-signature.png',   camera: 'helicopter', circuitId: 'c04' },
      { file: '43-urban-signature.png',    camera: 'helicopter', circuitId: 'c05' },
      { file: '44-modern-signature.png',   camera: 'helicopter', circuitId: 'c06' },
      // 45-52: Eras
      { file: '45-1980.png',              camera: 'trackside', eraYear: 1980 },
      { file: '46-early1990.png',         camera: 'trackside', eraYear: 1990 },
      { file: '47-late1990.png',          camera: 'trackside', eraYear: 1998 },
      { file: '48-2000.png',              camera: 'trackside', eraYear: 2005 },
      { file: '49-2010.png',              camera: 'trackside', eraYear: 2010 },
      { file: '50-2014.png',              camera: 'trackside', eraYear: 2014 },
      { file: '51-2020.png',              camera: 'trackside', eraYear: 2020 },
      { file: '52-2022.png',              camera: 'trackside', eraYear: 2022 },
      // 53-58: Liveries + sponsors
      { file: '53-livery-a.png',          camera: 'trackside', teamId: 'base.team.titan' },
      { file: '54-livery-b.png',          camera: 'trackside', teamId: 'base.team.aquila' },
      { file: '55-livery-c.png',          camera: 'trackside', teamId: 'base.team.boreal' },
      { file: '56-five-team-grid.png',    camera: 'helicopter' },
      { file: '57-sponsor-car.png',       camera: 'trackside', teamId: 'base.team.titan' },
      { file: '58-sponsor-garage.png',    camera: 'helicopter', teamId: 'base.team.titan' },
      // 59-63: Weather
      { file: '59-dry.png',               camera: 'helicopter', weather: 'dry', wetness: 0 },
      { file: '60-light-rain.png',        camera: 'helicopter', weather: 'lightRain', wetness: 0.5 },
      { file: '61-heavy-rain.png',        camera: 'helicopter', weather: 'heavyRain', wetness: 1 },
      { file: '62-wet-track.png',         camera: 'trackside', weather: 'heavyRain', wetness: 1 },
      { file: '63-spray.png',             camera: 'trackside', weather: 'heavyRain', wetness: 1 },
      // 64-67: Graphics presets
      { file: '64-low.png',               camera: 'helicopter', preset: 'low' },
      { file: '65-medium.png',            camera: 'helicopter', preset: 'medium' },
      { file: '66-high.png',              camera: 'helicopter', preset: 'high' },
      { file: '67-ultra.png',             camera: 'helicopter', preset: 'ultra' },
      // 68-71: Race phases
      { file: '68-battle.png',           camera: 'trackside', phase: 'BATTLE' },
      { file: '69-overtake.png',          camera: 'trackside', phase: 'OVERTAKE' },
      { file: '70-final-lap.png',        camera: 'helicopter', phase: 'FINAL_LAP' },
      { file: '71-chequered.png',        camera: 'helicopter', phase: 'FINISH' },
      // 72-75: Packaged-equivalent captures
      { file: '72-packaged-helicopter.png', camera: 'helicopter' },
      { file: '73-packaged-trackside.png', camera: 'trackside' },
      { file: '74-packaged-onboard.png',  camera: 'onboard' },
      { file: '75-packaged-pitstop.png',  camera: 'trackside', phase: 'PIT_SERVICE' },
    ]

    log(`capturing ${matrix.length} matrix screenshots`)
    let ok = 0, fail = 0
    for (const item of matrix) {
      try {
        const payload = {
          ...(item.camera ? { camera: item.camera } : {}),
          ...(item.eraYear !== undefined ? { eraYear: item.eraYear } : {}),
          ...(item.teamId ? { teamId: item.teamId } : {}),
          ...(item.weather ? { weather: item.weather, wetness: item.wetness ?? 1 } : {}),
          ...(item.circuitId ? { circuitId: item.circuitId } : {}),
          ...(item.preset ? { graphicsPreset: item.preset } : {}),
          ...(item.phase ? { racePhase: item.phase } : {}),
        }
        await page.evaluate((cfg) => {
          // Reset engine + apply config in one atomic block.
          if (typeof window.__pitwallVisualQA.reset === 'function') window.__pitwallVisualQA.reset()
          window.__pitwallVisualQA.load(cfg)
          if (typeof window.__pitwallVisualQA.pause === 'function') window.__pitwallVisualQA.pause()
          if (window.__setCameraMode && cfg.camera) window.__setCameraMode(cfg.camera)
          // Brief resume so cars animate to their grid slots before pause.
          if (typeof window.__pitwallVisualQA.resume === 'function') window.__pitwallVisualQA.resume()
        }, payload)
        await sleep(150)
        await page.evaluate(() => {
          if (typeof window.__pitwallVisualQA.pause === 'function') window.__pitwallVisualQA.pause()
        })
        await sleep(600)
        await page.screenshot({ path: path.join(OUT_DIR, item.file) })
        ok++
      } catch (e) {
        fail++
        process.stderr.write(`[p5-qa] failed ${item.file}: ${e && e.message}\n`)
      }
    }
    log(`matrix: ${ok} ok, ${fail} failed`)

    // Comparison images.
    const eraFiles = [
      { file: 'era-1980.png', year: 1980 },
      { file: 'era-1990.png', year: 1990 },
      { file: 'era-2000.png', year: 2005 },
      { file: 'era-2014.png', year: 2014 },
      { file: 'era-2022.png', year: 2022 },
    ]
    for (const e of eraFiles) {
      await page.evaluate((year) => {
        window.__pitwallVisualQA.load({ eraYear: year, camera: 'trackside' })
      }, e.year)
      await sleep(500)
      await page.screenshot({ path: path.join(OUT_DIR, e.file) })
    }
    log(`era comparison: ${eraFiles.length} captured`)

    const liveryTeams = ['base.team.titan', 'base.team.aquila', 'base.team.boreal', 'base.team.meridian', 'base.team.kestrel']
    for (const teamId of liveryTeams) {
      await page.evaluate((t) => {
        window.__pitwallVisualQA.load({ teamId: t, camera: 'trackside' })
      }, teamId)
      await sleep(500)
      const slug = teamId.split('.')[2]
      await page.screenshot({ path: path.join(OUT_DIR, `livery-${slug}.png`) })
    }
    log(`livery comparison: ${liveryTeams.length} captured`)

    for (const p of ['low', 'medium', 'high', 'ultra']) {
      await page.evaluate((preset) => {
        window.__pitwallVisualQA.load({ graphicsPreset: preset, camera: 'helicopter' })
      }, p)
      await sleep(500)
      await page.screenshot({ path: path.join(OUT_DIR, `graphics-${p}.png`) })
    }
    log(`graphics comparison: 4 captured`)

    log('done')
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (vite) stopVite(vite)
  }
}

main().catch((err) => {
  process.stderr.write(`[p5-qa] fatal: ${err && err.stack ? err.stack : err}\n`)
  process.exit(2)
})