extends Node

# Viewport Capture System for Pitwall Dynasty
# Captures real rendered frames and saves as PNG
# Works in both editor and exported builds

var _capture_requested: bool = false
var _capture_path: String = ""
var _frame_count: int = 0
var _max_frames: int = 1
var _ready_frames: int = 0

func _ready() -> void:
	# Check for QA capture arguments
	var args := OS.get_cmdline_args()
	
	for i in range(args.size()):
		if args[i] == "--qa-capture" and i + 1 < args.size():
			_capture_path = args[i + 1]
		elif args[i] == "--qa-frames" and i + 1 < args.size():
			_max_frames = args[i + 1].to_int()
		elif args[i] == "--qa-request-capture":
			_capture_requested = true
	
	if _capture_path != "":
		print("[ViewportCapture] Capture path: ", _capture_path)
		print("[ViewportCapture] Max frames: ", _max_frames)
		# Wait a few frames for scene to settle
		await get_tree().create_timer(1.0).timeout
		_capture_frame()

func _process(_delta: float) -> void:
	if _capture_requested and _ready_frames < _max_frames:
		_ready_frames += 1
		if _ready_frames >= 3:  # Wait 3 frames for rendering to stabilize
			_capture_frame()
			_ready_frames = 0
			_capture_requested = false

func _capture_frame() -> void:
	# Wait for the frame to be rendered
	await RenderingServer.frame_post_draw
	
	# Get the viewport texture
	var viewport := get_viewport()
	if not viewport:
		print("[ViewportCapture] ERROR: No viewport")
		return
	
	var texture := viewport.get_texture()
	if not texture:
		print("[ViewportCapture] ERROR: No viewport texture")
		return
	
	var image := texture.get_image()
	if not image:
		print("[ViewportCapture] ERROR: Could not get image from viewport")
		return
	
	# Ensure directory exists
	var dir := DirAccess.make_dir_recursive_absolute(_capture_path.get_base_dir())
	
	# Save the image
	var filename := _capture_path.path_join("frame_%04d.png" % _frame_count)
	var err := image.save_png(filename)
	
	if err == OK:
		print("[ViewportCapture] Saved: ", filename, " (", image.get_width(), "x", image.get_height(), ")")
		_frame_count += 1
	else:
		print("[ViewportCapture] ERROR: Failed to save: ", filename, " error: ", err)

func request_capture(path: String, frames: int = 1) -> void:
	_capture_path = path
	_max_frames = frames
	_capture_requested = true
