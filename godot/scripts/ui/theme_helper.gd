# Theme Helper - Static functions for UI styling
# This script provides theme utilities for Pitwall Dynasty UI

const COLORS := {
	"background": Color(0.03, 0.03, 0.05),
	"panel": Color(0.08, 0.08, 0.12),
	"panel_light": Color(0.12, 0.12, 0.18),
	"accent": Color(0.9, 0.2, 0.2),
	"accent_hover": Color(1.0, 0.3, 0.3),
	"accent_dark": Color(0.7, 0.15, 0.15),
	"text_primary": Color(0.95, 0.95, 0.95),
	"text_secondary": Color(0.7, 0.7, 0.7),
	"text_disabled": Color(0.4, 0.4, 0.4),
	"border": Color(0.2, 0.2, 0.25),
	"border_focus": Color(0.9, 0.2, 0.2),
	"success": Color(0.3, 0.8, 0.4),
	"warning": Color(0.9, 0.7, 0.1),
	"danger": Color(0.9, 0.2, 0.2),
	"team_aquila": Color(0.9, 0.2, 0.2),
	"team_boreal": Color(0.2, 0.6, 0.9),
	"team_kestrel": Color(0.9, 0.7, 0.1),
	"team_meridian": Color(0.3, 0.8, 0.4),
	"team_titan": Color(0.7, 0.3, 0.9),
}

static func create_stylebox_flat(bg_color: Color, border_color: Color = Color.TRANSPARENT, border_width: float = 0.0, corner_radius: float = 4.0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.border_width_left = int(border_width)
	style.border_width_right = int(border_width)
	style.border_width_top = int(border_width)
	style.border_width_bottom = int(border_width)
	style.corner_radius_top_left = int(corner_radius)
	style.corner_radius_top_right = int(corner_radius)
	style.corner_radius_bottom_left = int(corner_radius)
	style.corner_radius_bottom_right = int(corner_radius)
	style.anti_aliasing = true
	return style

static func create_button_style() -> Dictionary:
	return {
		"normal": create_stylebox_flat(COLORS.panel, COLORS.border, 1.0, 6.0),
		"hover": create_stylebox_flat(COLORS.panel_light, COLORS.accent, 1.0, 6.0),
		"pressed": create_stylebox_flat(COLORS.accent, COLORS.accent_hover, 1.0, 6.0),
		"focus": create_stylebox_flat(COLORS.panel_light, COLORS.border_focus, 2.0, 6.0),
		"disabled": create_stylebox_flat(COLORS.background, COLORS.border, 1.0, 6.0),
	}

static func create_panel_style() -> StyleBoxFlat:
	return create_stylebox_flat(COLORS.panel, COLORS.border, 1.0, 8.0)

static func create_input_style() -> Dictionary:
	return {
		"normal": create_stylebox_flat(COLORS.background, COLORS.border, 1.0, 4.0),
		"focus": create_stylebox_flat(COLORS.background, COLORS.border_focus, 2.0, 4.0),
	}

static func apply_button_theme(button: Button) -> void:
	var style := create_button_style()
	button.add_theme_stylebox_override("normal", style.normal)
	button.add_theme_stylebox_override("hover", style.hover)
	button.add_theme_stylebox_override("pressed", style.pressed)
	button.add_theme_stylebox_override("focus", style.focus)
	button.add_theme_stylebox_override("disabled", style.disabled)
	button.add_theme_color_override("font_color", COLORS.text_primary)
	button.add_theme_color_override("font_hover_color", COLORS.text_primary)
	button.add_theme_color_override("font_pressed_color", COLORS.text_primary)
	button.add_theme_color_override("font_disabled_color", COLORS.text_disabled)
	button.add_theme_font_size_override("font_size", 18)

static func apply_panel_theme(panel: Panel) -> void:
	panel.add_theme_stylebox_override("panel", create_panel_style())

static func apply_label_theme(label: Label, size: int = 16, color: Color = COLORS.text_primary) -> void:
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
