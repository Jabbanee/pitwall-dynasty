class_name CameraSystem
extends Node3D

# Broadcast camera system for Pitwall Dynasty
# Implements explicit camera archetypes for race broadcast

enum CameraType {
	TRACKSIDE,
	BRAKING_LONG_LENS,
	APEX_LOW,
	CORNER_EXIT_PAN,
	STRAIGHT_TELEPHOTO,
	CREST,
	PIT_ENTRY,
	PIT_EXIT,
	START_FINISH,
	HELICOPTER,
	ONBOARD,
	BATTLE
}

# FOV values for each camera type
const CAMERA_FOVS: Dictionary = {
	CameraType.TRACKSIDE: 50.0,
	CameraType.BRAKING_LONG_LENS: 30.0,
	CameraType.APEX_LOW: 42.0,
	CameraType.CORNER_EXIT_PAN: 40.0,
	CameraType.STRAIGHT_TELEPHOTO: 28.0,
	CameraType.CREST: 40.0,
	CameraType.PIT_ENTRY: 46.0,
	CameraType.PIT_EXIT: 46.0,
	CameraType.START_FINISH: 42.0,
	CameraType.HELICOPTER: 52.0,
	CameraType.ONBOARD: 74.0,
	CameraType.BATTLE: 46.0
}

# Hold times for each camera type (seconds)
const CAMERA_HOLD_TIMES: Dictionary = {
	CameraType.TRACKSIDE: 6.0,
	CameraType.BRAKING_LONG_LENS: 4.0,
	CameraType.APEX_LOW: 3.0,
	CameraType.CORNER_EXIT_PAN: 4.0,
	CameraType.STRAIGHT_TELEPHOTO: 5.0,
	CameraType.CREST: 4.0,
	CameraType.PIT_ENTRY: 3.0,
	CameraType.PIT_EXIT: 3.0,
	CameraType.START_FINISH: 5.0,
	CameraType.HELICOPTER: 8.0,
	CameraType.ONBOARD: 5.0,
	CameraType.BATTLE: 6.0
}

signal camera_changed(new_type: CameraType)

var current_type: int = CameraType.TRACKSIDE
var _time: float = 0.0
var _hold_timer: float = 0.0
var _track_center: Vector3 = Vector3.ZERO
var _track_radius: float = 50.0
var _target_car: Node3D = null
var _cars: Array = []

func setup(track_center: Vector3, track_radius: float, cars: Array = []) -> void:
	_track_center = track_center
	_track_radius = track_radius
	_cars = cars

func set_camera_type(type: int) -> void:
	if type == current_type:
		return
	current_type = type
	_hold_timer = 0.0
	camera_changed.emit(type)

func next_camera() -> void:
	var next_type = (current_type + 1) % CameraType.size()
	set_camera_type(next_type)

func previous_camera() -> void:
	var prev_type = (current_type - 1 + CameraType.size()) % CameraType.size()
	set_camera_type(prev_type)

func set_target_car(car: Node3D) -> void:
	_target_car = car

func _process(delta: float) -> void:
	_time += delta
	_hold_timer += delta
	_update_camera_position()

func _update_camera_position() -> void:
	var camera := _find_camera()
	if not camera:
		return

	match current_type:
		CameraType.TRACKSIDE:
			_update_trackside(camera)
		CameraType.HELICOPTER:
			_update_helicopter(camera)
		CameraType.ONBOARD:
			_update_onboard(camera)
		CameraType.BRAKING_LONG_LENS:
			_update_braking_long_lens(camera)
		CameraType.APEX_LOW:
			_update_apex_low(camera)
		CameraType.STRAIGHT_TELEPHOTO:
			_update_straight_telephoto(camera)
		CameraType.CORNER_EXIT_PAN:
			_update_corner_exit_pan(camera)
		CameraType.BATTLE:
			_update_battle(camera)
		_:
			_update_trackside(camera)

func _find_camera() -> Camera3D:
	var root := get_tree().root
	return _find_camera_recursive(root)

func _find_camera_recursive(node: Node) -> Camera3D:
	if node is Camera3D and node.current:
		return node
	for child in node.get_children():
		var result := _find_camera_recursive(child)
		if result:
			return result
	return null

func _update_trackside(camera: Camera3D) -> void:
	var angle: float = _time * 0.15
	var height: float = 25.0
	var distance: float = _track_radius + 40.0

	camera.position = Vector3(
		sin(angle) * distance,
		height,
		cos(angle) * distance
	)
	camera.look_at(_track_center, Vector3.UP)

func _update_helicopter(camera: Camera3D) -> void:
	var angle: float = _time * 0.08
	var height: float = 80.0
	var distance: float = _track_radius + 60.0

	camera.position = Vector3(
		sin(angle) * distance,
		height,
		cos(angle) * distance
	)
	camera.look_at(_track_center + Vector3(0, -20, 0), Vector3.UP)

func _update_onboard(camera: Camera3D) -> void:
	if _target_car:
		camera.position = _target_car.position + Vector3(0, 3, -5)
		camera.look_at(_target_car.position + Vector3(0, 1, 20), Vector3.UP)
	else:
		_update_trackside(camera)

func _update_braking_long_lens(camera: Camera3D) -> void:
	if _target_car:
		var car_pos := _target_car.position
		var offset := Vector3(0, 3, 15)
		camera.position = car_pos + offset
		camera.look_at(car_pos, Vector3.UP)
	else:
		_update_trackside(camera)

func _update_apex_low(camera: Camera3D) -> void:
	var angle: float = _time * 0.1
	var height: float = 2.0
	var distance: float = _track_radius - 10.0

	camera.position = Vector3(
		sin(angle) * distance,
		height,
		cos(angle) * distance
	)
	camera.look_at(_track_center + Vector3(0, 5, 0), Vector3.UP)

func _update_straight_telephoto(camera: Camera3D) -> void:
	var angle: float = _time * 0.05
	var height: float = 8.0
	var distance: float = _track_radius + 80.0

	camera.position = Vector3(
		sin(angle) * distance,
		height,
		cos(angle) * distance
	)
	camera.look_at(_track_center, Vector3.UP)

func _update_corner_exit_pan(camera: Camera3D) -> void:
	var angle: float = _time * 0.12
	var height: float = 5.0
	var distance: float = _track_radius + 20.0

	camera.position = Vector3(
		sin(angle) * distance,
		height,
		cos(angle) * distance
	)
	
	# Look slightly ahead on track
	var look_ahead := Vector3(
		sin(angle + 0.3) * _track_radius,
		0,
		cos(angle + 0.3) * _track_radius
	)
	camera.look_at(look_ahead, Vector3.UP)

func _update_battle(camera: Camera3D) -> void:
	if _cars.size() >= 2:
		# Find two closest cars
		var car1: Node3D = _cars[0].visual if _cars[0].has("visual") else _cars[0]
		var car2: Node3D = _cars[1].visual if _cars[1].has("visual") else _cars[1]
		
		var mid_point := (car1.position + car2.position) / 2.0
		var offset := Vector3(0, 5, 15)
		camera.position = mid_point + offset
		camera.look_at(mid_point, Vector3.UP)
	else:
		_update_trackside(camera)

func get_current_fov() -> float:
	return CAMERA_FOVS.get(current_type, 50.0)

func get_hold_time() -> float:
	return CAMERA_HOLD_TIMES.get(current_type, 5.0)

func should_switch() -> bool:
	return _hold_timer >= get_hold_time()
