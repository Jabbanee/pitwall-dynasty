class_name TrackGenerator
extends RefCounted

# Track generator for Pitwall Dynasty
# Generates circuit geometry from canonical circuit data
# Based on legacy TypeScript centerline generation algorithm

const DEFAULT_POINTS := 96

static func generate_centerline(circuit_data: Dictionary, points: int = DEFAULT_POINTS) -> PackedVector3Array:
	"""
	Generate a centerline from circuit data.
	"""
	var c = circuit_data.characteristics
	var base_radius: float = 200.0 + (100.0 - float(c.overtakingDifficulty)) * 1.4
	var squash: float = 0.65 + (float(c.brakingStress) / 200.0)
	var elevation_amplitude: float = float(circuit_data.get("elevationAmplitude", 15.0))
	
	var centerline := PackedVector3Array()
	var h: int = 2166136261
	
	# Seed the hash with circuit ID
	for ch in circuit_data.id:
		h = (h ^ (ch.unicode_at(0) * 16777619)) & 0xFFFFFFFF
	
	for i in range(points):
		var a: float = (float(i) / float(points)) * TAU
		
		# Random wobble
		h = (h * 1103515245 + 12345) & 0xFFFFFFFF
		var wobble: float = (((h >> 16) % 1000) / 1000.0 - 0.5) * 0.45 * (0.4 + float(c.overtakingDifficulty) / 200.0)
		
		var r: float = base_radius * (1.0 + wobble)
		var x: float = cos(a) * r
		var y: float = sin(a) * r * squash
		
		# Elevation using harmonics
		h = (h * 1103515245 + 12345) & 0xFFFFFFFF
		var noise: float = (((h >> 16) % 1000) / 1000.0 - 0.5) * elevation_amplitude * 0.15
		
		var z: float = sin(a * 2.0 + 0.5) * (elevation_amplitude * 0.6)
		z += sin(a * 5.0 + 1.7) * (elevation_amplitude * 0.25)
		z += noise
		
		centerline.append(Vector3(x, z, y))
	
	return centerline

static func get_pit_entry_exit(centerline: PackedVector3Array) -> Dictionary:
	var points := centerline.size()
	var quarter: int = points / 4
	return {
		"entry": centerline[quarter],
		"exit": centerline[quarter * 3],
		"straight_start": centerline[0],
		"straight_end": centerline[quarter]
	}
