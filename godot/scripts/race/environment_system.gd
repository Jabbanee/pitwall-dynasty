class_name EnvironmentSystem
extends Node3D

# Environment system for Pitwall Dynasty
# Manages venue themes and visual atmosphere

enum Theme {
	FOREST,
	MOUNTAIN,
	COASTAL,
	DESERT,
	URBAN,
	MODERN
}

var current_theme: int = Theme.FOREST

# Theme configurations
var _theme_configs: Dictionary = {
	Theme.FOREST: {
		"ground_color": Color(0.12, 0.2, 0.1),
		"sky_color": Color(0.4, 0.6, 0.8),
		"fog_color": Color(0.7, 0.8, 0.9),
		"ambient_energy": 0.4,
		"sun_energy": 1.2
	},
	Theme.MOUNTAIN: {
		"ground_color": Color(0.2, 0.18, 0.15),
		"sky_color": Color(0.5, 0.7, 0.9),
		"fog_color": Color(0.8, 0.85, 0.9),
		"ambient_energy": 0.5,
		"sun_energy": 1.4
	},
	Theme.COASTAL: {
		"ground_color": Color(0.15, 0.18, 0.12),
		"sky_color": Color(0.4, 0.7, 0.9),
		"fog_color": Color(0.75, 0.85, 0.95),
		"ambient_energy": 0.5,
		"sun_energy": 1.5
	},
	Theme.DESERT: {
		"ground_color": Color(0.6, 0.5, 0.3),
		"sky_color": Color(0.6, 0.8, 0.95),
		"fog_color": Color(0.9, 0.85, 0.7),
		"ambient_energy": 0.6,
		"sun_energy": 1.8
	},
	Theme.URBAN: {
		"ground_color": Color(0.15, 0.15, 0.18),
		"sky_color": Color(0.5, 0.55, 0.6),
		"fog_color": Color(0.7, 0.7, 0.75),
		"ambient_energy": 0.3,
		"sun_energy": 1.0
	},
	Theme.MODERN: {
		"ground_color": Color(0.12, 0.15, 0.12),
		"sky_color": Color(0.45, 0.65, 0.85),
		"fog_color": Color(0.8, 0.85, 0.9),
		"ambient_energy": 0.45,
		"sun_energy": 1.3
	}
}

var _environment: WorldEnvironment = null
var _sun_light: DirectionalLight3D = null

func setup() -> void:
	# Find or create WorldEnvironment
	_environment = _find_world_environment()
	if not _environment:
		_environment = WorldEnvironment.new()
		_environment.name = "WorldEnvironment"
		add_child(_environment)
	
	# Find sun light
	_sun_light = _find_sun_light()

func set_theme(theme: int) -> void:
	current_theme = theme
	_apply_theme(theme)

func _apply_theme(theme: int) -> void:
	var config: Dictionary = _theme_configs.get(theme, _theme_configs[Theme.FOREST])
	
	# Update environment
	if _environment and _environment.environment:
		_environment.environment.ambient_light_energy = config["ambient_energy"]
	
	# Update sun
	if _sun_light:
		_sun_light.light_energy = config["sun_energy"]

func _find_world_environment() -> WorldEnvironment:
	for child in get_children():
		if child is WorldEnvironment:
			return child
	return null

func _find_sun_light() -> DirectionalLight3D:
	for child in get_children():
		if child is DirectionalLight3D:
			return child
	return null

func get_ground_color() -> Color:
	var config: Dictionary = _theme_configs.get(current_theme, _theme_configs[Theme.FOREST])
	return config["ground_color"]

func get_theme_name() -> String:
	return Theme.keys()[current_theme]
