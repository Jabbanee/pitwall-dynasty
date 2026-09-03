extends Node

const DATA_PATH := "res://data/resources/"

var _teams: Dictionary = {}
var _drivers: Dictionary = {}
var _circuits: Dictionary = {}
var _sponsors: Dictionary = {}
var _series: Dictionary = {}
var _loaded: bool = false

signal content_loaded()

func _ready() -> void:
	load_all()

func load_all() -> void:
	_teams = _load_json_teams()
	_drivers = _load_json_drivers()
	_circuits = _load_json_circuits()
	_sponsors = _load_json_sponsors()
	_series = _load_json_series()
	_loaded = true
	content_loaded.emit()

func _load_json_teams() -> Dictionary:
	var file := FileAccess.open(DATA_PATH + "teams.json", FileAccess.READ)
	if not file:
		return {}
	var text := file.get_as_text()
	file.close()
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		return {}
	return json.data

func _load_json_drivers() -> Dictionary:
	var file := FileAccess.open(DATA_PATH + "drivers.json", FileAccess.READ)
	if not file:
		return {}
	var text := file.get_as_text()
	file.close()
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		return {}
	return json.data

func _load_json_circuits() -> Dictionary:
	var file := FileAccess.open(DATA_PATH + "circuits.json", FileAccess.READ)
	if not file:
		return {}
	var text := file.get_as_text()
	file.close()
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		return {}
	return json.data

func _load_json_sponsors() -> Dictionary:
	var file := FileAccess.open(DATA_PATH + "sponsors.json", FileAccess.READ)
	if not file:
		return {}
	var text := file.get_as_text()
	file.close()
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		return {}
	return json.data

func _load_json_series() -> Dictionary:
	var file := FileAccess.open(DATA_PATH + "series.json", FileAccess.READ)
	if not file:
		return {}
	var text := file.get_as_text()
	file.close()
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		return {}
	return json.data

func get_team(id: String) -> Variant:
	return _teams.get(id, null)

func get_driver(id: String) -> Variant:
	return _drivers.get(id, null)

func get_circuit(id: String) -> Variant:
	return _circuits.get(id, null)

func get_sponsor(id: String) -> Variant:
	return _sponsors.get(id, null)

func get_series(id: String) -> Variant:
	return _series.get(id, null)

func get_all_teams() -> Dictionary:
	return _teams

func get_all_drivers() -> Dictionary:
	return _drivers

func get_all_circuits() -> Dictionary:
	return _circuits

func is_loaded() -> bool:
	return _loaded
