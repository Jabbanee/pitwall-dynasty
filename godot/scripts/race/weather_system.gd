class_name WeatherSystem
extends Node3D

# Weather system for Pitwall Dynasty
# Manages rain, wet track, spray effects

enum WeatherType {
	DRY,
	LIGHT_RAIN,
	HEAVY_RAIN,
	WET_TRACK
}

var current_weather: int = WeatherType.DRY
var wetness: float = 0.0  # 0.0 = dry, 1.0 = fully wet

@onready var rain_particles: GPUParticles3D = $RainParticles
@onready var world_environment: WorldEnvironment = $WorldEnvironment
@onready var sun_light: DirectionalLight3D = $DirectionalLight3D

var _target_wetness: float = 0.0
var _wet_track_material: StandardMaterial3D = null

func setup() -> void:
	# Find or create rain particles
	if not rain_particles:
		rain_particles = GPUParticles3D.new()
		rain_particles.name = "RainParticles"
		rain_particles.amount = 0
		rain_particles.lifetime = 2.0
		rain_particles.emitting = false
		add_child(rain_particles)
	
	# Find world environment
	if not world_environment:
		world_environment = WorldEnvironment.new()
		world_environment.name = "WorldEnvironment"
		add_child(world_environment)

func set_weather(weather: int) -> void:
	current_weather = weather
	
	match weather:
		WeatherType.DRY:
			_target_wetness = 0.0
			_set_rain_intensity(0)
			_set_lighting_sunny()
		WeatherType.LIGHT_RAIN:
			_target_wetness = 0.4
			_set_rain_intensity(0.3)
			_set_lighting_overcast()
		WeatherType.HEAVY_RAIN:
			_target_wetness = 1.0
			_set_rain_intensity(1.0)
			_set_lighting_storm()
		WeatherType.WET_TRACK:
			_target_wetness = 0.7
			_set_rain_intensity(0)
			_set_lighting_overcast()

func _process(delta: float) -> void:
	# Smoothly interpolate wetness
	wetness = lerp(wetness, _target_wetness, delta * 0.5)
	
	# Update track wetness
	_update_track_wetness()
	
	# Update rain
	_update_rain()

func _set_rain_intensity(intensity: float) -> void:
	if rain_particles:
		rain_particles.amount = int(intensity * 10000)
		rain_particles.emitting = intensity > 0.01

func _set_lighting_sunny() -> void:
	if sun_light:
		sun_light.light_energy = 1.5
		sun_light.light_color = Color(1.0, 0.95, 0.9)

func _set_lighting_overcast() -> void:
	if sun_light:
		sun_light.light_energy = 0.8
		sun_light.light_color = Color(0.8, 0.85, 0.9)

func _set_lighting_storm() -> void:
	if sun_light:
		sun_light.light_energy = 0.4
		sun_light.light_color = Color(0.6, 0.7, 0.8)

func _update_track_wetness() -> void:
	# Update track material wetness
	if _wet_track_material:
		_wet_track_material.roughness = lerp(0.85, 0.3, wetness)
		_wet_track_material.albedo_color = lerp(Color(0.15, 0.15, 0.15), Color(0.08, 0.08, 0.1), wetness)

func _update_rain() -> void:
	# Update spray from cars based on wetness
	pass

func get_wetness() -> float:
	return wetness

func is_wet() -> bool:
	return wetness > 0.1
