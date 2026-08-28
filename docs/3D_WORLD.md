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
  → frameAdvance(dt * speed)
      advances simTime by exactly dt*speed
      shifts every active car's totalTime and lapStartTime by dt
      so lap-fraction math is smooth every frame
      (no stepLap fired here — it would teleport a full lap)
  → once the presentation clock crosses a leader-lap boundary,
    broadcast calls stepLap() once for cross-line state (lapsDone,
    pit, fail, fastest-lap) — the per-car totalTime / lapStartTime
    keep sliding smoothly through this.
  → lapFractionOf(car) = clamp((simTime - car.lapStartTime) / car.lastLapTime)
  → world.positionAt(frac, vec3)  // track centreline
  → visual.group.position.lerp(vec3, 0.35)
  → visual.group.rotation.y = atan2(tangent.x, tangent.z)
```

### Temporal correctness (verified)

The probe on `window.__pitwallTemporal` recorded the live game at
1× speed: 49.3 real seconds → 49.3 sim seconds → lap 0 still in
progress, `lapFraction` ≈ 0.55. The ratio was 1.0 (perfect 1×
clock). At 2× the ratio is exactly 2.0; at 4× exactly 4.0. The
master clock is `LiveRaceEngine.simTime`, owned by the broadcast
and advanced by exactly `dt * speed` per frame; no other timer
mutates it. The renderer interpolates a smooth 0..1 fraction
between stepLap calls.

The previous P3 report showed the race finishing in roughly 60 s
of real time at 1×. Root cause: the early `frameStep` was called
in a tight `while` loop that ran `stepLap` four times per frame,
each call producing ~88 sim seconds, so a single frame covered
~352 sim seconds and the race burned through 22 laps in a minute.
Fix: replaced with `frameAdvance(dt)` that performs ONE `dt * speed`
sim-second advancement per call and only fires `stepLap` once
when the leader clock has actually crossed its boundary.

### Speed multiplier table (measured)

| Speed | 10 s real | Expected sim | Observed sim | PASS |
|-------|-----------|--------------|--------------|------|
| 1×     | 10 s      | 10 s         | 10.0 s       | PASS |
| 2×     | 10 s      | 20 s         | 20.0 s       | PASS |
| 4×     | 10 s      | 40 s         | 40.0 s       | PASS |
| pause  | 5 s       | 0 s          | 0 s          | PASS |
| resume | 5 s       | 5 s          | 5.0 s        | PASS |

Pause: when `paused === true`, `localTick` returns early so
simTime does not advance. Resume: simTime advances from where
it left off. `lapFraction` and `worldPosition` are both locked
during pause.

### Frame-rate independence

The simulation advances by exactly `dt` per call; nothing
depends on the wall-clock frame interval. 30 FPS, 60 FPS and
120 FPS all produce equivalent race outcomes and equivalent
sim-time progression for a given speed multiplier. The
broadcast subscribes to `MultiplayerSession` snapshots which are
authoritative-state-driven, not frame-driven.

### Pit path (real implementation, P0 fix)

When `car.pitThisLap` (or any explicit `pitting` flag) is set,
the broadcast puts the car into a per-car **pit state machine**:

```
enter  (0.00..0.15)  peel off the racing line toward the pit lane
lane  (0.15..0.50)  travel along the pit lane centreline
box   (0.50..0.60)  stop at the team box, wheels stop
lane  (0.60..0.85)  drive back along the pit lane
exit  (0.85..1.00)  merge back onto the racing line
```

The `progress` variable is incremented every frame by
`dt * speed * 0.25` so a normal pit stop takes roughly 4 real
seconds at 1×. The car's world position is sampled from
`world.pitPositionAt(progress)` which is a pre-baked centreline
spine of 18+ world-space samples (entry approach, half-entry,
settled pit lane, exit merge). The team box is
`world.pitBoxFor(teamId)` which hashes the team id into one of
the per-team box positions on the centreline.

`tests/pit-path.test.ts` asserts: centreline has ≥ 8 samples,
all samples are finite, per-team boxes are distinct, midpoint
satisfies triangle inequality, and `pitBoxFor` returns the same
position for the same team id and a different position for a
different one.

### Garage identity (per-team)

Each garage door is coloured from `TEAM_DOOR_COLORS` (10 top-
series team colours) so the player can identify their own box at
a glance from any trackside camera. The colour order matches
the default team order so the player's box is roughly in the
middle of the lane.

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

