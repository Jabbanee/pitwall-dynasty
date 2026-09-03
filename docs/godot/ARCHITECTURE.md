# Pitwall Dynasty - Godot Client Architecture

## Overview

Pitwall Dynasty is being migrated from an Electron/React/Three.js web-based client to a native Godot 4.3 client. This document describes the architecture of the new Godot client.

## Architecture Principles

### Server Authority

The TypeScript authoritative simulation server remains the single source of truth for:
- Race simulation
- Multiplayer state
- Deterministic results
- Command validation

The Godot client is a **presentation layer** that:
- Visualizes authoritative state
- Sends commands to the server
- Interpolates between snapshots
- Provides native UI

### Strangler Migration

The migration follows the Strangler Fig pattern:
1. Godot client runs alongside legacy Electron client
2. Features are progressively migrated
3. Legacy remains as golden reference
4. Legacy is removed only after parity verification

## Project Structure

```
godot/
  project.godot          # Project configuration
  autoload/              # Global singletons
    app_state.gd         # Application state
    game_router.gd       # Screen routing
    settings_service.gd  # Settings management
    content_registry.gd  # Game content data
    network_session.gd   # WebSocket client
    save_service.gd      # Save/load system
    visual_qa.ga         # QA automation
  scenes/
    app/                 # Application root
    menu/                # Menu screens
    race/                # Race broadcast
  scripts/
    app/                 # App controllers
    menu/                # Menu logic
    race/                # Race broadcast logic
  assets/                # Game assets
  data/resources/        # JSON data files
  networking/            # Network utilities
  tests/                 # Test fixtures
```

## Autoloads (Global Singletons)

| Singleton | Purpose |
|-----------|---------|
| AppState | Global application state |
| GameRouter | Screen navigation |
| SettingsService | Persistent settings |
| ContentRegistry | Game content (teams, drivers, circuits) |
| NetworkSession | WebSocket connection to TS server |
| SaveService | Save/load management |
| VisualQA | QA scenario controls |

## Screen Routing

Routes are defined in `GameRouter`:
- MAIN_MENU
- QUICK_START
- FAST_CHAMPIONSHIP
- MULTIPLAYER
- SOLO_CAREER
- SETTINGS
- RACE_BROADCAST
- HQ (future)
- DRIVERS (future)
- RESULTS (future)

## Snapshot Interpolation

The client receives authoritative snapshots from the server and interpolates between them for smooth presentation:

1. Receive snapshot A at time T0
2. Receive snapshot B at time T1
3. Interpolate car positions between A and B based on current presentation time
4. Extrapolate briefly if no new snapshot arrives (with limits)

## Camera System

Local to each client - different clients can watch different cameras over the same authoritative race.

Camera archetypes:
- TRACKSIDE
- BRAKING_LONG_LENS
- APEX_LOW
- CORNER_EXIT_PAN
- STRAIGHT_TELEPHOTO
- CREST
- PIT_ENTRY
- PIT_EXIT
- START_FINISH
- HELICOPTER
- ONBOARD
- BATTLE

## TV Director

Local presentation logic that:
- Consumes race snapshot + broadcast events
- Selects camera based on priority
- Manages camera hold times
- Never affects simulation

## Protocol Mapping

See `SERVER_PROTOCOL_MAPPING.md` for detailed protocol documentation.

## Future Migration Phases

- G0: Foundation (current)
- G1: Native UI (main menu, settings)
- G2: Native 3D broadcast
- G3: Management screens (HQ, Drivers, etc.)
- G4: Multiplayer client parity
- G5: Career/Save/Content parity
- G6: Legacy removal
