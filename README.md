# G-MCP: Model Context Protocol Server for Godot 4.x

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.25.2-blue)](https://modelcontextprotocol.io)
[![Godot Engine](https://img.shields.io/badge/Godot-4.x-green.svg)](https://godotengine.org)

**G-MCP** is a Model Context Protocol (MCP) server that integrates directly with the **Godot 4.x Engine**, empowering AI coding agents (like Claude Desktop, Cursor, or custom agents) with unparalleled capabilities for **runtime debugging**, visual game inspections, automated playtesting, input emulation, and workspace management.

With G-MCP, an AI agent can build features, inspect live scenes, execute GDScript expressions on a running game, take screenshots to visually confirm layouts, dispatch keyboard/mouse input, and debug errors dynamically in real-time.

---

## 🚀 Key Features & Capabilities

* **🧠 Runtime Debugging & Introspection:** Inspect the running scene tree, read or modify live node properties, invoke methods, connect or disconnect signals, serialize state, and monitor performance.
* **🎮 Input Emulation & Automated Playtesting:** Synthesize keyboard, mouse, gamepad, and touch events (including scroll and drag) or run scripted input sequences. Use this to drive gameplay automation and testing.
* **⚡ Dynamic GDScript Execution (`eval`):** Write and run arbitrary GDScript snippets on the running game instance dynamically, and retrieve the returned results.
* **📸 Visual Agent Vision:** Capture screenshots of the running game window, the Godot editor, or the full desktop monitor, returning base64 images directly to your agent's vision pipeline.
* **🛠️ Scene & Resource Editing:** Create/read scene files (`.tscn`), add/remove/rename/reparent nodes, instance PackedScenes, update node groups, and query the Godot `ClassDB` API.
* **📂 Filesystem & Workspace Mapping:** Map project directories, read/edit scripts, validate script syntax, and rescan the Godot filesystem from the server.
* **🌐 Web Asset Integration:** Search and download game assets directly from Kenney.nl, OpenGameArt, itch.io, and auto-extract ZIP archives into your project.

---

## 🏗️ Architecture & Dual-Execution Modes

G-MCP operates as a **hybrid server** to provide maximum reliability, whether the game is actively running, open in the editor, or closed:

```mermaid
graph TD
    Agent[AI Agent / MCP Client] -->|Stdio| Server[G-MCP Server]
    
    subgraph Live Mode (Connected)
        Server -->|WebSocket port 6505| Editor[Godot Editor Plugin]
        Server -->|WebSocket port 6505| Runtime[Game Session Autoload]
        Editor -->|Bridge| Runtime
    end
    
    subgraph Headless Fallback Mode
        Server -->|Godot CLI Executable| Headless[Headless GDScript Runner]
    end
```

1. **Live/Active Mode (WebSocket Bridge):** 
   When the Godot Editor is open with the G-MCP plugin enabled, or the game is running, the server connects over a local WebSocket (**port 6505**). This allows the agent to communicate *instantly* with the editor and live game session (required for runtime debugging, screen capture, and input dispatch).
2. **Headless Fallback Mode (CLI execution):** 
   If the editor is closed, the server automatically falls back to invoking Godot in headless CLI mode (`--headless`) using the included `gesso_headless_runner.gd` script. Filesystem, scene-tree generation, and resource tools still work seamlessly.

---

## 📋 Compatibility & Requirements

* **Godot Engine:** Godot 4.0 - 4.3+ (Core compatibility optimized for Godot 4.x).
* **MCP Clients:** Fully compatible with Claude Desktop, Cursor, VS Code, and any system supporting the Model Context Protocol.
* **Runtime Environments:** Node.js v18 or later.
* **Operating Systems:** Windows (Powershell/Cmd), macOS, and Linux.

---

## 🛠️ Installation & Setup

### 1. Build the G-MCP Server
Clone the repository and install dependencies, then build the TypeScript compiler:
```bash
cd g-mcp
npm install
npm run build
```
This generates compiled JavaScript under `dist/` and copies necessary GDScript runners to `dist/scripts/`.

### 2. Configure the MCP Client

#### Claude Desktop
Add G-MCP to your configuration file (Windows: `%APPDATA%\Claude\claude_desktop_config.json`, macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "g-mcp-server": {
      "command": "node",
      "args": ["C:/Users/chibu/OneDrive/Documents/Gesso/g-mcp/dist/index.js"],
      "env": {
        "GESSO_PORT": "6505",
        "GESSO_LOG_LEVEL": "warn"
      }
    }
  }
}
```

> [!TIP]
> **Port Customization:** You can change the WebSocket bridge port by setting the `GESSO_PORT` environment variable.
> **Log Verbosity:** Change `GESSO_LOG_LEVEL` to `debug`, `info`, `warn`, or `error` depending on your debugging requirements.

#### Cursor (grouped servers — recommended)

Cursor exposes only ~**40 MCP tools** per chat. G-MCP registers ~200 tools, so use the **router + groups** layout:

```bash
cd g-mcp
npm run build
npm run mcp:cursor          # writes ../.cursor/mcp.json (router + workspace/scenes/editor)
npm run mcp:cursor:all      # also writes ../.cursor/mcp.gesso-all-groups.json
```

| Server | Role |
|--------|------|
| **`gesso-router`** | 4 tools: `list_gesso_tool_groups`, `list_gesso_group_tools`, `call_gesso_tool`, `get_godot_status` |
| **`gesso-workspace`** | Files, scripts, project settings (~16 tools) |
| **`gesso-scenes`** | Scene tree & assets (~31 tools) |
| **`gesso-editor`** | Editor play mode, captures, logs (~23 tools) |
| **`gesso-playtest_*`**, **`gesso-deploy`**, etc. | In `mcp.gesso-all-groups.json` — enable one at a time in MCP settings |

**Usage:** Keep **`gesso-router` enabled**. Ask the model to call `list_gesso_tool_groups`, pick a group, then either `call_gesso_tool` or enable the matching `gesso-<group>` server for direct tools. **Do not enable all group servers at once** (you will exceed the 40-tool cap).

All group servers share one **bridge daemon** (`GESSO_CTRL_CLIENT=1`) on port 6506 — no duplicate WebSocket bridges.

#### Cursor (single monolithic server — legacy)

1. Go to **Cursor Settings** > **Features** > **MCP**.
2. Add a server with **Command:** `node .../g-mcp/dist/index.js` (no `GESSO_TOOL_GROUP`).
3. Disable unused tools manually in the MCP UI (required for ~200 tools).

---

## 🎮 Godot Project Integration (The Addon)

To access **live editor features** and **runtime debugging**, you must add the G-MCP Editor Addon and Autoload script to your Godot game project.

> [!IMPORTANT]
> The MCP server looks for `project.godot` to resolve paths. By default, it resolves to the folder where the server process is launched. You can set the target game project directory by defining the `GESSO_PROJECT_ROOT` environment variable in your MCP configuration.

### Installation Steps

1. **Copy the Addon:**
   Copy the `src/scripts/gesso_editor_addon` folder to your Godot project's `addons` directory and name the folder `godot_mcp`:
   ```
   [Your Game Project]/
   └── addons/
       └── godot_mcp/
           ├── plugin.cfg
           ├── plugin.gd
           ├── mcp_client.gd
           ├── tool_executor.gd
           ├── runtime/
           ├── tools/
           └── utils/
   ```

2. **Copy the Runtime Autoload:**
   Copy the `src/scripts/gesso_runtime_autoload.gd` file to `res://addons/godot_mcp/runtime/gesso_runtime.gd` inside your project.

3. **Enable the Plugin in Godot:**
   Open your project in the Godot Editor:
   - Go to **Project** > **Project Settings** > **Plugins**.
   - Find **Gesso MCP** and check **Enable**.
   
   *Enabling the plugin automatically registers the `MCPRuntime` autoload pointing to `res://addons/godot_mcp/runtime/gesso_runtime.gd`.*

---

## 🧰 Complete Tool Catalog

The G-MCP Server registers the following tools with the client:

### 1. Runtime Debugging & Control
These tools inspect and control the game while it is running. Most of these require play mode (`run_scene` with `wait_for_runtime=true` first).

| Tool Name | Description |
| :--- | :--- |
| `run_scene` | Launches a scene in the editor (optionally blocking until `MCPRuntime` connects). |
| `stop_scene` | Stops the currently running scene. |
| `get_runtime_status`| Status snapshot of the editor play state and `MCPRuntime` connection. |
| `is_playing` | Compatibility shim checking if a scene is currently running. |
| `query_runtime_node`| Read class details, groups, and properties (e.g. position, visibility) of a live Node. |
| `get_runtime_log` | Read runtime logs from the game's internal `MCPRuntime` ring buffer. |
| `capture_screen` | Captures a PNG of the game, editor, or desktop for agent vision (base64). |
| `take_screenshot` | Saves a PNG screenshot from the active game viewport. |
| `send_input` | Synthesizes an `InputEvent` (keys, mouse buttons, motion) in the active game. |
| `test_input_sequence`| Runs a scripted sequence of inputs (clicks, keys, mouse drags, waits). |
| `wait` | Sleeps the server-side thread to pause between inputs. |

### 2. Scene & Node Editing
Create, inspect, and modify scenes and their nodes.

| Tool Name | Description |
| :--- | :--- |
| `create_scene` | Generates a new `.tscn` file with a root node. |
| `read_scene` | Parses a `.tscn` file and dumps its hierarchy, node types, and properties. |
| `add_node` | Adds a child node (supporting basic types or PackedScene instances). |
| `remove_node` | Deletes a node from a scene. |
| `rename_node` | Renames a node. |
| `move_node` | Re-orders or reparents a node within the scene tree. |
| `modify_node_property`| Modifies a single node property inside a `.tscn` file. |
| `set_node_properties`| Modifies multiple node properties at once. |
| `attach_script` | Attaches a `.gd` script to a node. |
| `detach_script` | Detaches a script from a node. |
| `set_collision_shape`| Sets collision bounds (Circle, Rectangle, Capsule) on a CollisionObject. |
| `set_sprite_texture`| Assigns a texture file to a `Sprite2D` or `TextureRect`. |
| `instance_scene` | Instances a PackedScene inside another scene. |
| `set_mesh` | Sets a mesh on a `MeshInstance3D`. |
| `set_material` | Assigns a Material to a mesh. |
| `get_node_spatial_info`| Reads transforms (position, rotation, scale) for 2D/3D nodes. |
| `measure_node_distance`| Measures spatial distance between two nodes. |
| `snap_node_to_grid`| Snaps a node position to a grid increment. |
| `get_node_groups` | Returns a node's group memberships. |
| `set_node_groups` | Configures the group list for a node. |
| `find_nodes_in_group`| Locates all nodes registered to a specific group. |

### 3. Resource & Signal Routing
Manipulate resources and connect event signals.

| Tool Name | Description |
| :--- | :--- |
| `get_resource_info` | Dumps details (properties, types, scripts) from a resource (`.tres`, `.res`). |
| `set_resource_property`| Modifies a property on a resource. |
| `save_resource_to_file`| Saves a resource to disk. |
| `list_signal_connections`| Lists connections (signals, targets, flags) for a Node. |
| `connect_signal` | Connects a signal to a method on another Node. |
| `disconnect_signal`| Breaks a signal connection. |

### 4. Project & Settings Management
Configure project parameters and query metadata.

| Tool Name | Description |
| :--- | :--- |
| `get_project_settings`| Concise summary of project settings (scenes, window sizes, physics). |
| `list_settings` | Browse and filter settings from ProjectSettings. |
| `update_project_settings`| Sets settings (values, graphics, etc.) inside `project.godot`. |
| `get_input_map` | Returns defined input actions and their key/axis mappings. |
| `configure_input_map`| Adds, removes, or modifies input actions and mappings.|
| `get_collision_layers`| Returns the 2D/3D physics collision layer names. |
| `list_viewport_presets`| Lists common 2D PC indie resolution presets. |
| `configure_game_viewport`| Configures standard viewport sizing, scaling, and window properties. |
| `classdb_query` | Explores class hierarchy, methods, and properties from Godot's `ClassDB`. |
| `rescan_filesystem`| Tells the editor to rescan directory changes. |
| `setup_autoload` | Adds, removes, or lists autoload singletons. |
| `map_project` | Builds a complete architectural map of script references and scenes. |

### 5. File & Asset Tools
Basic directory navigation and asset acquisition.

| Tool Name | Description |
| :--- | :--- |
| `list_dir` | Lists directories and files inside `res://`. |
| `read_file` | Reads lines of a file (highly optimized node-based). |
| `create_folder` | Creates directories recursively. |
| `delete_file` | Deletes a file (with optional backup). |
| `rename_file` | Renames or moves a file. |
| `search_assets` | Queries OpenGameArt, Kenney, itch.io, and PolyHaven for assets. |
| `inspect_asset_page`| Scrapes asset downloads and licenses from a URL. |
| `download_asset` | Downloads an asset URL and optionally auto-extracts ZIP archives. |

### 6. Script Editing & Visualizer
Validate scripts and access visualizer hooks.

| Tool Name | Description |
| :--- | :--- |
| `create_script` | Generates a new script file with boilerplate code. |
| `edit_script` | Performs regex modifications on script files. |
| `list_scripts` | Lists all `.gd` script files in the project. |
| `validate_script` | Validates syntax of a GDScript file. |
| `open_in_godot` | Opens a file in the Godot Editor. |
| `scene_tree_dump` | Dumps the scene tree of the active editor tab. |
| `get_console_log` | Retrieves lines from the Godot editor output log. |
| `get_errors` | Retrieves errors/warnings from the debugger output. |
| `clear_console_log`| Marks a cursor in the output log to ignore older prints. |
| `generate_2d_asset`| Utility hook for asset generation pipelines. |

---

## 🔍 Troubleshooting

### WebSocket Port Conflicts (EADDRINUSE)
If you start the MCP server and receive a port conflict warning:
* The server automatically detects stale processes from previous sessions on port 6505 (on Windows) and attempts to release them.
* If a conflict persists, verify that no other game or editor session is running on port 6505.
* You can change the bridge port by setting the `GESSO_PORT` environment variable in your client configuration, and adding `--mcp-port=[PORT]` to your Godot command line arguments.

### Godot Executable Not Found
If headless tools fail with an error indicating Godot cannot be found:
* Ensure Godot is added to your environment `PATH`.
* Alternatively, set the `GODOT_PATH` environment variable in your MCP configuration to point directly to your Godot 4 console executable (e.g. `C:\Program Files\Godot\Godot_v4.3-stable_win64_console.exe`).

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
