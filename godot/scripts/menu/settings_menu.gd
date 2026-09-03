extends Control

@onready var back_btn: Button = $BackButton
@onready var display_mode_btn: OptionButton = $DisplayModeButton
@onready var resolution_btn: OptionButton = $ResolutionButton
@onready var graphics_btn: OptionButton = $GraphicsButton
@onready var vsync_btn: CheckButton = $VSyncButton
@onready var fps_spin: SpinBox = $FPSSpinBox
@onready var motion_btn: CheckButton = $ReducedMotionButton

func _ready() -> void:
	_populate_options()
	_load_current_settings()
	_connect_signals()

func _populate_options() -> void:
	display_mode_btn.clear()
	display_mode_btn.add_item("Windowed", 0)
	display_mode_btn.add_item("Borderless", 1)
	display_mode_btn.add_item("Fullscreen", 2)

	resolution_btn.clear()
	resolution_btn.add_item("1920x1080", 0)
	resolution_btn.add_item("1600x900", 1)
	resolution_btn.add_item("1280x800", 2)
	resolution_btn.add_item("1280x720", 3)

	graphics_btn.clear()
	graphics_btn.add_item("Low", 0)
	graphics_btn.add_item("Medium", 1)
	graphics_btn.add_item("High", 2)
	graphics_btn.add_item("Ultra", 3)

func _load_current_settings() -> void:
	display_mode_btn.selected = SettingsService.display_mode
	resolution_btn.selected = 0
	graphics_btn.selected = SettingsService.graphics_preset
	vsync_btn.button_pressed = SettingsService.vsync
	fps_spin.value = SettingsService.fps_limit
	motion_btn.button_pressed = SettingsService.reduced_motion

func _connect_signals() -> void:
	back_btn.pressed.connect(_go_back)
	display_mode_btn.item_selected.connect(_on_display_mode_selected)
	resolution_btn.item_selected.connect(_on_resolution_selected)
	graphics_btn.item_selected.connect(_on_graphics_selected)
	vsync_btn.toggled.connect(_on_vsync_toggled)
	fps_spin.value_changed.connect(_on_fps_changed)
	motion_btn.toggled.connect(_on_motion_toggled)

func _go_back() -> void:
	GameRouter.navigate_to("MAIN_MENU")

func _on_display_mode_selected(idx: int) -> void:
	SettingsService.display_mode = idx

func _on_resolution_selected(idx: int) -> void:
	match idx:
		0: SettingsService.resolution = Vector2i(1920, 1080)
		1: SettingsService.resolution = Vector2i(1600, 900)
		2: SettingsService.resolution = Vector2i(1280, 800)
		3: SettingsService.resolution = Vector2i(1280, 720)

func _on_graphics_selected(idx: int) -> void:
	SettingsService.graphics_preset = idx

func _on_vsync_toggled(pressed: bool) -> void:
	SettingsService.vsync = pressed

func _on_fps_changed(value: float) -> void:
	SettingsService.fps_limit = int(value)

func _on_motion_toggled(pressed: bool) -> void:
	SettingsService.reduced_motion = pressed
