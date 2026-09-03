extends Node

signal setting_changed(key: String, value: Variant)

enum GraphicsPreset {
	LOW,
	MEDIUM,
	HIGH,
	ULTRA
}

enum DisplayMode {
	WINDOWED,
	BORDERLESS,
	FULLSCREEN
}

const SETTINGS_PATH := "user://settings.cfg"

var display_mode: int = 0 : # DisplayMode
	set(value):
		display_mode = value
		_apply_display_mode()
		_save_setting("display/mode", value)
		setting_changed.emit("display_mode", value)

var resolution: Vector2i = Vector2i(1920, 1080) :
	set(value):
		resolution = value
		_apply_resolution()
		_save_setting("display/resolution", value)
		setting_changed.emit("resolution", value)

var graphics_preset: int = 2 : # GraphicsPreset.HIGH
	set(value):
		graphics_preset = value
		_save_setting("graphics/preset", value)
		setting_changed.emit("graphics_preset", value)

var vsync: bool = true :
	set(value):
		vsync = value
		# Use ProjectSettings for vsync
		if value:
			ProjectSettings.set_setting("display/window/vsync/vsync_mode", 1)
		else:
			ProjectSettings.set_setting("display/window/vsync/vsync_mode", 0)
		_save_setting("display/vsync", value)
		setting_changed.emit("vsync", value)

var fps_limit: int = 60 :
	set(value):
		fps_limit = value
		if value > 0:
			Engine.max_fps = value
		else:
			Engine.max_fps = 0
		_save_setting("display/fps_limit", value)
		setting_changed.emit("fps_limit", value)

var reduced_motion: bool = false :
	set(value):
		reduced_motion = value
		_save_setting("accessibility/reduced_motion", value)
		setting_changed.emit("reduced_motion", value)

var master_volume: float = 0.8 :
	set(value):
		master_volume = value
		_save_setting("audio/master_volume", value)
		setting_changed.emit("master_volume", value)

var music_volume: float = 0.6 :
	set(value):
		music_volume = value
		_save_setting("audio/music_volume", value)
		setting_changed.emit("music_volume", value)

var sfx_volume: float = 0.7 :
	set(value):
		sfx_volume = value
		_save_setting("audio/sfx_volume", value)
		setting_changed.emit("sfx_volume", value)

var _config: ConfigFile = ConfigFile.new()

func _ready() -> void:
	_load_settings()

func _save_setting(setting_key: String, value: Variant) -> void:
	_config.set_value("settings", setting_key, value)
	_config.save(SETTINGS_PATH)

func _load_settings() -> void:
	var err := _config.load(SETTINGS_PATH)
	if err != OK:
		return

	display_mode = int(_config.get_value("settings", "display/mode", 0))
	resolution = _config.get_value("settings", "display/resolution", Vector2i(1920, 1080))
	graphics_preset = int(_config.get_value("settings", "graphics/preset", 2))
	vsync = _config.get_value("settings", "display/vsync", true)
	fps_limit = int(_config.get_value("settings", "display/fps_limit", 60))
	reduced_motion = _config.get_value("settings", "accessibility/reduced_motion", false)
	master_volume = _config.get_value("settings", "audio/master_volume", 0.8)
	music_volume = _config.get_value("settings", "audio/music_volume", 0.6)
	sfx_volume = _config.get_value("settings", "audio/sfx_volume", 0.7)

func _apply_display_mode() -> void:
	match display_mode:
		0: # WINDOWED
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		1: # BORDERLESS
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, true)
		2: # FULLSCREEN
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)

func _apply_resolution() -> void:
	if display_mode == 2:
		return
	DisplayServer.window_set_size(resolution)
	var viewport := get_viewport()
	if viewport:
		viewport.size = resolution
