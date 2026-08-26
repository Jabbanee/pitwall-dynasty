# Pitwall Dynasty

**Multiplayer-first motorsport management game.** Build your racing team, lock in
your decisions, then watch them play out on track — together, on a shared
deterministic race broadcast.

Pitwall Dynasty is set in a fully fictional motorsport universe (no F1
trademarks or real names) and is extensively moddable via versioned content
packs.

## What it is

Players do not drive. They manage:

- drivers (contracts, development, morale, form)
- staff (7 roles with real gameplay effects)
- car parts and development projects (tradeoffs, not flat "+2 aero")
- facilities, finances, sponsors
- race setup and a deep pre-race **strategy playbook** (pit windows, weather
  rules, safety-car rules, late-race attack, pace/tyre/energy modes)

Once the race package is **locked**, decisions are immutable. An authoritative
headless simulator runs the race in milliseconds and produces an event
timeline. Everyone then watches the **same race** on a shared broadcast cursor,
each from their own locally-chosen camera.

## Architecture

```
Championship state
  → Team state
    → Immutable Race Packages (hash-stamped at lock)
      → Authoritative headless race simulator (seeded, deterministic)
        → Immutable Race Result + Event Timeline
          → Broadcast Controller (shared cursor, voting)
            → Clients / Spectators (local camera choice)
```

Key decisions:

- **Determinism**: every race is reproducible from `seed + packages +
  simulationVersion + rulesHash`. All randomness flows through a seeded
  mulberry32 PRNG (`src/core/rng.ts`). No `Math.random` in sim code paths.
- **Server-authoritative shape**: in this prototype the "server" is the
  in-process `GameEngine` class (`src/championship/game-engine.ts`); the UI
  only requests actions and reads revealed state. A real multiplayer transport
  can wrap the same API.
- **Two time concepts**: *simulation time* (immutable, inside the race) vs
  *broadcast cursor* (playback position — can pause, speed up, rewind).
- **Future event protection**: `GameEngine.revealEvents(upToTime)` only hands
  clients events up to the cursor; full results unlock after the race.
- **Headless sim**: `src/sim/race-sim.ts` — lap-by-lap discrete model with
  tyres, weather crossover, fuel, damage, reliability, overtaking, safety cars
  and a rules-driven strategy engine (AI teams use the same playbooks as
  players — no cheating).

## Install & run

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # Vitest suite (determinism, standings, save/load, modding…)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build
```

> Windows note: if `npm install` skips devDependencies, a `NODE_ENV=production`
> environment variable is the likely cause — install with `NODE_ENV=development`.

## How a round works (Fast Championship)

1. **Management phase** — countdown timer; inspect car vs circuit, weather
   forecast, pick setup, tyres, pit windows and conditional rules. AI teams
   prepare via the same playbook system.
2. **Lock** — race packages are snapshotted and hashed; qualifying + race are
   simulated instantly.
3. **Shared broadcast** — TV / Team / Driver / Track Map / Battle cameras,
   1x–8x speed, rewind, pause. The auto-director follows the most interesting
   action (lead changes, incidents, pit battles) with a minimum shot length.
4. **Results** — classification, fastest lap, key moments, standings update.
5. **Next round** — development projects and facility upgrades tick forward.

## Modes

- **Quick Start** — one-click Fast Championship (10 teams, 5 rounds, 9 AI).
- **Fast Championship** — configurable teams (4–11), races, timers, weather.
- **Solo Career** — multi-season on the same core: driver aging/development/
  retirement, rookie generation, contract market, facility upgrades, season
  history and past champions.

## Simulation model (high level)

- **Car performance** is 12 attributes (aero bands, drag, braking, traction,
  tyre wear/heating, cooling, reliability, energy efficiency) weighted per
  circuit — a car can be great at one track and poor at another.
- **Tyres**: Soft/Medium/Hard/Intermediate/Wet with warmup, degradation,
  wear cliff and gradual wetness crossover (not binary).
- **Weather**: rain arrives/evolves from the seed; track wetness drives tyre
  crossover and incident risk.
- **Incidents**: lockups, spins, crashes, mechanical failures — probabilities
  emerge from aggression, consistency, wetness, damage, component condition
  and circuit stress, not pure dice rolls.
- **Strategy engine**: planned stints + conditional rules (wet switch, SC pit,
  late attack) evaluated every lap; decisions appear in the broadcast feed with
  the *reason* ("Safety Car Rule: cheap stop", "Planned pit window…").

## Modding

Mods are versioned manifests with stable IDs (`example.driver.00001`), see
`src/content/modding.ts` and the built-in sample/template in
**Dev Tools → Mod Validation**. Validation covers malformed data, duplicate
IDs, missing references, version compatibility and value sanity. Multiplayer
locks are computed from game version + sim version + rules hash + mod content
hashes.

## Save system

`localStorage`-backed with a schema-versioned envelope
(`src/state/persistence.ts`); corrupt or incompatible saves fail gracefully
with actionable messages.

## Dev tools

Open **Dev** in the top bar: batch-simulate 100/500 races with aggregate
balance stats (win distribution, DNF rate, pit counts, SC rates, overtakes),
instantly simulate the current round, jump rounds, reset save, validate mods.

## Current scope / limitations

- Multiplayer transport (lobby, join codes, live vote sync) is
  architecture-ready but not wired to a network; the local build resolves
  votes solo.
- Practice sessions and research/future-regulations are stubs in the economy
  model (facilities + development carry the progression loop).
- Broadcast visuals are stylized 2D (canvas) by design, not 3D.
- One driver per team races per event (the second driver is the reserve).

## Repo layout

```
src/
  core/       types, seeded RNG, tyres, fictional content pack (10 teams, 24
              drivers, 10 circuits, 12 sponsors, 21 staff)
  sim/        deterministic race + qualifying simulation
  championship/ creation, engine (standings/economy/dev/contracts/seasons),
              GameEngine orchestration
  ai/         AI managers (same playbook system as players)
  broadcast/  shared cursor controller, voting, auto-director
  content/    mod manifest format + validation + sample mod
  state/      store + persistence
  ui/         vanilla-TS screens (menu, HQ, weekend, broadcast, results…)
tests/        Vitest: determinism, classification, standings, economy,
              save/load, mod validation, timeline consistency
```
