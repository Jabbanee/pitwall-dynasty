class_name SnapshotInterpolation
extends RefCounted

# Snapshot interpolation for Pitwall Dynasty
# Smoothly interpolates between authoritative server snapshots

var _previous_snapshot: Dictionary = {}
var _target_snapshot: Dictionary = {}
var _previous_time: float = 0.0
var _target_time: float = 0.0
var _presentation_time: float = 0.0
var _interpolation_delay: float = 0.1  # 100ms delay for smooth interpolation

func update(delta: float) -> void:
	# Advance presentation time
	_presentation_time += delta

func receive_snapshot(snapshot: Dictionary, server_time: float) -> void:
	# Shift current target to previous
	_previous_snapshot = _target_snapshot
	_previous_time = _target_time
	
	# Set new target
	_target_snapshot = snapshot
	_target_time = server_time
	
	# Initialize presentation time if first snapshot
	if _previous_time == 0.0:
		_presentation_time = server_time - _interpolation_delay

func get_interpolated_state() -> Dictionary:
	if _target_snapshot.is_empty():
		return _previous_snapshot
	
	if _previous_snapshot.is_empty():
		return _target_snapshot
	
	# Calculate interpolation factor
	var time_since_target = _presentation_time - _target_time
	var time_between = _target_time - _previous_time
	
	if time_between <= 0:
		return _target_snapshot
	
	var t = clamp(time_since_target / time_between, 0.0, 1.0)
	
	# Interpolate car positions
	var result = _target_snapshot.duplicate()
	var prev_cars = _previous_snapshot.get("cars", [])
	var target_cars = _target_snapshot.get("cars", [])
	
	if prev_cars.is_empty() or target_cars.is_empty():
		return _target_snapshot
	
	var interpolated_cars: Array = []
	
	for target_car in target_cars:
		var car_id = target_car.get("carId", "")
		var prev_car = _find_car_by_id(prev_cars, car_id)
		
		if prev_car:
			var interpolated = _interpolate_car(prev_car, target_car, t)
			interpolated_cars.append(interpolated)
		else:
			interpolated_cars.append(target_car)
	
	result["cars"] = interpolated_cars
	return result

func _find_car_by_id(cars: Array, car_id: String) -> Variant:
	for car in cars:
		if car.get("carId", "") == car_id:
			return car
	return null

func _interpolate_car(prev: Dictionary, target: Dictionary, t: float) -> Dictionary:
	var result = target.duplicate()
	
	# Interpolate track progress (handles lap wrapping)
	var prev_progress = prev.get("trackProgress", 0.0)
	var target_progress = target.get("trackProgress", 0.0)
	
	# Handle lap wrap (0.99 -> 0.01)
	var diff = target_progress - prev_progress
	if diff < -0.5:
		diff += 1.0
	elif diff > 0.5:
		diff -= 1.0
	
	var interpolated_progress = prev_progress + diff * t
	if interpolated_progress < 0:
		interpolated_progress += 1.0
	elif interpolated_progress >= 1.0:
		interpolated_progress -= 1.0
	
	result["trackProgress"] = interpolated_progress
	
	# Interpolate other values
	result["speed"] = lerp(prev.get("speed", 0.0), target.get("speed", 0.0), t)
	result["gapSeconds"] = lerp(prev.get("gapSeconds", 0.0), target.get("gapSeconds", 0.0), t)
	
	return result

func snap_to_target() -> void:
	"""Snap to target snapshot (for reconnection or large discontinuities)."""
	_presentation_time = _target_time
	_previous_snapshot = _target_snapshot
	_previous_time = _target_time
