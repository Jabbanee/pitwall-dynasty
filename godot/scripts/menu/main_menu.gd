extends Control

@onready var buttons: VBoxContainer = $Buttons
@onready var title_label: Label = $TitleLabel
@onready var subtitle_label: Label = $SubtitleLabel
@onready var version_label: Label = $VersionLabel

signal navigate_to(route: String)

func _ready() -> void:
	title_label.text = "PITWALL DYNASTY"
	subtitle_label.text = "Motorsport Team Management"
	version_label.text = "v" + ProjectSettings.get_setting("application/config/version", "0.1.0")

	_connect_buttons()
	_focus_first_button()

func _connect_buttons() -> void:
	for child in buttons.get_children():
		if child is Button:
			child.pressed.connect(_on_button_pressed.bind(child.name))

func _on_button_pressed(button_name: String) -> void:
	match button_name:
		"QuickStart":
			_start_quick_start()
		"FastChampionship":
			navigate_to.emit("FAST_CHAMPIONSHIP")
		"Multiplayer":
			navigate_to.emit("MULTIPLAYER")
		"SoloCareer":
			navigate_to.emit("SOLO_CAREER")
		"Settings":
			navigate_to.emit("SETTINGS")
		"Exit":
			_quit_game()

func _start_quick_start() -> void:
	print("Quick Start: launching race broadcast")
	navigate_to.emit("RACE_BROADCAST")

func _quit_game() -> void:
	get_tree().quit()

func _focus_first_button() -> void:
	if buttons.get_child_count() > 0:
		var first: Control = buttons.get_child(0)
		if first is BaseButton:
			first.grab_focus()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		_quit_game()
