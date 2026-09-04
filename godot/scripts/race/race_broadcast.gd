extends Node3D

var CameraSystem = preload("res://scripts/race/camera_system.gd")
var BroadcastDirector = preload("res://scripts/race/broadcast_director.gd")
var TrackGenerator = preload("res://scripts/race/track_generator.gd")

@onready var circuit_root: Node3D = $CircuitRoot
@onready var cars_root: Node3D = $CarsRoot
@onready var camera_rig: Node3D = $CameraRig
@onready var hud: Control = $HUD

var _cars: Array = []
var _car_visuals: Dictionary = {}
var _race_data: Dictionary = {}
var _is_race_active: bool = false
var _presentation_time: float = 0.0
var _track_radius: float = 50.0
var _camera_system = null
var _director = null
var _current_circuit_data: Dictionary = {}
var _centerline: PackedVector3Array = PackedVector3Array()

func _ready() -> void:
	print("RaceBroadcast: Initializing")
	_setup_track()
	_setup_camera_system()
	_setup_director()
	_setup_default_race()
	_spawn_cars()
	print("RaceBroadcast: Ready with %d cars" % _cars.size())

func _setup_track() -> void:
	# Load circuit data from JSON
	var circuits_data := _load_circuits_data()
	if circuits_data.size() == 0:
		print("No circuit data found, falling back to procedural oval")
		_setup_procedural_track()
		return
	
	# Use first circuit for now (Velocita Park)
	var circuit_data = circuits_data[0]
	_current_circuit_data = circuit_data
	
	# Calculate track radius from circuit length
	var length_km = circuit_data.characteristics.lengthKm
	_track_radius = length_km * 20.0  # Approximate radius from circumference
	
	# Generate centerline using TrackGenerator
	var centerline = TrackGenerator.generate_centerline(circuit_data, 96)
	
	# Build track surface from centerline
	var track_surface := _build_track_from_centerline(centerline)
	circuit_root.add_child(track_surface)
	
	# Build curbs
	var curbs := _build_curbs_from_centerline(centerline)
	circuit_root.add_child(curbs)
	
	# Build barriers
	var barriers := _build_barriers_from_centerline(centerline)
	circuit_root.add_child(barriers)
	
	# Build environment based on theme
	var theme = circuit_data.get("theme", "FOREST")
	_build_environment(theme)

func _load_circuits_data() -> Array:
	var file := FileAccess.open("res://data/resources/track_data.json", FileAccess.READ)
	if not file:
		print("Could not open track_data.json")
		return []
	var text := file.get_as_text()
	file.close()
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		print("Error parsing track_data.json")
		return []
	var data = json.data
	return data.get("circuits", [])

func _setup_procedural_track() -> void:
	# Fallback procedural oval (original implementation)
	var track_surface := _build_track_surface()
	circuit_root.add_child(track_surface)
	var curbs := _build_curbs()
	circuit_root.add_child(curbs)
	var barriers := _build_barriers()
	circuit_root.add_child(barriers)
	var grass := _build_grass()
	add_child(grass)

func _build_track_surface() -> MeshInstance3D:
	var surface_tool := SurfaceTool.new()
	surface_tool.begin(Mesh.PRIMITIVE_TRIANGLES)

	var half_width: float = 6.0
	var inner_radius: float = _track_radius - half_width
	var outer_radius: float = _track_radius + half_width
	var segments: int = 72

	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.15, 0.15, 0.15)
	material.roughness = 0.85

	for i in range(segments):
		var angle1: float = (float(i) / float(segments)) * TAU
		var angle2: float = (float(i + 1) / float(segments)) * TAU

		var p1_inner := Vector3(cos(angle1) * inner_radius, 0, sin(angle1) * inner_radius)
		var p2_inner := Vector3(cos(angle2) * inner_radius, 0, sin(angle2) * inner_radius)
		var p1_outer := Vector3(cos(angle1) * outer_radius, 0, sin(angle1) * outer_radius)
		var p2_outer := Vector3(cos(angle2) * outer_radius, 0, sin(angle2) * outer_radius)

		surface_tool.add_vertex(p1_inner)
		surface_tool.add_vertex(p1_outer)
		surface_tool.add_vertex(p2_inner)
		surface_tool.add_vertex(p1_outer)
		surface_tool.add_vertex(p2_outer)
		surface_tool.add_vertex(p2_inner)

	surface_tool.generate_normals()
	surface_tool.set_material(material)
	surface_tool.index()

	var mesh := MeshInstance3D.new()
	mesh.mesh = surface_tool.commit()
	mesh.name = "TrackSurface"
	mesh.position = Vector3(0, 0.01, 0)
	return mesh

