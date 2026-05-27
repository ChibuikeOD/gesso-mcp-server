/**
 * Gesso tool groups for Cursor's ~40-tool MCP limit.
 * Each tool belongs to exactly one group. Use GESSO_TOOL_GROUP to expose a subset,
 * or use the gesso-router MCP server to discover groups and call any tool via the bridge daemon.
 */

import type { ToolDefinition } from './types.js';
import { allTools } from './tools/index.js';

export interface ToolGroupMeta {
  id: string;
  title: string;
  description: string;
  whenToUse: string;
}

export const TOOL_GROUP_META: ToolGroupMeta[] = [
  {
    id: 'workspace',
    title: 'Workspace & scripts',
    description: 'Project files, directories, GDScript editing, and project settings.',
    whenToUse: 'Reading or editing files, searching the project, creating scripts, or changing project.godot settings.',
  },
  {
    id: 'scenes',
    title: 'Scenes & assets',
    description: 'Scene tree editing, nodes, signals, resources, 2D assets, and project map.',
    whenToUse: 'Building or modifying .tscn scenes, nodes, materials, meshes, or importing/generating assets.',
  },
  {
    id: 'editor',
    title: 'Editor & play session',
    description: 'Run/stop scenes in the editor, editor screenshots, console, input map, ClassDB.',
    whenToUse: 'Play mode in the Godot editor, editor captures, logs, or editor-side debugging (not in-game automation).',
  },
  {
    id: 'playtest_input',
    title: 'Playtest — input & capture',
    description: 'In-game screenshots, clicks, keys, gamepad, pause, and performance probes.',
    whenToUse: 'The game must be running; automate player input or capture the game window.',
  },
  {
    id: 'playtest_inspect',
    title: 'Playtest — inspect & query',
    description: 'Read game state: nodes, properties, raycasts, pathfinding queries.',
    whenToUse: 'The game is running; inspect what exists without changing the scene tree.',
  },
  {
    id: 'playtest_scene',
    title: 'Playtest — scene control',
    description: 'Instantiate/remove nodes, change scenes, reparent while the game runs.',
    whenToUse: 'The game is running; spawn/despawn or switch scenes at runtime.',
  },
  {
    id: 'playtest_ui',
    title: 'Playtest — UI',
    description: 'Runtime UI nodes: buttons, labels, focus, themes.',
    whenToUse: 'The game is running; interact with or debug Control/UI nodes.',
  },
  {
    id: 'playtest_audio',
    title: 'Playtest — audio',
    description: 'Runtime audio buses, players, and sound control.',
    whenToUse: 'The game is running; trigger or inspect audio.',
  },
  {
    id: 'playtest_physics',
    title: 'Playtest — physics & world',
    description: 'Physics bodies, tilemaps, collisions at runtime.',
    whenToUse: 'The game is running; physics, tiles, or collision tweaks.',
  },
  {
    id: 'playtest_nodes_a',
    title: 'Playtest — nodes (A–M)',
    description: 'Runtime node/property/signal/animation tools (names starting A–M).',
    whenToUse: 'The game is running; mutate nodes (first half of alphabetized game_* tools).',
  },
  {
    id: 'playtest_nodes_b',
    title: 'Playtest — nodes (N–Z)',
    description: 'Runtime node/property/signal/shader tools (names starting N–Z).',
    whenToUse: 'The game is running; mutate nodes (second half of alphabetized game_* tools).',
  },
  {
    id: 'deploy',
    title: 'Export & deploy',
    description: 'Export presets, builds, itch.io, devices, web hosting, Vercel.',
    whenToUse: 'Shipping builds, stores, or CI-style export/deploy — not day-to-day scene editing.',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'gg-scale backend and V-JEPA vision helpers.',
    whenToUse: 'Optional external services; disable this group if you do not use them.',
  },
];

const WORKSPACE_TOOLS = new Set([
  'list_dir',
  'read_file',
  'search_project',
  'create_script',
  'edit_script',
  'validate_script',
  'create_folder',
  'delete_file',
  'rename_file',
  'list_scripts',
  'get_project_settings',
  'update_project_settings',
  'list_settings',
  'rescan_filesystem',
  'setup_autoload',
  'map_project',
]);

const SCENES_TOOLS = new Set([
  'create_scene',
  'read_scene',
  'add_node',
  'remove_node',
  'modify_node_property',
  'rename_node',
  'move_node',
  'attach_script',
  'detach_script',
  'set_collision_shape',
  'set_sprite_texture',
  'instance_scene',
  'set_mesh',
  'set_material',
  'get_node_spatial_info',
  'measure_node_distance',
  'snap_node_to_grid',
  'set_node_properties',
  'set_node_groups',
  'get_node_groups',
  'find_nodes_in_group',
  'set_resource_property',
  'save_resource_to_file',
  'get_resource_info',
  'list_signal_connections',
  'connect_signal',
  'disconnect_signal',
  'generate_2d_asset',
  'search_assets',
  'inspect_asset_page',
  'download_asset',
]);

