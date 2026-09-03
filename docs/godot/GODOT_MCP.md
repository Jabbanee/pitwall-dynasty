# Godot MCP Integration

## Package Information

- **Package**: godot-mcp
- **Version**: 0.1.0
- **Source**: https://github.com/Coding-Solo/godot-mcp
- **License**: MIT

## Installation

```bash
npm install -g godot-mcp
```

## Godot Plugin Path

The MCP server uses a bundled GDScript (`godot_operations.gd`) for complex operations. No separate Godot plugin installation required.

## Project Configuration

- **Project Path**: `D:\BaneWorks\Pelit\PC\Pitwall Dynasty\godot`
- **Godot Executable**: `D:\BaneWorks\Tools\Godot43\Godot_v4.3-stable_win64.exe`
- **Godot Version**: 4.3.stable.official.77dcf97d8

## MCP Configuration

Configuration file: `.mcp.json` (project scope)

```json
{
  "mcpServers": {
    "godot": {
      "transport": "stdio",
      "enabled": true,
      "command": "node",
      "args": ["C:\\Users\\Janne\\AppData\\Roaming\\npm\\node_modules\\godot-mcp\\build\\index.js"],
      "env": {
        "GODOT_PATH": "D:\\BaneWorks\\Tools\\Godot43\\Godot_v4.3-stable_win64.exe"
      }
    }
  }
}
```

## Windows Command Fallback

If `npx` fails, use direct node execution:

```bash
node C:\Users\Janne\AppData\Roaming\npm\node_modules\godot-mcp\build\index.js
```

## Connection Test

```bash
$env:GODOT_PATH = "D:\BaneWorks\Tools\Godot43\Godot_v4.3-stable_win64.exe"
godot-mcp
```

Expected output:
```
[SERVER] Using Godot at: D:\BaneWorks\Tools\Godot43\Godot_v4.3-stable_win64.exe
Godot MCP server running on stdio
```

## Available Tools

- `launch_editor` - Open Godot editor for project
- `run_project` - Run Godot project
- `get_debug_output` - Get console output and errors
- `stop_project` - Stop running project
- `get_godot_version` - Get Godot version
- `list_projects` - List Godot projects
- `get_project_info` - Get project structure info
- `create_scene` - Create new scene
- `add_node` - Add node to scene
- `load_sprite` - Load sprite into Sprite2D
- `save_scene` - Save scene

## Run Workflow

1. Open project in Godot editor: `launch_editor` with project path
2. Run project: `run_project` with project path
3. Check for errors: `get_debug_output`
4. Stop project: `stop_project`

## Error Inspection Workflow

1. Run project with `run_project`
2. Call `get_debug_output` to retrieve errors
3. Fix issues in code
4. Re-run and verify
