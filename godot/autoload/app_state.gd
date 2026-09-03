extends Node

signal state_changed(key: String, value: Variant)

var _state: Dictionary = {}

func set_value(key: String, value: Variant) -> void:
	_state[key] = value
	state_changed.emit(key, value)

func get_value(key: String, default: Variant = null) -> Variant:
	return _state.get(key, default)

func has_value(key: String) -> bool:
	return _state.has(key)

func clear() -> void:
	state_changed.emit("*", null)
