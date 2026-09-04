class_name PitSystem
extends Node3D

# Pit system for Pitwall Dynasty
# Manages pit lane, garages, crew, and service

enum PitPhase {
	READY,
	ENTRY,
	LANE,
	ARRIVAL,
	SERVICE,
	RELEASE,
	EXIT
}

var current_phase: int = PitPhase.READY
var service_progress: float = 0.0  # 0.0 to 1.0

@onready var pit_building: Node3D = $PitBuilding
@onready var pit_wall: Node3D = $PitWall
@onready var crew_container: Node3D = $Crew

var _cars_in_pit: Array = []
var _service_time: float = 3.0  # seconds for service

func setup() -> void:
	# Find pit components
	if not pit_building:
		pit_building = _create_pit_building()
	if not pit_wall:
		pit_wall = _create_pit_wall()
	if not crew_container:
		crew_container = _create_crew()

func _create_pit_building() -> Node3D:
	var building = Node3D.new()
	building.name = "PitBuilding"
	
	# Main building structure
	var main = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = Vector3(8, 3, 40)
	main.mesh = box
	main.position = Vector3(20, 1.5, 0)
	
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.3, 0.3, 0.35)
	mat.roughness = 0.7
	main.material_override = mat
	
	building.add_child(main)
	add_child(building)
	return building

func _create_pit_wall() -> Node3D:
	var wall = Node3D.new()
	wall.name = "PitWall"
	
	# Wall structure
	var wall_mesh = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = Vector3(0.5, 1.2, 40)
	wall_mesh.mesh = box
	wall_mesh.position = Vector3(16, 0.6, 0)
	
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.2, 0.2, 0.25)
	wall_mesh.material_override = mat
	
	wall.add_child(wall_mesh)
	add_child(wall)
	return wall

func _create_crew() -> Node3D:
	var crew = Node3D.new()
	crew.name = "Crew"
	
	# Create crew members at each garage
	for i in range(10):
		var member = _create_crew_member()
		member.position = Vector3(18, 0, -18 + i * 4)
		crew.add_child(member)
	
	add_child(crew)
	return crew

func _create_crew_member() -> Node3D:
	var member = Node3D.new()
	
	# Simple humanoid representation
	var body = MeshInstance3D.new()
	var capsule = CapsuleMesh.new()
	capsule.radius = 0.2
	capsule.height = 1.0
	body.mesh = capsule
	body.position = Vector3(0, 0.5, 0)
	
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.9, 0.2, 0.2)
	body.material_override = mat
	
	member.add_child(body)
	return member

func start_service(car_id: String) -> void:
	current_phase = PitPhase.SERVICE
	service_progress = 0.0
	_cars_in_pit.append(car_id)

func update_service(delta: float) -> void:
	if current_phase == PitPhase.SERVICE:
		service_progress += delta / _service_time
		if service_progress >= 1.0:
			service_progress = 1.0
			current_phase = PitPhase.RELEASE

func get_phase() -> int:
	return current_phase

func get_progress() -> float:
	return service_progress
