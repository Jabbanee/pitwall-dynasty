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
world group, and the renderer. It also calls
`WEBGL_lose_context.loseContext()` so a returning broadcast gets a
fresh WebGL context.
