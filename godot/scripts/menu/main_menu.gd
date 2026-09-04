extends Control

var ThemeHelper = preload("res://scripts/ui/theme_helper.gd")

@onready var buttons: VBoxContainer = $Buttons
@onready var title_label: Label = $TitleLabel
@onready var subtitle_label: Label = $SubtitleLabel
@onready var version_label: Label = $VersionLabel
@onready var background: ColorRect = $Background
@onready var anim_player: AnimationPlayer = $AnimationPlayer

signal navigate_to(route: String)

var _buttons: Array[Button] = []

func _ready() -> void:
	_setup_visuals()
	_connect_buttons()
	_focus_first_button()
	_play_intro_animation()

func _setup_visuals() -> void:
	# Background gradient effect
	if background:
		var bg_style := StyleBoxFlat.new()
		bg_style.bg_color = Color(0.03, 0.03, 0.05)
		bg_style.set_corner_radius_all(0)
		background.add_theme_stylebox_override("panel", bg_style)

	# Title styling
	if title_label:
		title_label.add_theme_font_size_override("font_size", 72)
		title_label.add_theme_color_override("font_color", Color(0.95, 0.95, 0.95))
		title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	# Subtitle styling
	if subtitle_label:
		subtitle_label.add_theme_font_size_override("font_size", 24)
		subtitle_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
		subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	# Version styling
	if version_label:
		version_label.text = "v" + ProjectSettings.get_setting("application/config/version", "0.1.0")
		version_label.add_theme_font_size_override("font_size", 14)
		version_label.add_theme_color_override("font_color", Color(0.4, 0.4, 0.4))

	# Style all buttons
	for child in buttons.get_children():
		if child is Button:
			ThemeHelper.apply_button_theme(child)
			_buttons.append(child)

func _connect_buttons() -> void:
	for i in range(_buttons.size()):
		var btn := _buttons[i]
		btn.pressed.connect(_on_button_pressed.bind(btn.name))
		btn.focus_entered.connect(_on_focus_entered.bind(btn))
		btn.focus_exited.connect(_on_focus_exited.bind(btn))
		btn.mouse_entered.connect(_on_hover_entered.bind(btn))
		btn.mouse_exited.connect(_on_hover_exited.bind(btn))

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
	if _buttons.size() > 0:
		_buttons[0].grab_focus()

func _on_focus_entered(btn: Button) -> void:
	# Could add sound effect here
	pass

func _on_focus_exited(btn: Button) -> void:
	pass

func _on_hover_entered(btn: Button) -> void:
	# Could add hover sound
	pass

func _on_hover_exited(btn: Button) -> void:
	pass

func _play_intro_animation() -> void:
	if anim_player and anim_player.has_animation("intro"):
		anim_player.play("intro")
	else:
		# Fade in effect
		modulate = Color.TRANSPARENT
		var tween := create_tween()
		tween.tween_property(self, "modulate", Color.WHITE, 0.5).set_delay(0.1)

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		_quit_game()
	elif event.is_action_pressed("ui_down") or event.is_action_pressed("ui_up"):
		# Ensure keyboard navigation works
		pass
