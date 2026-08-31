import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Visual screenshot manifest verifier.
 *
 * This test enforces the P5 closure requirement: every required
 * filename in docs/testing/screenshots/3d-visual-p5-complete/ must
 * exist on disk. If the file is missing the test fails, which
 * keeps the visual QA in CI honest.
 *
 * The list of required filenames is the complete 75-shot matrix
 * from the brief.
 */
const REQUIRED_FILES: string[] = [
  // 01-04 Grid + lights
  '01-grid-wide.png',
  '02-grid-front.png',
  '03-lights-on.png',
  '04-lights-out.png',
  // 05-10 Cameras
  '05-trackside-speed.png',
  '06-long-lens-braking.png',
  '07-apex-low.png',
  '08-exit-pan.png',
  '09-helicopter.png',
  '10-onboard.png',
  // 11-16 Track surface
  '11-asphalt-close.png',
  '12-racing-line.png',
  '13-braking-rubber.png',
  '14-curb-close.png',
  '15-gravel.png',
  '16-grass.png',
  // 17-20 Barriers + fencing
  '17-armco.png',
  '18-concrete.png',
  '19-tyre-wall.png',
  '20-safety-fence.png',
  // 21-30 Pit complex + crew
  '21-pit-complex.png',
  '22-team-garage.png',
  '23-pit-wall.png',
  '24-pit-crew-ready.png',
  '25-pit-entry.png',
  '26-pit-transit.png',
  '27-pit-arrival.png',
  '28-pit-service.png',
  '29-pit-release.png',
  '30-pit-exit.png',
  // 31-32 Grandstand + crowd
  '31-grandstand.png',
  '32-crowd.png',
  // 33-38 Venues
  '33-forest.png',
  '34-mountain.png',
  '35-coastal.png',
  '36-desert.png',
  '37-urban.png',
  '38-modern.png',
  // 39-44 Signatures
  '39-forest-signature.png',
  '40-mountain-signature.png',
  '41-coastal-signature.png',
  '42-desert-signature.png',
  '43-urban-signature.png',
  '44-modern-signature.png',
  // 45-52 Eras
  '45-1980.png',
  '46-early1990.png',
  '47-late1990.png',
  '48-2000.png',
  '49-2010.png',
  '50-2014.png',
  '51-2020.png',
  '52-2022.png',
  // 53-58 Liveries + sponsors
  '53-livery-a.png',
  '54-livery-b.png',
  '55-livery-c.png',
  '56-five-team-grid.png',
  '57-sponsor-car.png',
  '58-sponsor-garage.png',
  // 59-63 Weather
  '59-dry.png',
  '60-light-rain.png',
  '61-heavy-rain.png',
  '62-wet-track.png',
  '63-spray.png',
  // 64-67 Presets
  '64-low.png',
  '65-medium.png',
  '66-high.png',
  '67-ultra.png',
  // 68-71 Race phases
  '68-battle.png',
  '69-overtake.png',
  '70-final-lap.png',
  '71-chequered.png',
  // 72-75 Packaged
  '72-packaged-helicopter.png',
  '73-packaged-trackside.png',
  '74-packaged-onboard.png',
  '75-packaged-pitstop.png',
]

// Files in the same folder that are not part of the 75-shot
// manifest but are produced by the capture pipeline (smoke and
// comparison images). They must NOT be tracked by the manifest
// verifier.
const OPTIONAL_FILES: string[] = [
  '_smoke.png',
]

describe('visual screenshot manifest', () => {
  it('the manifest declares 75 entries', () => {
    expect(REQUIRED_FILES.length).toBe(75)
  })

  it('every required file is present on disk', () => {
    const dir = resolve(process.cwd(), 'docs/testing/screenshots/3d-visual-p5-complete')
    const missing: string[] = []
    for (const f of REQUIRED_FILES) {
      const path = resolve(dir, f)
      if (!existsSync(path)) missing.push(f)
    }
    if (missing.length > 0) {
      throw new Error(`Missing ${missing.length} screenshots: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '...' : ''}`)
    }
  })
})
