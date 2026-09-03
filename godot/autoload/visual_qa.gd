extends Node

signal scenario_changed(scenario_name: String)
signal ready_state_changed(is_ready: bool)

enum CircuitType {
	FOREST,
	MOUNTAIN,
	COASTAL,
	DESERT,
	URBAN,
	MODERN
}

enum EraType {
	ERA_1980S,
	ERA_EARLY_1990S,
	ERA_LATE_1990S,
	ERA_2000_2008,
	ERA_2009_2013,
	ERA_2014_2021,
	ERA_2022_PLUS
}

enum WeatherType {
	DRY,
	LIGHT_RAIN,
	HEAVY_RAIN,
	WET_TRACK
}

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

var is_ready: bool = false :
	set(value):
		is_ready = value
		ready_state_changed.emit(value)

var current_circuit: CircuitType = CircuitType.FOREST
var current_era: EraType = EraType.ERA_2022_PLUS
var current_weather: WeatherType = WeatherType.DRY
var current_camera: CameraType = CameraType.TRACKSIDE
var is_paused: bool = false

var _scenario_handlers: Dictionary = {}

func register_scenario_handler(scenario: String, handler: Callable) -> void:
	_scenario_handlers[scenario] = handler

func set_circuit(circuit: CircuitType) -> void:
	current_circuit = circuit
	scenario_changed.emit("circuit")

func set_era(era: EraType) -> void:
	current_era = era
	scenario_changed.emit("era")

func set_weather(weather: WeatherType) -> void:
	current_weather = weather
	scenario_changed.emit("weather")

func set_camera(camera: CameraType) -> void:
	current_camera = camera
	scenario_changed.emit("camera")

func set_scenario(scenario_name: String) -> void:
	var handler: Callable = _scenario_handlers.get(scenario_name, Callable())
	if handler.is_valid():
		handler.call()
		scenario_changed.emit(scenario_name)

func reset() -> void:
	current_circuit = CircuitType.FOREST
	current_era = EraType.ERA_2022_PLUS
	current_weather = WeatherType.DRY
	current_camera = CameraType.TRACKSIDE
	is_paused = false
	is_ready = true
	scenario_changed.emit("reset")

func pause() -> void:
	is_paused = true

func resume() -> void:
	is_paused = false

func sample() -> Dictionary:
	return {
		"circuit": current_circuit,
		"era": current_era,
		"weather": current_weather,
		"camera": current_camera,
		"paused": is_paused,
		"ready": is_ready
	}
