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
npm run dev        # http://localhost:5173   (frontend)
npm run server     # ws://localhost:8080    (multiplayer, optional for single-player)
```

```bash
npm test           # Vitest suite (determinism, standings, save/load, modding…)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build
```

> Windows note: if `npm install` skips devDependencies, a `NODE_ENV=production`
> environment variable is the likely cause — install with `NODE_ENV=development`.

## Modes (main menu)

1. **Quick Start** — one-click Fast Championship (10 teams, 5 rounds).
2. **Fast Championship** — configurable teams, races, timers, weather.
3. **Multiplayer** — host or join a real Fast Championship with friends.
   The browser connects to a Node WebSocket server, the server is
   authoritative for all race state, every client just sends actions and
   receives snapshots. Lobby code, ready, start, live commands, voting,
   reconnect all work over one socket.
4. **Solo Career** — multi-season on the same core, Real or Fictional
   Career, era selector (1980 / 1990 / 1998 / 2005 / 2010 / 2014 / 2022).

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
In the Driver Ecosystem pass the Dev panel also exposes:
generate junior class, simulate junior round, simulate junior season,
reveal scouting, set driver potential, sign to academy, make licence
eligible, advance one season.

## Driver ecosystem

A persistent pyramid sits under the main championship:

- Lower junior — "Regional Formula" (fictional)
- Upper junior — "Continental Formula" (fictional)
- Women's development — "Aurora Formula" (fictional)
- Top — "World Grand Prix"

All driver generation, scouting, academy, contracts, eligibility
and reserve roles run locally in Career. Multiplayer is unchanged
and remains the top-championship-only authoritative model.

Gender is identity data, never a driving-performance modifier.
Male and female drivers use identical skill / potential /
development / decline systems. The women's series is a development
championship, not a weaker series, and any female driver can
promote into the normal junior and top series. See
[`docs/DRIVER_ECOSYSTEM.md`](docs/DRIVER_ECOSYSTEM.md) for the full
contract.

## Current scope / limitations

- **Multiplayer (P0 — true shared race)** is end-to-end server-
  authoritative. The browser never simulates a multiplayer race
  locally: in multiplayer mode the central store (`store.multi`)
  holds the championship and the 3D broadcast reads every car
  position, lap, weather, pit state and event from the server. The
  server owns the `LiveRaceEngine`, the append-only live command log,
  voting, results, standings and round progression. Clients send
  actions and receive reveal-safe snapshots.

  - **Reconnect**: the server issues an opaque 24-char base32
    `sessionToken` at first join. The browser persists it in
    `localStorage` and re-authenticates with `restoreSession` on tab
    reload — the same player keeps the same team, ready state and
    championship. Unauthorised tokens are rejected.
  - **Ownership**: the server refuses commands that target another
    human player's team or a driverId that does not belong to the
    claimed team. Verified in `tests/multiplayer-snapshot.test.ts`.
  - **Two drivers per team**: each player manages both drivers
    independently (different pace, energy, pit, tyre, team orders).
  - **Voting**: configurable majority / unanimity for speed / pause
    / rewind. Return to 1x is unblockable. Replay (rewind) never
    rewrites history: commands during replay are queued and
    applied on `resumeLive`.
  - **Standings** accumulate across completed rounds.
  - **Verified** with `tests/multiplayer-two-client.cjs`:
    two raw WebSocket clients (one browser + one Node) see the
    same championship ID, identical car states, identical
    finishing order and identical standings, and both advance to
    the next round. Visual proof in
    `docs/testing/screenshots/multiplayer-p0/`.
- **Driver Agency** is championship-scoped: every Fast Championship
  and League Championship starts with a fresh agency baseline. Driver
  memory, morale, trust, teammate relationships, broken promises,
  compliance verdicts — all reset per championship. Static personality
  traits (ego, aggression, professionalism) remain.
- **Regulations Engine** is era-aware: 1980 / 1989 / 1995 / 2003 / 2011
  / 2014 / 2022 eras. The 2003–2010 era models the team-order
  prohibition (direct swaps PROHIBITED, coded orders RISKY with
  steward scrutiny / fine / points-penalty risk).
- **Commentary engine** is event-driven, two roles (LEAD COMMENTATOR
  for action, ANALYST for strategy context), rate-limited, dedupe on
  identical events, fully offline (no external API).
- **Paddock Post** post-race publication: real lead headline, stat
  tiles, story cards, driver quotes, teammate disputes, championship
  picture, transfer rumours, regulation news.
- **Interviews** trigger contextually (unexpected win, driver collision,
  teammate dispute, championship battle, refused order, broken promise)
  with 3 response options each, applying real morale / trust /
  reputation / media-sentiment / teammate-relationship effects.
- **3D Broadcast** uses Three.js with era-aware car geometry, helicopter
  camera, live strategy panel, team radio, battle notifications with
  WATCH button, notification suppression when the relevant battle is
  already on screen, per-driver camera selection (My Driver 1 / My
  Driver 2 / Leader / Watch Battle), independent per-player camera.
- **Team orders** show AVAILABLE / RISKY / PROHIBITED /
  DRIVER UNCERTAIN badges with title reasons — no unexplained disabled
  actions. Driver verdicts (Very Likely / Likely / Uncertain /
  Unlikely / Very Unlikely) come from `assessCompliance()` against
  the driver's agency state, with positive/negative reason chips.
- **Practice** is functional: Quick Sim (low effort) and Manual Plan
  (longRun / qualiSim / raceSim focus × low/standard/high effort)
  produce a setup-confidence bonus consumed by the live race engine.
- **Research** is functional: car development projects with stat
  tradeoffs, future-regulation research loop.
- **Era selection** covers 1980 / 1990 / 1998 / 2005 / 2010 / 2014 /
  2022, each with team-orders / qualifying / refuelling / compounds /
  points / cost-cap / safety-car summaries in the era panel.

## Visual QA

Screenshots and per-file verification live in
`docs/testing/VISUAL_QA.md` and the captured images are in
`docs/testing/screenshots/phase2/`.

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
              save/load, mod validation, timeline consistency,
              driver ecosystem (gender-neutral talent, feeder mechanics,
              scouting, contracts, 12-season stress test)
```

## Driver ecosystem (Career)

Local Career includes a full driver pipeline:

- Three fictional feeder championships: Regional Formula,
  Continental Formula, Aurora Formula
- Aurora is the dedicated women's development series — fictional,
  fictional emblems, fictional circuits. Aurora is **not** a
  lower-talent tier: gender is identity/context only and never
  affects driving ability, potential, development, or AI valuation.
- Scouting engine, watchlist, Driver Academy, reserve role, Elite
  Racing Licence — all wired into the same driver pool and the same
  agency / promises infrastructure the top championship already uses
- Save schema version bumped to 3 with a deterministic migration
  for legacy saves (gender default, licence state, feeder state,
  womenSeriesEstablished)

See `docs/DRIVER_ECOSYSTEM.md` for the full design and
`docs/PROJECT_STATUS.md` for the implementation status.

**145/145** vitest tests pass. TypeScript is clean. Production build
is green. The two-client multiplayer smoke test passes.
