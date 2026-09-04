"""
Blender to GLB export script for Pitwall Dynasty.

Usage:
    blender --background --python tools/blender/scripts/export_glb.py -- <input.blend> <output.glb>

This script exports a Blender file to GLB format with settings optimized for Godot import.
"""

import bpy
import sys
import os

def enable_gltf_addon():
    """Enable the glTF 2.0 export add-on."""
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')

def export_to_glb(input_path: str, output_path: str, export_selected: bool = False):
    """
    Export a Blender file to GLB format.
    
    Args:
        input_path: Path to the input .blend file
        output_path: Path for the output .glb file
        export_selected: If True, only export selected objects
    """
    # Enable glTF add-on
    enable_gltf_addon()
    
    # Load the blend file
    bpy.ops.wm.open_mainfile(filepath=input_path)
    
    # Select all objects if not exporting selected only
    if not export_selected:
        bpy.ops.object.select_all(action='SELECT')
    
    # Export to GLB
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=export_selected,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_colors=True,
        export_cameras=False,
        export_lights=False
    )
    
    print(f"Successfully exported: {output_path}")

def main():
    # Parse command line arguments
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    
    if len(argv) < 2:
        print("Usage: blender --background --python export_glb.py -- <input.blend> <output.glb>")
        sys.exit(1)
    
    input_path = argv[0]
    output_path = argv[1]
    export_selected = "--selected" in argv
    
    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)
    
    export_to_glb(input_path, output_path, export_selected)

if __name__ == "__main__":
    main()