func _build_curbs() -> MeshInstance3D:
	var surface_tool := SurfaceTool.new()
	surface_tool.begin(Mesh.PRIMITIVE_TRIANGLES)

	var curb_material := StandardMaterial3D.new()
	curb_material.albedo_color = Color(0.9, 0.2, 0.2)
	curb_material.roughness = 0.6

	var half_width: float = 6.0
	var inner_radius: float = _track_radius - half_width
	var outer_radius: float = _track_radius + half_width
	var segments: int = 72

	for i in range(segments):
		var angle1: float = (float(i) / float(segments)) * TAU
		var angle2: float = (float(i + 1) / float(segments)) * TAU

		var p1 := Vector3(cos(angle1) * inner_radius, 0, sin(angle1) * inner_radius)
		var p2 := Vector3(cos(angle2) * inner_radius, 0, sin(angle2) * inner_radius)
		var p3 := Vector3(cos(angle1) * (inner_radius + 1.5), 0, sin(angle1) * (inner_radius + 1.5))
		var p4 := Vector3(cos(angle2) * (inner_radius + 1.5), 0, sin(angle2) * (inner_radius + 1.5))

		surface_tool.add_vertex(p1)
		surface_tool.add_vertex(p3)
		surface_tool.add_vertex(p2)
		surface_tool.add_vertex(p3)
		surface_tool.add_vertex(p4)
		surface_tool.add_vertex(p2)

	surface_tool.generate_normals()
	surface_tool.set_material(curb_material)
	surface_tool.index()

	var mesh := MeshInstance3D.new()
	mesh.mesh = surface_tool.commit()
	mesh.name = "Curbs"
	mesh.position = Vector3(0, 0.02, 0)
	return mesh

func _build_barriers() -> MeshInstance3D:
	var surface_tool := SurfaceTool.new()
	surface_tool.begin(Mesh.PRIMITIVE_TRIANGLES)

	var barrier_material := StandardMaterial3D.new()
	barrier_material.albedo_color = Color(0.7, 0.7, 0.7)
	barrier_material.roughness = 0.7

	var barrier_radius: float = _track_radius + 10.0
	var barrier_height: float = 1.2
	var segments: int = 48

	for i in range(segments):
		var angle1: float = (float(i) / float(segments)) * TAU
		var angle2: float = (float(i + 1) / float(segments)) * TAU

		var p1 := Vector3(cos(angle1) * barrier_radius, 0, sin(angle1) * barrier_radius)
		var p2 := Vector3(cos(angle2) * barrier_radius, 0, sin(angle2) * barrier_radius)
		var p3 := Vector3(cos(angle1) * barrier_radius, barrier_height, sin(angle1) * barrier_radius)
		var p4 := Vector3(cos(angle2) * barrier_radius, barrier_height, sin(angle2) * barrier_radius)

		surface_tool.add_vertex(p1)
		surface_tool.add_vertex(p3)
		surface_tool.add_vertex(p2)
		surface_tool.add_vertex(p3)
		surface_tool.add_vertex(p4)
		surface_tool.add_vertex(p2)

	surface_tool.generate_normals()
	surface_tool.set_material(barrier_material)
	surface_tool.index()

	var mesh := MeshInstance3D.new()
	mesh.mesh = surface_tool.commit()
	mesh.name = "Barriers"
	return mesh

