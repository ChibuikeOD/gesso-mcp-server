/**
 * Maps MCP `game_*` tool names to GessoRuntime WebSocket command names.
 */

/** Editor MCP runtime tools that use legacy names on the wire. */
export const LEGACY_RUNTIME_TOOL_ALIASES: Record<string, string> = {
  take_screenshot: 'screenshot',
  send_input: 'send_input',
  query_runtime_node: 'query_runtime_node',
  get_runtime_log: 'get_runtime_log',
  list_signal_connections: 'list_signals',
};

/** game_* tools whose runtime command differs from stripping the prefix. */
export const GAME_COMMAND_ALIASES: Record<string, string> = {
  game_get_ui: 'get_ui_elements',
  game_performance: 'get_performance',
  game_get_logs: 'get_logs',
};

export function isGameRuntimeTool(toolName: string): boolean {
  return toolName.startsWith('game_');
}

export function isRuntimeRoutedTool(toolName: string, args?: Record<string, unknown>): boolean {
  if (RUNTIME_EDITOR_TOOLS.has(toolName)) return true;
  if (isGameRuntimeTool(toolName)) return true;
  if (toolName === 'list_signal_connections' && args?.source === 'runtime') return true;
  if (toolName === 'capture_screen') {
    const target = String(args?.target ?? 'game').toLowerCase().trim();
    if (target === 'game' || target === 'runtime' || target === 'play' || target === 'debug') {
      return true;
    }
  }
  return false;
}

/** Tools the editor plugin documents as runtime-side (non game_*). */
const RUNTIME_EDITOR_TOOLS = new Set<string>([
  'take_screenshot',
  'send_input',
  'query_runtime_node',
  'get_runtime_log',
  'test_input_sequence',
]);

export function resolveRuntimeToolCommand(toolName: string): string {
  if (toolName === 'test_input_sequence') return 'input_sequence';
  if (toolName === 'capture_screen') return 'screenshot';
  if (GAME_COMMAND_ALIASES[toolName]) return GAME_COMMAND_ALIASES[toolName];
  if (LEGACY_RUNTIME_TOOL_ALIASES[toolName]) return LEGACY_RUNTIME_TOOL_ALIASES[toolName];
  if (toolName.startsWith('game_')) return toolName.slice(5);
  return toolName;
}

