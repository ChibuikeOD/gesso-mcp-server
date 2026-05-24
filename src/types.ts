/**
 * Type definitions for the Gesso MCP Server
 */

// Tool definition for MCP
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, PropertySchema>;
    required?: string[];
  };
}

export interface PropertySchema {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: string[];
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  oneOf?: PropertySchema[];
}

// WebSocket message types for hybrid communication
export interface ToolInvokeMessage {
  type: 'tool_invoke';
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResultMessage {
  type: 'tool_result';
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
}

export interface GodotReadyMessage {
  type: 'godot_ready';
  project_path: string;
  role?: 'editor' | 'runtime';
  started_at?: number;
}

export interface ClientStatusMessage {
  type: 'client_status';
  count: number;
}

export interface RuntimeStatusMessage {
  type: 'runtime_status';
  connected: boolean;
}

export type WebSocketMessage =
  | ToolInvokeMessage
  | ToolResultMessage
  | PingMessage
  | PongMessage
  | GodotReadyMessage
  | ClientStatusMessage
  | RuntimeStatusMessage;