func _build_grass() -> MeshInstance3D:
	var surface_tool := SurfaceTool.new()
	surface_tool.begin(Mesh.PRIMITIVE_TRIANGLES)

	var grass_material := StandardMaterial3D.new()
	grass_material.albedo_color = Color(0.12, 0.2, 0.1)
	grass_material.roughness = 0.95

	var inner_r: float = _track_radius + 15.0
	var outer_r: float = _track_radius + 150.0
	var segments: int = 48

	for i in range(segments):
		var angle1: float = (float(i) / float(segments)) * TAU
		var angle2: float = (float(i + 1) / float(segments)) * TAU

		var p1 := Vector3(cos(angle1) * inner_r, -0.05, sin(angle1) * inner_r)
		var p2 := Vector3(cos(angle2) * inner_r, -0.05, sin(angle2) * inner_r)
		var p3 := Vector3(cos(angle1) * outer_r, -0.05, sin(angle1) * outer_r)
		var p4 := Vector3(cos(angle2) * outer_r, -0.05, sin(angle2) * outer_r)

		surface_tool.add_vertex(p1)
		surface_tool.add_vertex(p3)
		surface_tool.add_vertex(p2)
		surface_tool.add_vertex(p3)
		surface_tool.add_vertex(p4)
		surface_tool.add_vertex(p2)

	surface_tool.generate_normals()
	surface_tool.set_material(grass_material)
	surface_tool.index()

	var mesh := MeshInstance3D.new()
	mesh.mesh = surface_tool.commit()
	mesh.name = "Grass"
	return mesh

func _setup_camera_system() -> void:
	_camera_system = CameraSystem.new()
	add_child(_camera_system)
	_camera_system.setup(Vector3.ZERO, _track_radius, _cars)

func _setup_director() -> void:
	_director = BroadcastDirector.new()
	add_child(_director)
	_director.setup(_camera_system)
	_director.camera_suggested.connect(_on_camera_suggested)

func _on_camera_suggested(camera_type: int) -> void:
	if _camera_system:
		_camera_system.set_camera_type(camera_type)

func _setup_default_race() -> void:
	_race_data = {
		"race_id": "fixture_race_001",
		"circuit_id": "circuit_forest_01",
		"phase": "RACE",
		"current_lap": 1,
		"total_laps": 10,
		"weather": "DRY",
		"era": "2022",
		"cars": _generate_fixture_cars(20)
	}

func _generate_fixture_cars(count: int) -> Array:
	var cars: Array = []
	var team_names := ["Aquila Racing", "Boreal Motorsport", "Kestrel GP", "Meridian Racing", "Titan Racing"]
	var team_colors := [
		Color(0.9, 0.2, 0.2),
		Color(0.2, 0.6, 0.9),
		Color(0.9, 0.7, 0.1),
		Color(0.3, 0.8, 0.4),
		Color(0.7, 0.3, 0.9)
	]

	for i in range(count):
		var team_idx: int = i % team_names.size()
		var radius: float = _track_radius + 2.0 + (i / 5) * 3.0
		var angle: float = (float(i) / float(count)) * TAU
		cars.append({
			"id": "car_%02d" % i,
			"driver": "Driver %d" % (i + 1),
			"team": team_names[team_idx],
			"team_id": "team_%02d" % team_idx,
			"team_color": team_colors[team_idx],
			"position": i + 1,
			"lap_progress": float(i) / float(count),
			"radius": radius,
			"angle": angle,
			"compound": "MEDIUM",
			"pit_state": "TRACK",
			"speed": 200.0 + randf() * 50.0
		})
	return cars

func _spawn_cars() -> void:
	for car_data in _race_data.cars:
		var car_visual := _create_car_visual(car_data)
		_cars.append({"data": car_data, "visual": car_visual})
		_car_visuals[car_data.id] = car_visual
		cars_root.add_child(car_visual)
	
	# Update camera system with cars
	if _camera_system:
		_camera_system._cars = _cars

