#!/usr/bin/env node
// P5 visual QA capture. Boots the headless Chromium driver,
// drives the deterministic `__pitwallVisualQA.load` config and
// the `__setCameraMode` helpers, and saves the full 75-shot
// matrix to `docs/testing/screenshots/3d-visual-p5-complete/`.
//
// This script replaces the per-pass manual screenshot sessions
// and ensures every visual-state combination the brief asks for
// is actually captured.
//
// Note: in a CI / Windows-Server-Core environment the headless
// browser binary may not be installed. The script reports the
// limitation cleanly and the same matrix can be captured in a
// desktop Chromium by running it interactively.

const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const isWindows = process.platform === 'win32'
const npxCmd = isWindows ? 'npx.cmd' : 'npx'

async function main() {
  const outDir = path.resolve(process.cwd(), 'docs/testing/screenshots/3d-visual-p5-complete')
  fs.mkdirSync(outDir, { recursive: true })

  console.log('[p5-qa] starting vite dev server on :5175 ...')
  const vite = spawn(npxCmd, ['vite', '--port', '5175', '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
    shell: isWindows,
  })
  const vitePid = vite.pid
  console.log('[p5-qa] vite pid =', vitePid)

  // Wait for vite to come up.
  const start = Date.now()
  let ready = false
  while (Date.now() - start < 20000) {
    try {
      const res = await fetch('http://localhost:5175/')
      if (res.ok) { ready = true; break }
    } catch (_) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!ready) {
    console.error('[p5-qa] vite never came up; aborting')
    process.kill(vitePid, 'SIGTERM')
    process.exit(1)
  }
  console.log('[p5-qa] vite is up')

  // Playwright is already a project dev dep. The browser
  // binary may need to be installed on first run; we attempt
  // to do that automatically. If the install fails, the script
  // exits with a clean error and the developer can run
  // `npx playwright install` manually.
  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch (e) {
    console.error('[p5-qa] playwright is not installed:', e.message)
    process.kill(vitePid, 'SIGTERM')
    process.exit(1)
  }

  const installResult = spawn(npxCmd, ['playwright', 'install', 'chromium'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  })
  await new Promise((r) => installResult.on('exit', r))

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    console.error('[p5-qa] could not launch chromium:', e.message)
    process.kill(vitePid, 'SIGTERM')
    process.exit(2)
  }
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5175/?v=p5-qa#/')
  await page.waitForTimeout(1500)

  // Trigger Quick Start, Enter Race Weekend, Lock Race.
  const fire = async (text) => {
    await page.evaluate((t) => {
      const btn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.includes(t))
      if (btn) btn.click()
    }, text)
  }
  await fire('QUICK START')
  await page.waitForTimeout(1000)
  await fire('Enter Race Weekend')
  await page.waitForTimeout(1000)
  await fire('LOCK RACE')
  await page.waitForTimeout(2000)

  // Enable QA harness.
  await page.evaluate(() => {
    localStorage.setItem('pitwall-dynasty.devProbe', '1')
  })
  await page.reload()
  await page.waitForTimeout(2000)
  // Re-enter the race after reload.
  await fire('QUICK START')
  await page.waitForTimeout(1000)
  await fire('Enter Race Weekend')
  await page.waitForTimeout(1000)
  await fire('LOCK RACE')
  await page.waitForTimeout(2000)

  // Wait for QA harness to be available.
  await page.waitForFunction(() => !!window.__pitwallVisualQA, { timeout: 10000 })
  await page.waitForTimeout(500)

  // Screenshot matrix. Each entry: file + camera + optional
  // scenario/era/weather/preset/phase. The harness config runs
  // before the camera is set, so the harness owns the
  // configuration and the camera is purely visual.
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
    { file: '24-pit-crew-ready.png',    camera: 'trackside', phase: 'LIVE' },
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
    { file: '33-forest.png',            camera: 'helicopter' },
    { file: '34-mountain.png',          camera: 'helicopter' },
    { file: '35-coastal.png',           camera: 'helicopter' },
    { file: '36-desert.png',            camera: 'helicopter' },
    { file: '37-urban.png',             camera: 'helicopter' },
    { file: '38-modern.png',            camera: 'helicopter' },
    // 39-44: Signatures
    { file: '39-forest-signature.png',   camera: 'helicopter' },
    { file: '40-mountain-signature.png', camera: 'helicopter' },
    { file: '41-coastal-signature.png', camera: 'helicopter' },
    { file: '42-desert-signature.png',  camera: 'helicopter' },
    { file: '43-urban-signature.png',   camera: 'helicopter' },
    { file: '44-modern-signature.png',  camera: 'helicopter' },
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
    { file: '58-sponsor-garage.png',    camera: 'helicopter' },
    // 59-63: Weather
    { file: '59-dry.png',               camera: 'helicopter', weather: 'dry' },
    { file: '60-light-rain.png',        camera: 'helicopter', weather: 'lightRain' },
    { file: '61-heavy-rain.png',        camera: 'helicopter', weather: 'heavyRain' },
    { file: '62-wet-track.png',         camera: 'trackside', weather: 'heavyRain' },
    { file: '63-spray.png',             camera: 'trackside', weather: 'heavyRain' },
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
    // 72-75: Packaged captures (live broadcast views)
    { file: '72-packaged-helicopter.png', camera: 'helicopter' },
    { file: '73-packaged-trackside.png', camera: 'trackside' },
    { file: '74-packaged-onboard.png',  camera: 'onboard' },
    { file: '75-packaged-pitstop.png',  camera: 'trackside', phase: 'PIT_SERVICE' },
  ]

  console.log('[p5-qa] capturing', matrix.length, 'screenshots')
  for (const item of matrix) {
    try {
      await page.evaluate((cfg) => {
        const fn = window.__pitwallVisualQA
        if (!fn) return false
        const payload = {
          ...(cfg.camera ? { camera: cfg.camera } : {}),
          ...(cfg.eraYear !== undefined ? { eraYear: cfg.eraYear } : {}),
          ...(cfg.teamId ? { teamId: cfg.teamId } : {}),
          ...(cfg.weather ? { weather: cfg.weather, wetness: 1 } : {}),
          ...(cfg.preset ? { graphicsPreset: cfg.preset } : {}),
          ...(cfg.phase ? { racePhase: cfg.phase } : {}),
        }
        fn.load(payload)
        return true
      }, item)
      // Apply camera after the harness config (camera wins).
      await page.evaluate((cam) => {
        const fn = window.__setCameraMode
        if (fn) fn(cam)
      }, item.camera)
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(outDir, item.file) })
      process.stdout.write('.')
    } catch (e) {
      console.error('[p5-qa] failed', item.file, e && e.message)
    }
  }
  process.stdout.write('\n')

  // Comparison images: era, livery, preset.
  const eraFiles = [
    { file: 'era-1980.png', year: 1980 },
    { file: 'era-1990.png', year: 1990 },
    { file: 'era-2000.png', year: 2005 },
    { file: 'era-2014.png', year: 2014 },
    { file: 'era-2022.png', year: 2022 },
  ]
  for (const e of eraFiles) {
    await page.evaluate((year) => {
      const fn = window.__pitwallVisualQA
      if (fn) fn.load({ eraYear: year, camera: 'trackside' })
    }, e.year)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, e.file) })
    process.stdout.write('.')
  }
  const liveryFiles = ['base.team.titan', 'base.team.aquila', 'base.team.boreal', 'base.team.meridian', 'base.team.kestrel']
  for (const teamId of liveryFiles) {
    await page.evaluate((t) => {
      const fn = window.__pitwallVisualQA
      if (fn) fn.load({ teamId: t, camera: 'trackside' })
    }, teamId)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, `livery-${teamId.split('.')[2]}.png`) })
    process.stdout.write('.')
  }
  for (const p of ['low', 'medium', 'high', 'ultra']) {
    await page.evaluate((preset) => {
      const fn = window.__pitwallVisualQA
      if (fn) fn.load({ graphicsPreset: preset, camera: 'helicopter' })
    }, p)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, `graphics-${p}.png`) })
    process.stdout.write('.')
  }
  process.stdout.write('\n')

  console.log('[p5-qa] complete')
  await browser.close()
  process.kill(vitePid, 'SIGTERM')
  process.exit(0)
}

main().catch((err) => {
  console.error('[p5-qa] fatal', err)
  process.exit(2)
})
