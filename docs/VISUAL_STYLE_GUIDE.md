# Pitwall Dynasty — Visual Style Guide

This guide captures the visual identity, design system tokens,
team/sponsor branding rules, and asset philosophy of Pitwall Dynasty
so the next pass can keep the look consistent.

## Visual identity

- **Genre**: a fictional, premium open-wheel championship broadcast
  and team-management experience.
- **Tone**: paddock, race control, engineering, broadcast graphics.
  Atmospheric but professional. No cyberpunk, no neon, no "video
  game neon".
- **Inspiration board**: motorsport broadcast packages, race
  engineering telemetry, premium team garages, F1 timing tower,
  modern team app shells.

## Type system

`src/ui/styles.css` exposes a 3-family system:

| Token | Use | Fallback |
| --- | --- | --- |
| `--font-display` | race names, round numbers, team names, large numbers, kicker labels, paddock headlines | Rajdhani → Oswald → Bebas Neue → Segoe UI → system-ui |
| `--font-sans` | body text, buttons, descriptions | Inter → Segoe UI → system-ui |
| `--font-mono` | times, deltas, IDs, codes | JetBrains Mono → Cascadia Code → Consolas → ui-monospace |

Display font weight is **700** with `letter-spacing: 0.04-0.18em` and
uppercase. Sans is **400-600** with normal case. Mono is used for
tabular numerics and code-like labels.

## Color palette

The base palette lives in `:root` in `src/ui/styles.css`:

| Token | Hex | Use |
| --- | --- | --- |
| `--bg-cinema-0` | `#04060a` | cinematic background, body |
| `--bg-cinema-1` | `#080b12` | secondary cinema |
| `--bg-panel-0` | `#0e141d` | major game panel |
| `--bg-panel-1` | `#131a25` | secondary panel |
| `--bg-panel-2` | `#19222f` | interactive card |
| `--bg-data-0` | `#06090e` | telemetry module |
| `--accent` | `#e63946` | race red — primary CTA, focus |
| `--accent-2` | `#2a6df4` | broadcast cobalt — info, focused row |
| `--accent-3` | `#d4a017` | editorial gold — paddock post, stand-out |
| `--good` | `#2bb673` | success / classified / P1-ready |
| `--warn` | `#f2c744` | caution / podium silver |
| `--bad` | `#e63946` | DNF / podium bronze |
| `--pos-1/2/3` | gold / silver / bronze | finishing position tints |

## Surface hierarchy

There are 5 levels of depth. Use them with intent.

| Level | Class | Use |
| --- | --- | --- |
| 0 cinematic | `body` background, `title-screen` background layers | global mood, motion |
| 1 major panel | `.panel`, `.title-screen .ts-mode`, `.event-header`, `.hero-panel` | focal game surface |
| 2 interactive card | `.card`, `.b3d-strategy` | routine data |
| 3 telemetry module | `.kv`, `.b3d-timing`, `.b3d-radio-line` | live numbers |
| 4 small controls | `.badge`, `.pill`, `.kicker`, `.team-mark`, `.helmet` | chrome |

A surface should be intentionally placed on one of these levels.
Everything does **not** need a border.

## Components introduced in P1

- `title-screen` — full-screen PC main menu with brand left, mode
  stack right, circuit-board SVG background, scan lines, kicker
  metadata and a footer with fictional press attribution.
- `hero-panel` — focal next-event card on Team HQ with pulse
  indicator, circuit preview SVG and 6-cell stat grid.
- `event-header` — Race Weekend event header with event name, lap
  count, sector markers and a 4-cell circuit preview.
- `team-pick` / `team-mark` / `team-bar` / `team-stripe` — every
  team has a colour stripe and a compact mark used in cards,
  tables and lists.
- `helmet` — pure CSS helmet with a configurable base, stripe and
  number; designed for use in driver cards, podiums and race
  broadcast.
- `podium` — three-up podium with P1/P2/P3 rank pills and a
  per-step block that scales the gold/silver/bronze treatment.
- `driver-card` — structured driver identity with port, name,
  meta, two-column rating grid, contract badges.
- `paddock` — Paddock Post publication layout using Georgia
  serif headlines, accent-gold accents, sidebar cards.
- `podium` blocks the result-class + championship area in the
  Results screen.
- `lobby-shell` / `lobby-info-panel` / `player-slot` / `team-pick`
  — multiplayer lobby with focal code panel and slot roster.
- `event-header` and `session-list` — Race Weekend event entry and
  session progression.
- `b3d-timing` — broadcast-style timing tower with team colour
  stripe, driver name, gap, tyre indicator, focused row.
- `b3d-follow-strip` — minimal driver identity strip above the
  canvas showing `P3 · 17 MORETTI · AQUILA CORSE · MEDIUM 18 LAPS
  · +1.422`.

## Buttons

There are 4 button hierarchy levels:

- `.primary` — the strong CTA. Race red gradient, shadow, text
  shadow. Use for "Enter Race Weekend", "Send BOX THIS LAP", "Start
  Championship".
- `.good` — green gradient for positive completion actions like
  "Advance", "Sign driver".
- `.danger` — red gradient for "Leave lobby", destructive.
- `.quiet` — transparent border for low-emphasis actions like
  "View results", "Standings".
- `.ghost` — fully transparent for compact icon-row buttons.

Everything else uses the default surface button. Reserve `.primary`
for the single most important action on a screen.

## Sponsors

- Sponsors are colour-coded via `data-sponsor-color` on
  `.sponsor-mark` and a fictional wordmark. No real-world logos.
- Each mark is a 56×40 box with a single bold wordmark and brand
  colour.
- Marks appear in HQ sponsor list, Paddock Post sidebar and
  contract screens.

## Driver helmets

- `.helmet` CSS primitive takes three variables: base colour,
  stripe colour and text colour.
- Driver cards expose these through CSS custom properties so
  team-themed helmets are applied by the team colour block.

## Era visual identity (subtle)

`--era-motif` and `--era-accent` are defined per era. Era screens
should not over-design but should hint at the era:

- **1980**: warm analog paper telemetry, `--era-accent: #d4a017`.
- **1990**: sharper technical broadcast graphics, `#4ea1ff`.
- **2000**: polished high-tech paddock, `#2bb673`.
- **2010**: data-heavy modern engineering, `#6da7d6`.
- **2020**: clean contemporary digital telemetry, `#e63946`.

The motif is shown through subtle background textures and accent
colour usage, **not** through major UI changes.

## Motion

Use short, restrained motion:

- `pulse 1.6s` — repeating status indicator
- `heroPulse 1.6s` — hero panel pulse ring
- `scan 8s` — title-screen scanline loop
- `hotPulse 1.8s` — state-message pulse
- `radioPop 0.3s` — radio line slide-in
- `slideIn 0.2s` — battle card slide-in
- `ease-out 220ms` — default transition
- `ease-in-out` — symmetric transitions

All animations respect `@media (prefers-reduced-motion: reduce)`.

## PC desktop layout

- Page padding: 28-32px sides
- Page-inner max width: 1480px
- Major game panels: padding 28px, gap 22px
- Title screen: 60-70px padding, two-column at ≥1100px
- Broadcast stage: fills viewport below 56px top bar

## Asset safety rules

- All team emblems and circuit graphics are **original** SVG
  generated procedurally from data.
- No F1, real motorsport, or copyrighted brand marks.
- No copyrighted photography; all visuals are CSS, SVG, or
  procedurally generated in `src/ui/three`.
- See `docs/ART_ASSET_MANIFEST.md` for the complete inventory.