func _create_car_visual(car_data: Dictionary) -> Node3D:
	var container := Node3D.new()
	container.name = car_data.id

	var color: Color = car_data.team_color

	# Main chassis
	var chassis := MeshInstance3D.new()
	var chassis_mesh := BoxMesh.new()
	chassis_mesh.size = Vector3(1.2, 0.35, 3.5)
	chassis.mesh = chassis_mesh
	chassis.position = Vector3(0, 0.2, 0)

	var chassis_material := StandardMaterial3D.new()
	chassis_material.albedo_color = color
	chassis_material.roughness = 0.3
	chassis_material.metallic = 0.1
	chassis.material_override = chassis_material
	container.add_child(chassis)

	# Cockpit
	var cockpit := MeshInstance3D.new()
	var cockpit_mesh := BoxMesh.new()
	cockpit_mesh.size = Vector3(0.5, 0.3, 0.8)
	cockpit.mesh = cockpit_mesh
	cockpit.position = Vector3(0, 0.45, -0.5)

	var cockpit_material := StandardMaterial3D.new()
	cockpit_material.albedo_color = Color(0.1, 0.1, 0.1)
	cockpit.material_override = cockpit_material
	container.add_child(cockpit)

	# Front wing
	var front_wing := MeshInstance3D.new()
	var fw_mesh := BoxMesh.new()
	fw_mesh.size = Vector3(1.8, 0.05, 0.4)
	front_wing.mesh = fw_mesh
	front_wing.position = Vector3(0, 0.1, 1.8)
	front_wing.material_override = chassis_material
	container.add_child(front_wing)

	# Rear wing
	var rear_wing := MeshInstance3D.new()
	var rw_mesh := BoxMesh.new()
	rw_mesh.size = Vector3(1.0, 0.4, 0.15)
	rear_wing.mesh = rw_mesh
	rear_wing.position = Vector3(0, 0.6, -1.8)
	rear_wing.material_override = chassis_material
	container.add_child(rear_wing)

	# Halo
	var halo := MeshInstance3D.new()
	var halo_mesh := TorusMesh.new()
	halo_mesh.inner_radius = 0.25
	halo_mesh.outer_radius = 0.03
	halo_mesh.ring_segments = 12
	halo_mesh.tube_segments = 6
	halo.mesh = halo_mesh
	halo.position = Vector3(0, 0.55, -0.3)

	var halo_material := StandardMaterial3D.new()
	halo_material.albedo_color = Color(0.3, 0.3, 0.3)
	halo_material.metallic = 0.8
	halo.material_override = halo_material
	container.add_child(halo)

	# Wheels
	_create_wheels(container)

	# Position the car
	var angle: float = car_data.angle
	var radius: float = car_data.radius
	container.position = Vector3(cos(angle) * radius, 0, sin(angle) * radius)
	container.rotation.y = angle + PI / 2.0

	return container

func _create_wheels(parent: Node3D) -> void:
	var wheel_positions := [
		Vector3(-0.7, 0.15, 1.2),
		Vector3(0.7, 0.15, 1.2),
		Vector3(-0.7, 0.15, -1.2),
		Vector3(0.7, 0.15, -1.2),
	]

	var wheel_material := StandardMaterial3D.new()
	wheel_material.albedo_color = Color(0.1, 0.1, 0.1)
	wheel_material.roughness = 0.9

	for pos in wheel_positions:
		var wheel := MeshInstance3D.new()
		var cylinder := CylinderMesh.new()
		cylinder.height = 0.3
		cylinder.top_radius = 0.25
		cylinder.bottom_radius = 0.25
		cylinder.radial_segments = 10
		wheel.mesh = cylinder
		wheel.position = pos
		wheel.rotation_degrees = Vector3(0, 0, 90)
		wheel.material_override = wheel_material
		parent.add_child(wheel)

func _process(delta: float) -> void:
	if not _is_race_active:
		return
	_presentation_time += delta
	_update_car_positions(delta)
	_camera_system._process(delta)
	_director.update(delta)

func _update_car_positions(delta: float) -> void:
	for car_entry in _cars:
		var data: Dictionary = car_entry.data
		var visual: Node3D = car_entry.visual
		if not visual:
			continue

		data.lap_progress = data.lap_progress + delta * 0.03
		if data.lap_progress >= 1.0:
			data.lap_progress -= 1.0

		var angle: float = data.angle + data.lap_progress * TAU
		var radius: float = data.radius
		var new_pos := Vector3(
			cos(angle) * radius,
			0,
			sin(angle) * radius
		)

		visual.position = new_pos
		visual.rotation.y = angle + PI / 2.0

func start_race() -> void:
	_is_race_active = true
	_director.process_event(BroadcastDirector.EventType.START)
	print("Race started")

func pause_race() -> void:
	_is_race_active = false
	print("Race paused")

func stop_race() -> void:
	_is_race_active = false
	_director.process_event(BroadcastDirector.EventType.FINISH)
	print("Race stopped")

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		GameRouter.navigate_to("MAIN_MENU")
	elif event.is_action_pressed("pause"):
		if _is_race_active:
			pause_race()
		else:
			start_race()
	elif event.is_action_pressed("camera_next"):
		_camera_system.next_camera()
	elif event.is_action_pressed("camera_previous"):
		_camera_system.previous_camera()

