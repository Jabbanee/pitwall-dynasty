# Pitwall Dynasty — 3D World Architecture

The 3D race broadcast is built on a strict layered architecture.
Nothing in the renderer may feed back into the authoritative
simulation.

```
AUTHORITATIVE SIMULATION (src/sim, src/championship)
  → produces a per-tick RaceSnapshot
TRACK PRESENTATION (src/ui/three/track-visual.ts, environment.ts)
  → builds a TrackVisualDefinition from a Circuit
  → turns the centreline + elevation into a 3D world
CAR PRESENTATION (src/ui/three/car3d.ts)
  → era-aware chassis, livery, wheels, compound markers
  → wheel spin + body pitch are presentation-only
CAMERA DIRECTOR (src/ui/three/cameras.ts)
  → local renderer-only TvDirector picks a CameraTarget
UI / BROADCAST GRAPHICS
  → timing tower, follow strip, strategy panel, event banners
```

## Track visual model

`TrackVisualDefinition` is the single source of truth for a
circuit's presentation. It contains:

- a closed centreline with elevation
- sector break fractions
- a list of `CurbZone` (presentation-only, side and style)
- a list of `RunoffZone` (asphalt / grass / gravel)
- a list of `BarrierZone` (armco / concrete / tyre-wall / fence)
- a list of `GrandstandZone` (with capacity)
- a list of `CameraPoint` (helicopter / trackside / onboard / pit-lane)
- a `PitLane` (entry, exit, side, boxes, speed limit)
- an `EnvironmentThemeId` that drives sky, fog, grass, trees

The definition is built deterministically from the circuit id via
`getTrackVisualDefinition(circuit)`. The same circuit always yields
the same visual definition.

## Environment themes

Six themes, each with its own sky / fog / palette / tree density:

- `forest` — enclosed, dense vegetation, green grass
- `mountain` — mixed enclosure, rolling elevation
- `coastal` — open, sparse trees, light palette
- `desert` — very open, sandy palette, no trees
- `urban-park` — enclosed, city-like greenery
- `modern-purpose-built` — open, manicured, clean palette

The theme is picked from the circuit's `characteristics` (braking
stress, high-speed share, overtaking difficulty, low-speed share)
plus a stable hash of the circuit id.

## Cars

Era families are encoded by a `eraFactor` in `[0..1]`:

| eraFactor | Era family          | Notes |
| --------- | ------------------- | ----- |
| 0         | 1980s               | tall airbox, tall rear wing, no halo, wing mirrors |
| 0.15      | early 1990s         | wide tall rear wing, no halo |
| 0.35      | late 1990s          | slightly lower wing, no halo |
| 0.55      | 2009–2013           | lowered wing, no halo |
| 0.7       | 2014–2018           | low wing, no halo |
| 0.82      | 2019–2021           | low wing, halo, no full floor yet |
| 0.95      | 2022+ ground effect | wide tub, low wing, halo, floor strake |

The `CarVisual.eraDimensions` field exposes the dimensional
fingerprint for tests.

## Compound colours

Tyre wall markers follow the industry-standard functional colour
encoding:

- Soft — red
- Medium — yellow
- Hard — white
- Intermediate — green
- Wet — blue

`createCar().setCompound(index)` swaps the marker on each wheel at
runtime.

## Weather

`buildTrackWorld().setWetness(0..1)` is the per-frame hook the
renderer calls. The actual sky / fog / light update lives in
`applyWeatherVisuals` in `broadcast3d.ts`:

- sky colour lerps from theme to a darker wet tint
- fog density increases
- directional light intensity drops
- a small `Points` cloud (`SPRAY_MAX = 220`) emits particles behind
  every car when the track is wet

Heavy rain drops directional light to 0.4.

## Graphics presets

`graphicsLevel` is `0|1|2|3` for LOW / MEDIUM / HIGH / ULTRA. The
broadcast reads it from the settings store and passes it to
`buildTrackWorld`. Effects:

- LOW — 30% tree density, no crowd blocks
- MEDIUM — 60% tree density, smaller crowd blocks
- HIGH — 100% tree density, 22-block crowd
- ULTRA — 100% tree density, 32-block crowd

The simulation tick rate is unchanged.

## Cleanup

`broadcast3d.ts` installs a `MutationObserver` that, on broadcast
unmount, disposes every car visual, the spray `Points`, the
rain `Points`, the world group, and the renderer. It also calls
`WEBGL_lose_context.loseContext()` so a returning broadcast gets a
fresh WebGL context.

## Live car motion pipeline

The presentation motion pipeline is the most important visual
contract in the game. The user must see cars actually moving
on track; static cars are an instant credibility failure. The
pipeline is:

