extends Node

const SAVE_DIR: String = "user://saves/"
const SAVE_EXTENSION: String = ".pitsave"

signal save_created(save_id: String)
signal save_loaded(save_id: String)
signal save_deleted(save_id: String)

func _ready() -> void:
	_ensure_save_dir()

func _ensure_save_dir() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)

func create_save(save_id: String, data: Dictionary) -> int:
	var path: String = SAVE_DIR + save_id + SAVE_EXTENSION
	var file := FileAccess.open(path, FileAccess.WRITE)
	if not file:
		return FileAccess.get_open_error()
	var json: String = JSON.stringify(data, "\t")
	file.store_string(json)
	file.close()
	save_created.emit(save_id)
	return OK

func load_save(save_id: String) -> Dictionary:
	var path: String = SAVE_DIR + save_id + SAVE_EXTENSION
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if not file:
		return {}
	var text: String = file.get_as_text()
	file.close()
	var json := JSON.new()
	var err: int = json.parse(text)
	if err != OK:
		return {}
	save_loaded.emit(save_id)
	return json.data

func delete_save(save_id: String) -> void:
	var path: String = SAVE_DIR + save_id + SAVE_EXTENSION
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)
		save_deleted.emit(save_id)

func list_saves() -> Array:
	var saves: Array = []
	var dir := DirAccess.open(SAVE_DIR)
	if not dir:
		return saves
	dir.list_dir_begin()
	var file_name: String = dir.get_next()
	while file_name != "":
		if file_name.ends_with(SAVE_EXTENSION):
			saves.append(file_name.replace(SAVE_EXTENSION, ""))
		file_name = dir.get_next()
	dir.list_dir_end()
	return saves

func has_saves() -> bool:
	return list_saves().size() > 0
