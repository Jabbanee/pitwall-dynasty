# Driver Ecosystem

The driver ecosystem is the full pipeline that turns a junior rookie into a
top-series race seat. It is local Career only — multiplayer shares the
top-series roster, the agency state and the racing, but the feeder
simulation is single-player territory.

## Series pyramid

Three fictional feeder championships feed the top "World Grand Prix"
championship:

| Stable id                    | Name              | Tier           | Established | Rounds | Grid | Era gate                       |
| ---------------------------- | ----------------- | -------------- | ----------- | ------ | ---- | ------------------------------ |
| `base.junior.regional`       | Regional Formula  | lower-junior   | S1          | 8      | 18   | none                           |
| `base.junior.continental`    | Continental Formula| upper-junior  | S1          | 10     | 16   | none                           |
| `base.junior.aurora`         | Aurora Formula    | women          | S2014       | 8      | 16   | eraYear ≥ 2014 OR flag flipped |
| `base.championship.wgp`      | World Grand Prix  | top            | S1          | 5+     | 20   | always                         |

All ids are stable; names are display-only. The fictional branding is
preserved — no F1 / F2 / F3 / W Series names appear.

## Aurora Formula

Aurora is the dedicated women's development series. It is *not* a
lower-talent feeder: gender is an identity/context property only and
**never** affects driving ability, development, or contract logic.

Centralised historical availability is tracked by
`Championship.womenSeriesEstablished`:

- A Career championship starting in `eraYear ≥ 2014` flips the flag at
  create-time and Aurora is added to the pyramid from season 1.
- A Career that starts earlier gets Aurora later via the explicit
  historical event `NEW WOMEN'S DEVELOPMENT CHAMPIONSHIP ANNOUNCED`
  (Dev Tools → "Trigger Aurora formation event"). The event flips the
  flag and calls `activateWomenSeries(champ)` which seeds the series.
- The Aurora card on the Junior hub shows a sensible
  "Coming soon — Est. S2014" placeholder before the flag flips.
- The series detail page shows a clear "not yet established" empty
  state until the flag flips.

## Gender-neutral talent rule

The talent generator is `generateRookie(seed, season, gender)` in
`src/core/content.ts`. The single, canonical generator:

- picks a different name pool per gender
- runs **identical** skill, potential, and development code for every
  gender
- returns the same talent distribution given the same seed

That means a `gender=female` driver with seed `42` and a
`gender=male` driver with seed `42` are byte-identical apart from name,
nationality, and the `gender` field itself.

Search the codebase for "gender", "female", "women", "aurora" — every
performance-related branch has been audited. The result is enforced
by `tests/driver-ecosystem.test.ts` which contains:

- a seed-equivalence test (`female and male rookie with the same seed`)
- a high-potential test (female drivers can reach potential ≥ 90)
- an equal-ceiling test (the max reachable potential is identical)
- a tier-mapping test (potential tiers ignore gender)
- a scouting test (tier derivation ignores gender)
- an academy-offer test
- a reserve-offer test
- a licence-eligibility test
- a deterministic elite female career test (over 12 seasons)

## Scouting

Scouting is a persistent engine (`src/series/scouting.ts`). Each week
the player funds, every report's `confidence` grows by 0.04 (capped
at 1.0) and the visible band narrows.

The true `hidden.potential` is **never** shown to the player. The
report shows a tier label:

| Tier                | Hidden potential |
| ------------------- | ----------------- |
| Limited             | < 60              |
| Developing          | 60..69            |
| Good Prospect       | 70..79            |
| High Potential      | 80..87            |
| Elite Prospect      | 88..93            |
| Generational Talent | ≥ 94              |

Scouting reports are stored in `Championship.scouting.reports`. The
Dev Tools reveal command ("Reveal scouting") is the only player-visible
code path that exposes the raw number, and only after a confirmation
that the value is a development-aid.

## Watchlist

The watchlist (`Championship.scouting.watchlist`) lets the player track
juniors. Each entry is a `{ driverId, addedAt, lastNotified }`. Adding
or removing a driver is a single API call:

- `addToWatchlist(champ, driverId)`
- `removeFromWatchlist(champ, driverId)`

The watchlist screen sorts by `addedAt` desc and shows current tier,
confidence, contract status and series.

## Driver Academy

The player team can sign academy drivers. Capacity is a small finite
pool that grows modestly with the Driver Development facility level.
Signing is gated by `assessAcademyOffer` which is gender-neutral and
only looks at morale, contract status, hidden potential, and
confidence.

Actions:

