class_name LiverySystem
extends RefCounted

# Livery system for Pitwall Dynasty
# Applies team colors and patterns to car materials

enum Template {
	CENTRE_STRIPE,
	DIAGONAL_SWEEP,
	NOSE_BAND,
	SIDEPOD_BLOCK,
	ENGINE_COVER_SWEEP,
	TWO_TONE,
	PINSTRIPE,
	ASYMMETRIC_ACCENT
}

const TEAM_LIVERIES := {
	"team_00": {"template": Template.CENTRE_STRIPE, "primary": Color(0.9, 0.2, 0.2), "secondary": Color(0.1, 0.1, 0.1), "accent": Color(1.0, 1.0, 1.0)},
	"team_01": {"template": Template.DIAGONAL_SWEEP, "primary": Color(0.2, 0.6, 0.9), "secondary": Color(0.9, 0.9, 0.9), "accent": Color(0.1, 0.2, 0.4)},
	"team_02": {"template": Template.NOSE_BAND, "primary": Color(0.9, 0.7, 0.1), "secondary": Color(0.2, 0.2, 0.2), "accent": Color(0.9, 0.3, 0.0)},
	"team_03": {"template": Template.SIDEPOD_BLOCK, "primary": Color(0.3, 0.8, 0.4), "secondary": Color(0.1, 0.3, 0.1), "accent": Color(0.9, 0.9, 0.9)},
	"team_04": {"template": Template.TWO_TONE, "primary": Color(0.7, 0.3, 0.9), "secondary": Color(0.2, 0.1, 0.3), "accent": Color(0.9, 0.7, 1.0)},
	"team_05": {"template": Template.ENGINE_COVER_SWEEP, "primary": Color(0.9, 0.5, 0.1), "secondary": Color(0.1, 0.1, 0.1), "accent": Color(1.0, 1.0, 1.0)},
	"team_06": {"template": Template.PINSTRIPE, "primary": Color(0.1, 0.3, 0.6), "secondary": Color(0.9, 0.9, 0.9), "accent": Color(0.9, 0.1, 0.1)},
	"team_07": {"template": Template.ASYMMETRIC_ACCENT, "primary": Color(0.8, 0.1, 0.3), "secondary": Color(0.1, 0.1, 0.1), "accent": Color(0.9, 0.9, 0.9)},
	"team_08": {"template": Template.CENTRE_STRIPE, "primary": Color(0.1, 0.5, 0.5), "secondary": Color(0.9, 0.9, 0.9), "accent": Color(0.1, 0.1, 0.1)},
	"team_09": {"template": Template.DIAGONAL_SWEEP, "primary": Color(0.6, 0.1, 0.1), "secondary": Color(0.9, 0.8, 0.6), "accent": Color(0.1, 0.1, 0.1)}
}

static func get_team_livery(team_id: String) -> Dictionary:
	return TEAM_LIVERIES.get(team_id, TEAM_LIVERIES["team_00"])

static func apply_livery(car_node: Node, team_id: String) -> void:
	var livery = get_team_livery(team_id)
	_apply_template(car_node, livery)

static func _apply_template(node: Node, livery: Dictionary) -> void:
	var template = livery["template"]
	var primary = livery["primary"]
	var secondary = livery["secondary"]
	var accent = livery["accent"]
	
	# Apply colors based on template
	match template:
		Template.CENTRE_STRIPE:
			_apply_centre_stripe(node, primary, secondary, accent)
		Template.DIAGONAL_SWEEP:
			_apply_diagonal_sweep(node, primary, secondary, accent)
		Template.NOSE_BAND:
			_apply_nose_band(node, primary, secondary, accent)
		Template.SIDEPOD_BLOCK:
			_apply_sidepod_block(node, primary, secondary, accent)
		Template.ENGINE_COVER_SWEEP:
			_apply_engine_cover_sweep(node, primary, secondary, accent)
		Template.TWO_TONE:
			_apply_two_tone(node, primary, secondary, accent)
		Template.PINSTRIPE:
			_apply_pin_stripe(node, primary, secondary, accent)
		Template.ASYMMETRIC_ACCENT:
			_apply_asymmetric_accent(node, primary, secondary, accent)

static func _apply_centre_stripe(node: Node, primary: Color, secondary: Color, accent: Color) -> void:
	_set_material_color(node, "BodyPaint", primary)
	_set_material_color(node, "Stripe", accent)

static func _apply_diagonal_sweep(node: Node, primary: Color, secondary: Color, accent: Color) -> void:
	_set_material_color(node, "BodyPaint", secondary)
	_set_material_color(node, "Accent", primary)

static func _apply_nose_band(node: Node, primary: Color, secondary: Color, accent: Color) -> void:
	_set_material_color(node, "BodyPaint", primary)
	_set_material_color(node, "Nose", accent)

static func _apply_sidepod_block(node: Node, primary: Color, secondary: Color, accent: Color) -> void:
	_set_material_color(node, "BodyPaint", primary)
	_set_material_color(node, "Sidepod", secondary)

static func _apply_engine_cover_sweep(node: Node, primary: Color, secondary: Color, accent: Color) -> void:
	_set_material_color(node, "BodyPaint", primary)
	_set_material_color(node, "EngineCover", secondary)

static func _apply_two_tone(node: Node, primary: Color, secondary: Color, accent: Color) -> void:
	_set_material_color(node, "BodyPaint", primary)
	_set_material_color(node, "LowerBody", secondary)

static func _apply_pin_stripe(node: Node, primary: Color, secondary: Color, accent: Color) -> void:
	_set_material_color(node, "BodyPaint", primary)
	_set_material_color(node, "PinStripe", accent)

static func _apply_asymmetric_accent(node: Node, primary: Color, secondary: Color, accent: Color) -> void:
	_set_material_color(node, "BodyPaint", primary)
	_set_material_color(node, "AccentPanel", accent)

static func _set_material_color(node: Node, material_name: String, color: Color) -> void:
	if node is MeshInstance3D:
		for i in range(node.get_surface_override_material_count()):
			var mat = node.get_surface_override_material(i)
			if mat and mat.name.contains(material_name):
				mat.albedo_color = color
	
	for child in node.get_children():
		_set_material_color(child, material_name, color)
