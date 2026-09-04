class_name EraProfiles
extends RefCounted

# Era car profiles for Pitwall Dynasty
# Defines visual differences between racing eras

enum Era {
	ERA_1980,
	ERA_EARLY_1990,
	ERA_LATE_1990,
	ERA_2000_2008,
	ERA_2009_2013,
	ERA_2014_2018,
	ERA_2019_2021,
	ERA_2022_PLUS
}

const ERA_DATA := {
	Era.ERA_1980: {
		"id": "1980",
		"name": "1980s",
		"has_halo": false,
		"front_wing_scale": 0.7,
		"rear_wing_scale": 0.6,
		"nose_length": 1.2,
		"sidepod_width": 0.9,
		"cockpit_width": 0.8,
		"aero_complexity": 0.3,
		"wheelbase_scale": 1.0,
		"body_taper": 0.8
	},
	Era.ERA_EARLY_1990: {
		"id": "early1990",
		"name": "Early 1990s",
		"has_halo": false,
		"front_wing_scale": 0.8,
		"rear_wing_scale": 0.75,
		"nose_length": 1.1,
		"sidepod_width": 0.85,
		"cockpit_width": 0.75,
		"aero_complexity": 0.4,
		"wheelbase_scale": 1.02,
		"body_taper": 0.85
	},
	Era.ERA_LATE_1990: {
		"id": "late1990",
		"name": "Late 1990s",
		"has_halo": false,
		"front_wing_scale": 0.85,
		"rear_wing_scale": 0.8,
		"nose_length": 1.0,
		"sidepod_width": 0.8,
		"cockpit_width": 0.7,
		"aero_complexity": 0.5,
		"wheelbase_scale": 1.05,
		"body_taper": 0.9
	},
	Era.ERA_2000_2008: {
		"id": "2000",
		"name": "2000-2008",
		"has_halo": false,
		"front_wing_scale": 0.9,
		"rear_wing_scale": 0.85,
		"nose_length": 0.95,
		"sidepod_width": 0.75,
		"cockpit_width": 0.65,
		"aero_complexity": 0.6,
		"wheelbase_scale": 1.08,
		"body_taper": 0.95
	},
	Era.ERA_2009_2013: {
		"id": "2009",
		"name": "2009-2013",
		"has_halo": false,
		"front_wing_scale": 1.0,
		"rear_wing_scale": 0.7,
		"nose_length": 0.9,
		"sidepod_width": 0.7,
		"cockpit_width": 0.6,
		"aero_complexity": 0.7,
		"wheelbase_scale": 1.1,
		"body_taper": 1.0
	},
	Era.ERA_2014_2018: {
		"id": "2014",
		"name": "2014-2018",
		"has_halo": true,
		"front_wing_scale": 0.95,
		"rear_wing_scale": 0.9,
		"nose_length": 0.85,
		"sidepod_width": 0.8,
		"cockpit_width": 0.65,
		"aero_complexity": 0.8,
		"wheelbase_scale": 1.12,
		"body_taper": 1.0
	},
	Era.ERA_2019_2021: {
		"id": "2019",
		"name": "2019-2021",
		"has_halo": true,
		"front_wing_scale": 1.0,
		"rear_wing_scale": 0.95,
		"nose_length": 0.9,
		"sidepod_width": 0.85,
		"cockpit_width": 0.7,
		"aero_complexity": 0.9,
		"wheelbase_scale": 1.15,
		"body_taper": 1.0
	},
	Era.ERA_2022_PLUS: {
		"id": "2022",
		"name": "2022+",
		"has_halo": true,
		"front_wing_scale": 1.0,
		"rear_wing_scale": 1.0,
		"nose_length": 0.95,
		"sidepod_width": 0.9,
		"cockpit_width": 0.75,
		"aero_complexity": 1.0,
		"wheelbase_scale": 1.18,
		"body_taper": 1.0
	}
}

static func get_profile(era: int) -> Dictionary:
	return ERA_DATA.get(era, ERA_DATA[Era.ERA_2022_PLUS])

static func get_profile_by_year(year: int) -> Dictionary:
	if year < 1990:
		return ERA_DATA[Era.ERA_1980]
	elif year < 1995:
		return ERA_DATA[Era.ERA_EARLY_1990]
	elif year < 2000:
		return ERA_DATA[Era.ERA_LATE_1990]
	elif year < 2009:
		return ERA_DATA[Era.ERA_2000_2008]
	elif year < 2014:
		return ERA_DATA[Era.ERA_2009_2013]
	elif year < 2019:
		return ERA_DATA[Era.ERA_2014_2018]
	elif year < 2022:
		return ERA_DATA[Era.ERA_2019_2021]
	else:
		return ERA_DATA[Era.ERA_2022_PLUS]
