extends Node

signal connected()
signal disconnected()
signal snapshot_received(snapshot: Dictionary)
signal command_accepted(command_id: String)
signal command_rejected(command_id: String, reason: String)
signal error_occurred(error: String)

const STATE_DISCONNECTED := 0
const STATE_CONNECTING := 1
const STATE_CONNECTED := 2
const STATE_RECONNECTING := 3
const STATE_ERROR := 4

var state: int = STATE_DISCONNECTED
var session_token: String = ""
var server_url: String = "ws://localhost:8080"
var championship_id: String = ""
var team_id: String = ""

var _peer: WebSocketPeer = WebSocketPeer.new()
var _reconnect_attempts: int = 0
var _max_reconnect_attempts: int = 5
var _last_snapshot: Dictionary = {}

func connect_to_server(url: String = "") -> void:
	if url != "":
		server_url = url
	state = STATE_CONNECTING
	var err := _peer.connect_to_url(server_url)
	if err != OK:
		state = STATE_ERROR
		error_occurred.emit("Failed to initiate connection: %s" % error_string(err))

func disconnect_from_server() -> void:
	_peer.close()
	state = STATE_DISCONNECTED
	disconnected.emit()

func send_command(command: Dictionary) -> void:
	if state != STATE_CONNECTED:
		command_rejected.emit(command.get("id", ""), "Not connected")
		return
	command["session_token"] = session_token
	command["championship_id"] = championship_id
	command["team_id"] = team_id
	var payload := JSON.stringify(command)
	_peer.send(payload.to_utf8_buffer())

func request_reconnect() -> void:
	if session_token == "":
		error_occurred.emit("No session token for reconnect")
		return
	state = STATE_RECONNECTING
	_reconnect_attempts = 0
	_attempt_reconnect()

func _attempt_reconnect() -> void:
	if _reconnect_attempts >= _max_reconnect_attempts:
		state = STATE_ERROR
		error_occurred.emit("Max reconnect attempts reached")
		return
	_reconnect_attempts += 1
	var err := _peer.connect_to_url(server_url)
	if err != OK:
		var timer := get_tree().create_timer(2.0)
		timer.timeout.connect(_attempt_reconnect)

func _process(_delta: float) -> void:
	if state == STATE_DISCONNECTED:
		return
	_peer.poll()
	var peer_state := _peer.get_ready_state()
	if peer_state == WebSocketPeer.STATE_OPEN:
		if state != STATE_CONNECTED:
			state = STATE_CONNECTED
			connected.emit()
		_read_messages()
	elif peer_state == WebSocketPeer.STATE_CLOSED:
		var code := _peer.get_close_code()
		var reason := _peer.get_close_reason()
		if state == STATE_CONNECTED:
			state = STATE_DISCONNECTED
			disconnected.emit()
			if _reconnect_attempts < _max_reconnect_attempts:
				request_reconnect()

func _read_messages() -> void:
	while _peer.get_available_packet_count() > 0:
		var packet := _peer.get_packet()
		var text := packet.get_string_from_utf8()
		var json := JSON.new()
		var err := json.parse(text)
		if err != OK:
			continue
		var data: Dictionary = json.data
		_handle_message(data)

func _handle_message(data: Dictionary) -> void:
	var msg_type: String = data.get("type", "")
	if msg_type == "welcome":
		session_token = data.get("session_token", "")
	elif msg_type == "snapshot":
		_last_snapshot = data.get("snapshot", {})
		snapshot_received.emit(_last_snapshot)
	elif msg_type == "command_accepted":
		command_accepted.emit(data.get("command_id", ""))
	elif msg_type == "command_rejected":
		command_rejected.emit(data.get("command_id", ""), data.get("reason", ""))
	elif msg_type == "error":
		error_occurred.emit(data.get("message", "Unknown error"))

func get_last_snapshot() -> Dictionary:
	return _last_snapshot
