# Pitwall Dynasty - Godot/Blender Asset Pipeline

## Overview

This document describes the asset creation and import pipeline for Pitwall Dynasty's Godot client.

## Toolchain

### Blender

- **Version**: 4.5.10 LTS
- **Executable**: `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`
- **Installation**: Via winget (BlenderFoundation.Blender.LTS.4.5)

### Godot

- **Version**: 4.7.2.stable
- **Renderer**: Forward+
- **Executable**: `D:\BaneWorks\Tools\Godot47\Godot_v4.7.2-stable_win64.exe`

## Pipeline Stages

### 1. Source Creation (.blend)

- Create assets in Blender as `.blend` files
- Store source files in `tools/blender/source/` (development only, not committed)

### 2. Export (.glb/.gltf)

- Export from Blender to GLB format
- Use these export settings:
  - Format: Binary (.glb)
  - Apply transforms: Yes
  - Y-up orientation
  - 1 Blender unit = 1 meter
  - Include: Selected objects only
  - Apply modifiers: Yes

### 3. Godot Import

- Place `.glb` files in `godot/assets/models/`
- Godot automatically imports GLB files
- Import settings:
  - Scale: 1.0
  - Generate LODs: Yes (for complex meshes)
  - Compression: Enabled

### 4. Runtime Usage

- Instantiate imported meshes in scenes
- Use shared Mesh resources where possible
- Apply per-instance material overrides for team colors

### 5. Export Verification

- Assets must appear in exported Windows build
- Verify no missing textures or materials

## Coordinate System

- **Godot**: Y-up, right-handed
- **Blender**: Z-up by default
- **Export setting**: Convert to Y-up on GLB export

## Scale Convention

- 1 Godot unit = 1 meter
- Track width: ~12 meters
- Car length: ~5 meters
- Car width: ~2 meters

## Material Conventions

- Use StandardMaterial3D for most surfaces
- Use ORMMaterial3D for metallic/surfaces where appropriate
- Texture resolution: 1024x1024 or 2048x2048 for hero assets
- Use texture atlasing for repeated elements

## Optimization Guidelines

- Target < 5000 triangles per car for full grid
- Use LODs for distant objects
- Share materials across similar objects
- Use MultiMesh for repeated elements (crowd, trees, barriers)

## Licensing

- Only use CC0, public domain, or original content
- No F1 assets, real team liveries, or licensed content
- All fictional sponsors and teams

## Directory Structure

```
tools/blender/
  source/           # .blend source files (development only)
  scripts/          # Blender automation scripts
  export_glb.py     # GLB export script

godot/assets/
  models/           # Imported .glb files
  textures/         # Texture files
  materials/        # Material resources
```