const EDITOR_TOOLS = new Set([
  'get_input_map',
  'get_collision_layers',
  'get_node_properties',
  'get_console_log',
  'get_errors',
  'clear_console_log',
  'open_in_godot',
  'scene_tree_dump',
  'list_viewport_presets',
  'configure_game_viewport',
  'configure_input_map',
  'run_scene',
  'stop_scene',
  'is_playing',
  'get_runtime_status',
  'wait',
  'capture_screen',
  'take_screenshot',
  'test_input_sequence',
  'send_input',
  'query_runtime_node',
  'get_runtime_log',
  'classdb_query',
]);

const DEPLOY_TOOLS = new Set([
  'list_export_presets',
  'configure_export_preset',
  'export_game',
  'deploy_to_itch',
  'install_export_templates',
  'login_to_itch',
  'create_itch_game_page',
  'generate_android_keystore',
  'list_connected_devices',
  'deploy_to_device',
  'host_web_build',
  'deploy_to_vercel',
]);

const INTEGRATION_TOOLS = new Set([
  'ggscale_manage_server',
  'ggscale_bootstrap_tenant',
  'ggscale_configure_godot',
  'jepa_encode_frame',
  'jepa_scene_similarity',
  'jepa_imagine_next_state',
  'jepa_get_status',
  'jepa_save_baseline',
  'jepa_verify_scene',
  'jepa_run_playtest',
]);

function classifyRuntimeTool(name: string): string {
  if (/screenshot|click|mouse|key_|input_action|wait_frames|pause|performance|scroll|gamepad/.test(name)) {
    return 'playtest_input';
  }
  if (/^game_get_|^game_find_|^game_eval|^game_call|^game_is_|^game_has_|raycast|navigate_path/.test(name)) {
    return 'playtest_inspect';
  }
  if (/instantiate|remove|change_scene|create_|spawn|despawn|load_scene|reparent/.test(name)) {
    return 'playtest_scene';
  }
  if (/^game_ui_/.test(name)) return 'playtest_ui';
  if (/^game_audio_/.test(name)) return 'playtest_audio';
  if (/^game_physics_|collision|tilemap/.test(name)) return 'playtest_physics';
  const mid = name.slice('game_'.length);
  const first = mid.charAt(0).toLowerCase();
  if (first && first <= 'm') return 'playtest_nodes_a';
  return 'playtest_nodes_b';
}

export function resolveToolGroupId(toolName: string): string | null {
  if (WORKSPACE_TOOLS.has(toolName)) return 'workspace';
  if (SCENES_TOOLS.has(toolName)) return 'scenes';
  if (EDITOR_TOOLS.has(toolName)) return 'editor';
  if (DEPLOY_TOOLS.has(toolName)) return 'deploy';
  if (INTEGRATION_TOOLS.has(toolName)) return 'integrations';
  if (toolName.startsWith('game_')) return classifyRuntimeTool(toolName);
  return null;
}

const groupById = new Map<string, ToolDefinition[]>();

function buildGroupIndex(): void {
  if (groupById.size > 0) return;
  for (const meta of TOOL_GROUP_META) {
    groupById.set(meta.id, []);
  }
  const unassigned: string[] = [];
  for (const tool of allTools) {
    const gid = resolveToolGroupId(tool.name);
    if (!gid || !groupById.has(gid)) {
      unassigned.push(tool.name);
      continue;
    }
    groupById.get(gid)!.push(tool);
  }
  if (unassigned.length > 0) {
    const fallback = groupById.get('workspace')!;
    for (const name of unassigned) {
      const def = allTools.find((t) => t.name === name);
      if (def) fallback.push(def);
    }
  }
}

export function getToolsForGroup(groupId: string): ToolDefinition[] {
  buildGroupIndex();
  return groupById.get(groupId) ?? [];
}

export function getActiveToolGroupId(): string | null {
  const raw = process.env.GESSO_TOOL_GROUP?.trim();
  return raw || null;
}

export function getActiveTools(): ToolDefinition[] {
  const groupId = getActiveToolGroupId();
  if (!groupId) return allTools;
  return getToolsForGroup(groupId);
}

export function listGroupSummaries(): Array<ToolGroupMeta & { toolCount: number; tools: string[] }> {
  buildGroupIndex();
  return TOOL_GROUP_META.map((meta) => {
    const tools = groupById.get(meta.id) ?? [];
    return {
      ...meta,
      toolCount: tools.length,
      tools: tools.map((t) => t.name),
    };
  });
}

export function isValidGroupId(groupId: string): boolean {
  return TOOL_GROUP_META.some((m) => m.id === groupId);
}
