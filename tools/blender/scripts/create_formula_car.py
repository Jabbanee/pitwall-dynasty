"""
Formula car generator for Pitwall Dynasty.
Creates an original open-wheel race car model.
Run with: blender --background --python create_formula_car.py
"""

import bpy
import os
import math

def clear_scene():
    """Clear the default scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def create_material(name, color, roughness=0.5, metallic=0.0):
    """Create a standard material."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat

def create_monocoque():
    """Create the main body/chassis."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.3))
    body = bpy.context.active_object
    body.name = "Monocoque"
    body.scale = (0.4, 2.0, 0.25)
    
    mat = create_material("BodyPaint", (0.9, 0.1, 0.1), roughness=0.3, metallic=0.1)
    body.data.materials.append(mat)
    return body

def create_nose():
    """Create the nose cone."""
    bpy.ops.mesh.primitive_cone_add(
        radius1=0.3, radius2=0.1, depth=1.0,
        location=(0, 1.5, 0.2)
    )
    nose = bpy.context.active_object
    nose.name = "Nose"
    nose.rotation_euler.x = math.pi / 2
    
    mat = create_material("Carbon", (0.1, 0.1, 0.1), roughness=0.4, metallic=0.2)
    nose.data.materials.append(mat)
    return nose

def create_front_wing():
    """Create the front wing assembly."""
    # Main plane
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 1.8, 0.08))
    wing = bpy.context.active_object
    wing.name = "FrontWing"
    wing.scale = (1.2, 0.15, 0.02)
    
    # Endplates
    for x in [-0.6, 0.6]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 1.8, 0.12))
        endplate = bpy.context.active_object
        endplate.name = f"FrontEndplate_{'L' if x < 0 else 'R'}"
        endplate.scale = (0.03, 0.2, 0.12)
    
    mat = create_material("Carbon", (0.1, 0.1, 0.1), roughness=0.4, metallic=0.2)
    wing.data.materials.append(mat)
    return wing

def create_rear_wing():
    """Create the rear wing assembly."""
    # Main plane
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -1.8, 0.7))
    wing = bpy.context.active_object
    wing.name = "RearWing"
    wing.scale = (0.8, 0.08, 0.02)
    
    # Endplates
    for x in [-0.4, 0.4]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -1.8, 0.6))
        endplate = bpy.context.active_object
        endplate.name = f"RearEndplate_{'L' if x < 0 else 'R'}"
        endplate.scale = (0.03, 0.15, 0.2)
    
    mat = create_material("Carbon", (0.1, 0.1, 0.1), roughness=0.4, metallic=0.2)
    wing.data.materials.append(mat)
    return wing

def create_wheel(location, name):
    """Create a wheel with tire and rim."""
    # Tire
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.25, depth=0.2,
        location=location
    )
    tire = bpy.context.active_object
    tire.name = f"{name}_Tire"
    tire.rotation_euler.x = math.pi / 2
    
    # Rim
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.15, depth=0.22,
        location=location
    )
    rim = bpy.context.active_object
    rim.name = f"{name}_Rim"
    rim.rotation_euler.x = math.pi / 2
    
    tire_mat = create_material("Rubber", (0.05, 0.05, 0.05), roughness=0.9, metallic=0.0)
    rim_mat = create_material("Alloy", (0.8, 0.8, 0.8), roughness=0.2, metallic=0.8)
    
    tire.data.materials.append(tire_mat)
    rim.data.materials.append(rim_mat)
    
    return tire, rim

def create_suspension(location, name):
    """Create suspension arms."""
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.02, depth=0.4,
        location=location
    )
    arm = bpy.context.active_object
    arm.name = f"{name}_Suspension"
    arm.rotation_euler.x = math.pi / 2
    
    mat = create_material("Carbon", (0.15, 0.15, 0.15), roughness=0.5, metallic=0.1)
    arm.data.materials.append(mat)
    return arm

def create_cockpit():
    """Create cockpit and halo."""
    # Cockpit
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.2, location=(0, 0.2, 0.45)
    )
    cockpit = bpy.context.active_object
    cockpit.name = "Cockpit"
    cockpit.scale = (0.8, 1.0, 0.6)
    
    # Halo
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.22, minor_radius=0.02,
        location=(0, 0.1, 0.55)
    )
    halo = bpy.context.active_object
    halo.name = "Halo"
    
    mat = create_material("Carbon", (0.1, 0.1, 0.1), roughness=0.4, metallic=0.2)
    cockpit.data.materials.append(mat)
    halo.data.materials.append(mat)
    
    return cockpit, halo

def create_sidepods():
    """Create sidepods."""
    for x in [-0.45, 0.45]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.25))
        pod = bpy.context.active_object
        pod.name = f"Sidepod_{'L' if x < 0 else 'R'}"
        pod.scale = (0.2, 0.8, 0.2)
        
        mat = create_material("BodyPaint", (0.9, 0.1, 0.1), roughness=0.3, metallic=0.1)
        pod.data.materials.append(mat)

def create_engine_cover():
    """Create rear engine cover."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -1.2, 0.35))
    cover = bpy.context.active_object
    cover.name = "EngineCover"
    cover.scale = (0.3, 0.6, 0.2)
    
    mat = create_material("Carbon", (0.1, 0.1, 0.1), roughness=0.4, metallic=0.2)
    cover.data.materials.append(mat)
    return cover

def create_tcam():
    """Create T-cam housing."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.8, 0.65))
    tcam = bpy.context.active_object
    tcam.name = "TCam"
    tcam.scale = (0.08, 0.08, 0.05)
    
    mat = create_material("Camera", (0.2, 0.2, 0.2), roughness=0.3, metallic=0.3)
    tcam.data.materials.append(mat)
    return tcam

def create_car():
    """Assemble the complete car."""
    clear_scene()
    
    # Create all components
    create_monocoque()
    create_nose()
    create_front_wing()
    create_rear_wing()
    create_cockpit()
    create_sidepods()
    create_engine_cover()
    create_tcam()
    
    # Wheels
    wheel_positions = [
        ((-0.5, 1.0, 0.25), "FL"),
        ((0.5, 1.0, 0.25), "FR"),
        ((-0.5, -1.0, 0.25), "RL"),
        ((0.5, -1.0, 0.25), "RR"),
    ]
    for pos, name in wheel_positions:
        create_wheel(pos, name)
        create_suspension((pos[0], pos[1], 0.35), name)
    
    # Export
    export_path = os.path.join(
        os.path.dirname(__file__), '..', '..', '..',
        'godot', 'assets', 'models', 'formula_car.glb'
    )
    os.makedirs(os.path.dirname(export_path), exist_ok=True)
    
    bpy.ops.export_scene.gltf(
        filepath=export_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True
    )
    print(f"Exported car to: {export_path}")

if __name__ == "__main__":
    create_car()
