class_name BroadcastDirector
extends Node

# TV Director for Pitwall Dynasty
# Local presentation logic - selects cameras based on race events
# Does NOT affect race simulation

var CameraSystem = preload("res://scripts/race/camera_system.gd")

enum EventType {
	START,
	LIGHTS_OUT,
	OVERTAKE_ATTEMPT,
	BATTLE,
	POSITION_CHANGE,
	PIT_ENTRY,
	PIT_STOP,
	PIT_EXIT,
	INCIDENT,
	TEAM_ORDER,
	DRIVER_REFUSAL,
	FASTEST_LAP,
	LEAD_CHANGE,
	FINAL_LAP,
	FINISH
}

enum Priority {
	LOW,
	NORMAL,
	HIGH,
	CRITICAL
}

signal event_occurred(event_type: int, priority: int)
signal camera_suggested(camera_type: int)

var _camera_system: Node3D = null
var _event_queue: Array = []
var _current_priority: int = Priority.NORMAL
var _time_in_current_camera: float = 0.0
var _min_hold_time: float = 3.0

# Priority mapping for events
var _event_priorities: Dictionary = {
	EventType.START: Priority.CRITICAL,
	EventType.LIGHTS_OUT: Priority.CRITICAL,
	EventType.FINISH: Priority.CRITICAL,
	EventType.INCIDENT: Priority.CRITICAL,
	EventType.LEAD_CHANGE: Priority.HIGH,
	EventType.OVERTAKE_ATTEMPT: Priority.HIGH,
	EventType.BATTLE: Priority.HIGH,
	EventType.FINAL_LAP: Priority.HIGH,
	EventType.PIT_STOP: Priority.NORMAL,
	EventType.PIT_ENTRY: Priority.NORMAL,
	EventType.PIT_EXIT: Priority.NORMAL,
	EventType.POSITION_CHANGE: Priority.NORMAL,
	EventType.FASTEST_LAP: Priority.LOW,
	EventType.TEAM_ORDER: Priority.LOW,
	EventType.DRIVER_REFUSAL: Priority.LOW
}

# Camera suggestions for events
var _event_cameras: Dictionary = {
	EventType.START: CameraSystem.CameraType.START_FINISH,
	EventType.LIGHTS_OUT: CameraSystem.CameraType.START_FINISH,
	EventType.FINISH: CameraSystem.CameraType.START_FINISH,
	EventType.INCIDENT: CameraSystem.CameraType.HELICOPTER,
	EventType.LEAD_CHANGE: CameraSystem.CameraType.STRAIGHT_TELEPHOTO,
	EventType.OVERTAKE_ATTEMPT: CameraSystem.CameraType.BRAKING_LONG_LENS,
	EventType.BATTLE: CameraSystem.CameraType.BATTLE,
	EventType.FINAL_LAP: CameraSystem.CameraType.HELICOPTER,
	EventType.PIT_STOP: CameraSystem.CameraType.PIT_ENTRY,
	EventType.PIT_ENTRY: CameraSystem.CameraType.PIT_ENTRY,
	EventType.PIT_EXIT: CameraSystem.CameraType.PIT_EXIT,
	EventType.POSITION_CHANGE: CameraSystem.CameraType.TRACKSIDE,
	EventType.FASTEST_LAP: CameraSystem.CameraType.APEX_LOW,
	EventType.TEAM_ORDER: CameraSystem.CameraType.ONBOARD,
	EventType.DRIVER_REFUSAL: CameraSystem.CameraType.ONBOARD
}

func setup(camera_system: Node3D) -> void:
	_camera_system = camera_system

func process_event(event_type: int) -> void:
	var priority: int = _event_priorities.get(event_type, Priority.NORMAL)
	
	# Only process if priority is high enough
	if priority >= _current_priority or priority == Priority.CRITICAL:
		_event_queue.append({
			"type": event_type,
			"priority": priority,
			"time": Time.get_ticks_msec()
		})
		event_occurred.emit(event_type, priority)
		
		# Suggest camera for this event
		var suggested_camera: int = _event_cameras.get(event_type, CameraSystem.CameraType.TRACKSIDE)
		camera_suggested.emit(suggested_camera)
		
		if _camera_system and priority == Priority.CRITICAL:
			_camera_system.set_camera_type(suggested_camera)
			_current_priority = priority

func update(delta: float) -> void:
	_time_in_current_camera += delta
	
	# Process queued events
	if _event_queue.size() > 0:
		var event = _event_queue.pop_front()
		# Event already processed in process_event
	
	# Reset priority after hold time
	if _time_in_current_camera > _min_hold_time and _current_priority != Priority.NORMAL:
		_current_priority = Priority.NORMAL

func set_min_hold_time(seconds: float) -> void:
	_min_hold_time = seconds

func clear_queue() -> void:
	_event_queue.clear()
