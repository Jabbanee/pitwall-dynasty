extends Node3D

@onready var circuit_root: Node3D = $CircuitRoot
@onready var cars_root: Node3D = $CarsRoot
@onready var camera_rig: Node3D = $CameraRig
@onready var camera_3d: Camera3D = $CameraRig/Camera3D
@onready var hud: Control = $HUD
@onready var timing_tower: VBoxContainer = $HUD/TimingTower
@onready var strategy_panel: Panel = $HUD/StrategyPanel

var _cars: Array = []
var _race_data: Dictionary = {}
var _is_race_active: bool = false
var _presentation_time: float = 0.0

func _ready() -> void:
	print("RaceBroadcast: Initializing")
	_setup_default_race()
	_spawn_cars()
	print("RaceBroadcast: Ready with %d cars" % _cars.size())

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
	for i in range(count):
		var team_idx: int = i % team_names.size()
		cars.append({
			"id": "car_%02d" % i,
			"driver": "Driver %d" % (i + 1),
			"team": team_names[team_idx],
			"team_id": "team_%02d" % team_idx,
			"position": i + 1,
			"lap_progress": 0.0,
			"track_position": Vector3(i * 4.0 - 40.0, 0.0, 0.0),
			"compound": "MEDIUM",
			"pit_state": "TRACK",
			"speed": 200.0 + randf() * 50.0
		})
	return cars

func _spawn_cars() -> void:
	for car_data in _race_data.cars:
		var car := _create_car_visual(car_data)
		_cars.append({"data": car_data, "node": car})
		cars_root.add_child(car)

func _create_car_visual(car_data: Dictionary) -> Node3D:
	var container := Node3D.new()
	container.name = car_data.id
	container.position = car_data.track_position

	var body := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(2.0, 0.5, 4.0)
	body.mesh = box

	var material := StandardMaterial3D.new()
	material.albedo_color = _get_team_color(car_data.team_id)
	body.material_override = material

	var cockpit := MeshInstance3D.new()
	var cockpit_mesh := BoxMesh.new()
	cockpit_mesh.size = Vector3(0.8, 0.4, 1.5)
	cockpit.mesh = cockpit_mesh
	cockpit.position = Vector3(0.0, 0.4, -0.5)

	container.add_child(body)
	container.add_child(cockpit)

	return container

func _get_team_color(team_id: String) -> Color:
	match team_id:
		"team_00": return Color(0.9, 0.2, 0.2)
		"team_01": return Color(0.2, 0.6, 0.9)
		"team_02": return Color(0.9, 0.7, 0.1)
		"team_03": return Color(0.3, 0.8, 0.4)
		"team_04": return Color(0.7, 0.3, 0.9)
		_: return Color(0.8, 0.8, 0.8)

func _process(delta: float) -> void:
	if not _is_race_active:
		return
	_presentation_time += delta
	_update_car_positions(delta)
	_update_camera(delta)

func _update_car_positions(delta: float) -> void:
	for car_entry in _cars:
		var data: Dictionary = car_entry.data
		var node: Node3D = car_entry.node
		if not node:
			continue
		data.lap_progress = data.lap_progress + delta * 0.05
		if data.lap_progress >= 1.0:
			data.lap_progress -= 1.0
		var angle: float = data.lap_progress * TAU
		var radius: float = 40.0 + data.position * 0.5
		node.position.x = cos(angle) * radius
		node.position.z = sin(angle) * radius
		node.rotation.y = angle + PI / 2.0

func _update_camera(delta: float) -> void:
	if not camera_3d:
		return
	_presentation_time += delta * 0.1
	var cam_angle: float = _presentation_time * 0.2
	camera_3d.position = Vector3(
		sin(cam_angle) * 80.0,
		25.0,
		cos(cam_angle) * 80.0
	)
	camera_3d.look_at(Vector3(0, 0, 0), Vector3(0, 1, 0))

func start_race() -> void:
	_is_race_active = true
	print("Race started")

func pause_race() -> void:
	_is_race_active = false
	print("Race paused")

func stop_race() -> void:
	_is_race_active = false
	print("Race stopped")

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		GameRouter.navigate_to("MAIN_MENU")
	elif event.is_action_pressed("pause"):
		if _is_race_active:
			pause_race()
		else:
			start_race()
