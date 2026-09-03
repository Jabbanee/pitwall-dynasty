extends Node

signal route_changed(new_route: String, old_route: String)

const ROUTES := [
	"MAIN_MENU",
	"QUICK_START",
	"FAST_CHAMPIONSHIP",
	"MULTIPLAYER",
	"SOLO_CAREER",
	"SETTINGS",
	"RACE_BROADCAST",
	"HQ",
	"DRIVERS",
	"RESULTS"
]

var current_route: String = "MAIN_MENU" :
	set(value):
		var old := current_route
		current_route = value
		route_changed.emit(value, old)

func navigate_to(route: String) -> void:
	if route == current_route:
		return
	current_route = route

func get_all_routes() -> Array:
	return ROUTES.duplicate()