```
Authoritative race state (LiveRaceEngine, multiplayer snapshot)
  → car.totalTime, car.lapStartTime, car.lastLapTime, simTime
  → frameStep(targetSimTime)
      advances simTime smoothly
      calls stepLap() once when crossing a leader-lap boundary
  → lapFractionOf(car) = clamp((simTime - car.lapStartTime) / car.lastLapTime)
  → world.positionAt(frac, vec3)  // track centreline
  → visual.group.position.lerp(vec3, 0.35)
  → visual.group.rotation.y = atan2(tangent.x, tangent.z)
```

The pre-P2 broadcast had a bug: it called `stepLap` in a tight
loop until `simTime` caught up to `cursorSeconds`, which means
a single render frame could cover an entire leader lap. Cars
either stayed in place or jumped a full lap per frame. The fix
is `frameStep(target)` which advances the clock in 1 s slices
and only fires `stepLap` when the clock actually crosses the
leader's `totalTime` boundary. Between boundaries the clock
slides smoothly and the cars slide smoothly with it.

For multiplayer, the same pipeline uses the gap-derived
fraction: `frac = (car.lap - leader.lap) + (gapSeconds * 55 / trackLength)`,
modulo 1.

Pit cars: when `car.pitThisLap` is set, the car is snapped to a
fixed point on the pit lane centreline at its team box and the
wheels are visually stopped.

### Dev motion probe

When `localStorage.pitwall-dynasty.devProbe === '1'`, the
broadcast writes the first car's world transform every frame
to `window.__pitwallMotion = { t0, samples[] }`. The headless
test harness reads it and asserts that consecutive samples
differ in world space by a meaningful distance. The probe is
compiled in to all builds but no-ops without the localStorage
flag.

Verified motion in the live packaged build (motion-proof
screenshots): a 1.5 s window showed the lead car moving from
lap 1 at world position (100, 0.8, 0) to lap 2 at (165, 1.3,
0), a forward travel of 65 m in 977 ms — about 67 m/s or
240 km/h, matching the simulation pace.

### Pit path movement (P3)

When `car.pitThisLap` is true, the renderer snaps the car to a
deterministic spot on the pit-lane centreline derived from a
hash of the car id. The wheels stop spinning (visual.update is
called with speed=0). This gives a believable "in the box" stop
without modifying authoritative state.

## Car presentation P3 (visual quality)

The car model is procedural and modular, with era-aware
silhouettes. Each era family produces a recognisably different
chassis:

- 1980s — slim, tall airbox, tall rear wing, no halo, wing
  mirrors
- early 1990s — slightly wider, multi-element front wing
- late 1990s — wide track, low rear wing
- 2009–13 — wide, low front wing, beam wing, no halo
- 2014–18 — wider, low rear wing, no halo
- 2019–21 — halo present
- 2022+ — wide tub, halo, ground-effect floor

Modelled features:
- nose cone (slim → wide)
- front wing with endplates and era-correct elements
- cockpit with driver helmet, era-correct visor (modern)
- sidepods with era-correct inlets, bargeboards (modern)
- engine cover with low scoop (modern) or tall airbox (old)
- rear wing with endplates (1980s), DRS-style flap (modern)
- beam wing (era > 0.4)
- ground-effect floor + floor edge (era > 0.6)
- halo (era > 0.55) with central pylon
- four wheels with hub, brake disc hint, and compound colour
  marker (red soft / yellow medium / white hard / green int /
  blue wet)
- suspension arms (2-4 per wheel depending on era)
- diffuser (era > 0.5)
- T-cam (era > 0.7)
- livery: team-primary body, secondary stripes on nose, sidepod
  and engine cover, number plate on engine cover + sidepods +
  nose, helmet in primary with secondary stripe
- body pitch under accel/brake, roll in corners (presentation
  only — does not feed back into simulation)

## Track visual P3 (visual quality)

- Asphalt vertex-coloured: dark racing line down the centre
  20 % of the track (rubbered), 20 % worn asphalt on each side,
  base asphalt on the outer edges
- Chequered start/finish line across the racing line
- Sector marker poles at the two sector boundaries
- Pit complex: 10 team-coloured garages (alternating yellow /
  grey), low white pit wall facing the track, glass-fronted
  timing tower above the wall with antenna and support struts
- Sponsor boards (white with red stripe) along Armco and
  concrete barriers
- The six environment themes still drive the palette, sky, fog
  and vegetation density; they now also drive the timing tower
  (modern glass front), the run-off material mix (asphalt /
  grass / gravel) and the curb style (red-white / red-only /
  yellow).

## Weather P3 (visual quality)

- Spray: 600-point cloud behind every car on a wet track
- Rain streaks: 800-point cloud that fills a 100 m box
  around the camera and falls at ~30 m/s. Opacity scales with
  the weather condition: 0.55 in light rain, 0.85 in heavy
  rain, 0 in dry (drains over a second on change).
- Sky and fog still darken with track wetness, the directional
  light intensity drops 0.4 in heavy rain.

