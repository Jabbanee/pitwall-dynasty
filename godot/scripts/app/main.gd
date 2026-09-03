extends Node

@onready var screen_root: Node = $ScreenRoot
@onready var background: ColorRect = $Background

var _screens: Dictionary = {}
var _current_screen: Node = null

func _ready() -> void:
	_register_built_in_screens()
	GameRouter.route_changed.connect(_on_route_changed)
	_show_initial_screen()

func _register_built_in_screens() -> void:
	var main_menu: PackedScene = preload("res://scenes/menu/main_menu.tscn")
	_screens["MAIN_MENU"] = main_menu

	var settings: PackedScene = preload("res://scenes/menu/settings.tscn")
	_screens["SETTINGS"] = settings

	var race: PackedScene = preload("res://scenes/race/race_broadcast.tscn")
	_screens["RACE_BROADCAST"] = race

func _show_initial_screen() -> void:
	_on_route_changed("MAIN_MENU", "")

func _on_route_changed(new_route: String, _old_route: String) -> void:
	_set_screen(new_route)

func _set_screen(route: String) -> void:
	if _current_screen:
		_current_screen.queue_free()
		_current_screen = null

	var scene: PackedScene = _screens.get(route, null)
	if not scene:
		_current_screen = _create_placeholder_screen(route)
	else:
		_current_screen = scene.instantiate()

	if _current_screen:
		screen_root.add_child(_current_screen)

func _create_placeholder_screen(route: String) -> Control:
	var container := Control.new()
	container.set_anchors_preset(Control.PRESET_FULL_RECT)

	var label := Label.new()
	label.text = route.replace("_", " ").capitalize()
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.set_anchors_preset(Control.PRESET_CENTER)
	label.add_theme_font_size_override("font_size", 48)
	label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))

	var back_btn := Button.new()
	back_btn.text = "Back to Menu"
	back_btn.set_position(Vector2(0, 80))
	back_btn.pressed.connect(_go_back_to_menu)
	back_btn.set_anchors_preset(Control.PRESET_CENTER)

	container.add_child(label)
	container.add_child(back_btn)
	return container

func _go_back_to_menu() -> void:
	GameRouter.navigate_to("MAIN_MENU")