- `OFFER ACADEMY CONTRACT` — `signToAcademy`
- `PROMOTE TO RESERVE` — `promoteAcademyToReserve`
- `PROMOTE TO RACE SEAT` — `promoteToTopTeam` (licence-gated)

Each is a real state change, not a placeholder.

## Reserve driver role

A reserve is a top-series-level contract (`ReserveContract`) bound to
the player team. Reserves are independent of feeder roster membership
— promoting a feeder driver into a reserve role preserves their feeder
career history and continues their development.

## Elite Racing Licence

The fictional top-series licence is `SeriesLicence`. It is granted
once a driver accumulates:

- 40 licence points from feeder results (1st=8, 2nd=6, 3rd=4, 4th=2,
  5th=1 per series per season)
- 5+ starts in a single feeder series (+3 points bonus)
- And at least 5 total starts

The licence is checked every tick by `refreshAllEligibility` and
appears on the prospect profile with a clear "ELIGIBLE" or "NOT YET
ELIGIBLE — 31 / 40" state and reasons.

## Promises / Driver Agency

The existing Driver Agency (`src/drivers/agency.ts`) is reused for
promises. The academy / reserve / race-seat flow can issue promises
like:

- "Reserve role next year"
- "Top-team evaluation"
- "Test opportunity"
- "Future race-seat consideration"

Broken promises apply `PROMISE_BROKEN` memory events with severe
trust/morale damage, which then flow through the same compliance
infrastructure the top championship already uses.

## AI recruitment

AI teams run the same offer / sign logic. `assessAcademyOffer` and
`assessReserveOffer` ignore gender entirely. The same `addToWatchlist`,
`scoutDriver` and `signToAcademy` calls drive AI recruitment; there is
no parallel "AI-only" talent system. This is enforced by the
gender-neutral test suite.

## Historical integration

Driver history is persisted as `DriverSeasonRecord[]` on every
driver. Records carry `seriesId`, so a driver who graduates from
Regional → Continental → World Grand Prix keeps a full career timeline
visible on the prospect profile. Driver history grows every feeder
season (even for backmarkers) — no more "Driver history overwrites
junior record when promoted".

## Long-term driver development

Development uses the existing `developDriver` pipeline in
`engine.ts` — it scales with `hidden.potential - visible.pace`,
`developmentRate`, `ageFactor`, and `dynamic.morale / 160`. There is
no flat +1/year shortcut. Junior-series environment affects
morale/confidence which feeds into development, not a hidden talent
multiplier.

## Save migration v3

`SAVE_SCHEMA_VERSION` was bumped from 2 to 3 to add the
driver-ecosystem fields. The migration (`persistence.ts`):

- defaults `womenSeriesEstablished` from `mode === 'career' && eraYear >= 2014`
- defaults every legacy driver's `gender` to `male` (the existing top
  roster was male-only at the time of the v2 save, so this is
  historically accurate)
- promotes legacy `history` arrays (with `season`/`teamId`/`points`/
  `wins`) to the new `DriverSeasonRecord` shape
- creates a `SeriesLicence` entry for every driver

The migration is deterministic and stable across reloads.

## Long-career stress test

`tests/driver-ecosystem.test.ts` includes a 12-season career loop
that confirms:

- every feeder grid remains populated
- no duplicate driver ids
- women are represented in every feeder series
- female elite prospects (potential ≥ 90) appear
- the licence system grants status within the loop
- all 145 tests still pass

## UI routes

| Hash                     | Screen                    |
| ------------------------ | ------------------------- |
| `#/juniors`              | Junior Series hub         |
| `#/series/<id>`          | Series detail / standings |
| `#/driver/<id>`          | Prospect profile          |
| `#/watchlist`            | Watchlist                 |
| `#/academy`              | Driver Academy            |
| `#/drivers`              | Race drivers (default)    |
| `#/drivers/free`         | Free agents               |
| `#/drivers/reserves`     | Reserves                  |

The DEV panel includes feeder/scouting helpers and an Aurora formation
event for visual QA.

## Known limitations

- Aurora is gated by era and is *not* opened retroactively in existing
  saves — the flag flips only when the player reaches era 2014 or
  triggers the formation event manually. This is a deliberate
  historical-fiction choice.
- The top series season-end does not currently run a feeder round
  retroactively if the player skips directly to a new career season.
  Every `tickFeeder` call advances every active feeder series by one
  round, so this is not a day-to-day issue.
- AI drivers do not currently use the watchlist themselves; only the
  player uses it. AI teams use the same scouting / sign pipeline but
  pull from the global driver pool directly.