# Real circuit track generation helpers

func _build_track_from_centerline(centerline: PackedVector3Array) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hw := 6.0
	var n := centerline.size()
	for i in range(n):
		var curr = centerline[i]
		var next_p = centerline[(i + 1) % n]
		var tangent = (next_p - curr).normalized()
		var normal = Vector3(-tangent.z, 0, tangent.x)
		var p1 = curr + normal * hw
		var p2 = curr - normal * hw
		var p3 = next_p - normal * hw
		var p4 = next_p + normal * hw
		st.add_vertex(p1)
		st.add_vertex(p2)
		st.add_vertex(p3)
		st.add_vertex(p1)
		st.add_vertex(p3)
		st.add_vertex(p4)
	st.generate_normals()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.15, 0.15, 0.15)
	mat.roughness = 0.85
	st.set_material(mat)
	st.index()
	var mesh := MeshInstance3D.new()
	mesh.mesh = st.commit()
	mesh.name = "TrackSurface"
	return mesh

func _build_curbs_from_centerline(centerline: PackedVector3Array) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var cw := 1.5
	var n := centerline.size()
	for i in range(0, n, 6):
		var curr = centerline[i]
		var next_p = centerline[(i + 1) % n]
		var tangent = (next_p - curr).normalized()
		var normal = Vector3(-tangent.z, 0, tangent.x)
		var inner = curr - normal * 6.0
		var outer = curr - normal * (6.0 + cw)
		var ni = next_p - normal * 6.0
		var no = next_p - normal * (6.0 + cw)
		st.add_vertex(inner)
		st.add_vertex(outer)
		st.add_vertex(ni)
		st.add_vertex(outer)
		st.add_vertex(no)
		st.add_vertex(ni)
	st.generate_normals()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.9, 0.2, 0.2)
	mat.roughness = 0.6
	st.set_material(mat)
	st.index()
	var mesh := MeshInstance3D.new()
	mesh.mesh = st.commit()
	mesh.name = "Curbs"
	mesh.position = Vector3(0, 0.05, 0)
	return mesh

func _build_barriers_from_centerline(centerline: PackedVector3Array) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var bo := 16.0
	var bh := 1.2
	var n := centerline.size()
	for i in range(0, n, 2):
		var curr = centerline[i]
		var next_p = centerline[(i + 1) % n]
		var tangent = (next_p - curr).normalized()
		var normal = Vector3(-tangent.z, 0, tangent.x)
		var base = curr + normal * bo
		var top = base + Vector3(0, bh, 0)
		var nb = next_p + normal * bo
		var nt = nb + Vector3(0, bh, 0)
		st.add_vertex(base)
		st.add_vertex(top)
		st.add_vertex(nb)
		st.add_vertex(top)
		st.add_vertex(nt)
		st.add_vertex(nb)
	st.generate_normals()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.7, 0.7, 0.7)
	mat.roughness = 0.7
	st.set_material(mat)
	st.index()
	var mesh := MeshInstance3D.new()
	mesh.mesh = st.commit()
	mesh.name = "Barriers"
	return mesh

func _build_environment(theme: String) -> void:
	var ground := MeshInstance3D.new()
	var gm := PlaneMesh.new()
	gm.size = Vector2(800, 800)
	ground.mesh = gm
	ground.position = Vector3(0, -0.1, 0)
	var mat := StandardMaterial3D.new()
	match theme:
		"FOREST": mat.albedo_color = Color(0.12, 0.2, 0.1)
		"MOUNTAIN": mat.albedo_color = Color(0.2, 0.18, 0.15)
		"COASTAL": mat.albedo_color = Color(0.15, 0.18, 0.2)
		"DESERT": mat.albedo_color = Color(0.6, 0.5, 0.3)
		"URBAN": mat.albedo_color = Color(0.15, 0.15, 0.18)
		"MODERN": mat.albedo_color = Color(0.12, 0.15, 0.12)
		_: mat.albedo_color = Color(0.12, 0.2, 0.1)
	mat.roughness = 0.95
	ground.material_override = mat
	ground.name = "Ground"
	add_child(ground)
