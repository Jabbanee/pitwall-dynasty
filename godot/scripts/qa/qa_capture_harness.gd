extends Node

# QA Capture Harness for Pitwall Dynasty
# Drives automated visual capture without manual interaction
# 
# Usage:
#   godot --qa-scenario=trackside --qa-output=./captures/
#   godot --qa-scenario=era_1980 --qa-output=./captures/
#   godot --qa-exit-after-capture

var _scenario: String = ""
var _output_path: String = ""
var _exit_after_capture: bool = false
var _capture_done: bool = false

func _ready() -> void:
	var args := OS.get_cmdline_args()
	
	# Parse QA arguments
	for i in range(args.size()):
		var arg: String = args[i]
		if arg.begins_with("--qa-scenario="):
			_scenario = arg.split("=")[1]
		elif arg.begins_with("--qa-output="):
			_output_path = arg.split("=")[1]
		elif arg == "--qa-exit-after-capture":
			_exit_after_capture = true
	
	if _scenario == "":
		_scenario = "default"
	if _output_path == "":
		_output_path = "res://docs/testing/screenshots/godot-migration/night7/"
	
	print("[QA] Scenario: ", _scenario)
	print("[QA] Output: ", _output_path)
	
	# Wait for scene to initialize
	await get_tree().create_timer(2.0).timeout
	
	# Load and setup the scenario
	await _setup_scenario(_scenario)
	
	# Wait for rendering to stabilize
	await get_tree().create_timer(3.0).timeout
	
	# Capture frames
	await _capture_scenario()
	
	if _exit_after_capture:
		print("[QA] Capture complete, exiting...")
		get_tree().quit()

func _setup_scenario(scenario: String) -> void:
	print("[QA] Setting up scenario: ", scenario)
	
	# Find the race broadcast node
	var race := get_tree().root.get_node_or_null("Main/ScreenRoot/RaceBroadcast")
	if not race:
		print("[QA] WARNING: RaceBroadcast node not found")
		return
	
	# Apply scenario settings
	match scenario:
		"default", "trackside":
			_apply_trackside_view(race)
		"helicopter":
			_apply_helicopter_view(race)
		"era_1980":
			_apply_era_view(race, "1980")
		"era_2022":
			_apply_era_view(race, "2022")
		"weather_rain":
			_apply_weather_view(race, 2)  # HEAVY_RAIN
		"pit":
			_apply_pit_view(race)
		"onboard":
			_apply_onboard_view(race)
		"venue_modern":
			_apply_venue_view(race, 5)  # MODERN
		_:
			_apply_trackside_view(race)
	
	print("[QA] Scenario setup complete")

func _apply_trackside_view(race: Node) -> void:
	# Set camera to trackside
	if race.has_method("set_camera_type"):
		race.set_camera_type(0)  # TRACKSIDE

func _apply_helicopter_view(race: Node) -> void:
	if race.has_method("set_camera_type"):
		race.set_camera_type(9)  # HELICOPTER

func _apply_era_view(race: Node, era: String) -> void:
	# Set era for all cars
	for child in race.get_children():
		if child.has_method("set_era"):
			child.set_era(era)

func _apply_weather_view(race: Node, weather_type: int) -> void:
	# Set weather
	var weather = race.get_node_or_null("WeatherSystem")
	if weather and weather.has_method("set_weather"):
		weather.set_weather(weather_type)

func _apply_pit_view(race: Node) -> void:
	if race.has_method("set_camera_type"):
		race.set_camera_type(6)  # PIT_ENTRY

func _apply_onboard_view(race: Node) -> void:
	if race.has_method("set_camera_type"):
		race.set_camera_type(10)  # ONBOARD

func _apply_venue_view(race: Node, venue_type: int) -> void:
	var env = race.get_node_or_null("EnvironmentSystem")
	if env and env.has_method("set_theme"):
		env.set_theme(venue_type)

func _capture_scenario() -> void:
	print("[QA] Starting capture...")
	
	# Wait for frame_post_draw to ensure rendering is complete
	await RenderingServer.frame_post_draw
	
	# Get viewport image
	var viewport := get_viewport()
	if not viewport:
		print("[QA] ERROR: No viewport")
		return
	
	var texture := viewport.get_texture()
	if not texture:
		print("[QA] ERROR: No viewport texture")
		return
	
	var image := texture.get_image()
	if not image:
		print("[QA] ERROR: Could not get image")
		return
	
	# Ensure output directory exists
	DirAccess.make_dir_recursive_absolute(_output_path)
	
	# Save screenshot
	var filename := _output_path.path_join(_scenario + ".png")
	var err := image.save_png(filename)
	
	if err == OK:
		print("[QA] CAPTURED: ", filename)
		print("[QA] Image size: ", image.get_width(), "x", image.get_height())
		_capture_done = true
	else:
		print("[QA] ERROR: Failed to save screenshot, error: ", err)
