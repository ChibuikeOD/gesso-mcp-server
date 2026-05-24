extends Node
## Deprecated — use gesso_runtime.gd as the MCPRuntime autoload.
##
## Older Gesso builds registered this script and opened a second WebSocket with only
## five runtime tools. It is kept so existing project paths keep loading, but it no
## longer connects to the MCP server (avoids stealing the runtime slot from GessoRuntime).

func _ready() -> void:
	push_warning(
		"mcp_runtime.gd is deprecated. Set MCPRuntime autoload to res://addons/godot_mcp/runtime/gesso_runtime.gd"
	)
