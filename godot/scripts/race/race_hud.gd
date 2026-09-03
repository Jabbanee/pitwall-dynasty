extends Control

@onready var timing_tower: VBoxContainer = $TimingTowerPanel/TimingTower
@onready var strategy_panel: Panel = $StrategyPanel
@onready var race_label: Label = $RaceLabel
@onready var lap_label: Label = $LapLabel

var _cars: Array = []
var _is_visible: bool = true

func _ready() -> void:
	_setup_timing_tower_header()
	_setup_strategy_panel()

func _setup_timing_tower_header() -> void:
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)

	var pos_label := Label.new()
	pos_label.text = "POS"
	pos_label.add_theme_font_size_override("font_size", 14)
	pos_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	pos_label.custom_minimum_size = Vector2(30, 0)
	header.add_child(pos_label)

	var driver_label := Label.new()
	driver_label.text = "DRIVER"
	driver_label.add_theme_font_size_override("font_size", 14)
	driver_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	driver_label.custom_minimum_size = Vector2(120, 0)
	header.add_child(driver_label)

	var team_label := Label.new()
	team_label.text = "TEAM"
	team_label.add_theme_font_size_override("font_size", 14)
	team_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	team_label.custom_minimum_size = Vector2(100, 0)
	header.add_child(team_label)

	var gap_label := Label.new()
	gap_label.text = "GAP"
	gap_label.add_theme_font_size_override("font_size", 14)
	gap_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	gap_label.custom_minimum_size = Vector2(60, 0)
	header.add_child(gap_label)

	timing_tower.add_child(header)

func _setup_strategy_panel() -> void:
	var title := Label.new()
	title.text = "STRATEGY"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.9, 0.2, 0.2))
	title.position = Vector2(10, 10)
	strategy_panel.add_child(title)

	# Driver selector
	var driver_label := Label.new()
	driver_label.text = "Driver 1"
	driver_label.add_theme_font_size_override("font_size", 14)
	driver_label.position = Vector2(10, 40)
	strategy_panel.add_child(driver_label)

	# Strategy buttons
	var buttons := ["PIT NOW", "BOX NEXT LAP", "TYRE: SOFT", "TYRE: MED", "TYRE: HARD"]
	var y_pos: float = 70.0
	for btn_text in buttons:
		var btn := Button.new()
		btn.text = btn_text
		btn.position = Vector2(10, y_pos)
		btn.custom_minimum_size = Vector2(140, 30)
		strategy_panel.add_child(btn)
		y_pos += 35.0

func update_timing_tower(cars: Array) -> void:
	# Clear existing entries (keep header)
	for i in range(timing_tower.get_child_count() - 1, 0, -1):
		timing_tower.get_child(i).queue_free()

	# Add car entries (top 10)
	for i in range(min(10, cars.size())):
		var car: Dictionary = cars[i]
		var row := _create_timing_row(car, i + 1)
		timing_tower.add_child(row)

func _create_timing_row(car: Dictionary, position: int) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)

	var pos_label := Label.new()
	pos_label.text = str(position)
	pos_label.add_theme_font_size_override("font_size", 14)
	pos_label.custom_minimum_size = Vector2(30, 0)
	if position == 1:
		pos_label.add_theme_color_override("font_color", Color(1.0, 0.8, 0.0))
	row.add_child(pos_label)

	var driver_label := Label.new()
	driver_label.text = car.get("driver", "Unknown")
	driver_label.add_theme_font_size_override("font_size", 14)
	driver_label.custom_minimum_size = Vector2(120, 0)
	row.add_child(driver_label)

	var team_label := Label.new()
	team_label.text = car.get("team", "")
	team_label.add_theme_font_size_override("font_size", 12)
	team_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	team_label.custom_minimum_size = Vector2(100, 0)
	row.add_child(team_label)

	var gap_label := Label.new()
	if position == 1:
		gap_label.text = "LEADER"
	else:
		gap_label.text = "+%d.%dL" % [position / 3, position % 3]
	gap_label.add_theme_font_size_override("font_size", 12)
	gap_label.custom_minimum_size = Vector2(60, 0)
	gap_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
	row.add_child(gap_label)

	return row

func update_race_info(lap: int, total_laps: int, phase: String) -> void:
	lap_label.text = "Lap %d/%d" % [lap, total_laps]
	race_label.text = phase

func toggle_visibility(visible: bool) -> void:
	_is_visible = visible
	if visible:
		show()
	else:
		hide()
