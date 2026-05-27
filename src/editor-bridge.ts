import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type {
  ToolInvokeMessage,
  ToolResultMessage,
  WebSocketMessage,
} from './types.js';
import {
  isRuntimeRoutedTool,
  resolveRuntimeToolCommand,
} from './runtime-tool-routing.js';
import { convertCamelToSnakeCase, gessoLog, normalizeParameters } from './utils.js';

const DEFAULT_PORT = 6505;
const DEFAULT_TIMEOUT = 30000;
const PING_INTERVAL = 10000;

/** `ws` may pass an empty/absent Buffer for a normal close — avoid logging \"undefined\". */
function formatWsCloseReason(reason?: Buffer | string | null): string {
  if (reason == null) return '(none)';
  if (typeof reason === 'string') {
    const t = reason.trim();
    return t === '' ? '(none)' : t;
  }
  const utf8 = reason.toString('utf8').trim();
  return utf8 === '' ? '(none)' : utf8;
}

/** @deprecated Use isRuntimeRoutedTool — kept for existing imports/tests. */
export const RUNTIME_ONLY_TOOLS = new Set<string>([
  'take_screenshot',
  'send_input',
  'query_runtime_node',
  'get_runtime_log',
]);

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  toolName: string;
  startTime: number;
  target: 'editor' | 'runtime';
}

interface GodotInfo {
  projectPath?: string;
  connectedAt: Date;
  role: 'editor' | 'runtime';
}

type ConnectionCallback = (connected: boolean, info?: GodotInfo) => void;
type RuntimeStatusCallback = (connected: boolean) => void;

interface ConnSlot {
  ws: WebSocket;
  info: GodotInfo;
}

export class EditorBridge {
  private wss: WebSocketServer | null = null;
  private _listening = false;
  private editor: ConnSlot | null = null;
  private runtime: ConnSlot | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private runtimeStatusCallbacks: Set<RuntimeStatusCallback> = new Set();

  private port: number;
  private timeout: number;

  constructor(port: number = DEFAULT_PORT, timeout: number = DEFAULT_TIMEOUT) {
    this.port = port;
    this.timeout = timeout;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ host: '127.0.0.1', port: this.port });

        this.wss.on('connection', (ws) => this.handleConnection(ws));
        this.wss.on('error', (error) => {
          this.log('error', `WebSocket server error: ${error.message}`);
          reject(error);
        });
        this.wss.on('listening', () => {
          this._listening = true;
          this.log('info', `WebSocket server listening on port ${this.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): void {
    this._listening = false;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Server shutting down'));
    }
    this.pendingRequests.clear();

    this.editor?.ws.close();
    this.editor = null;
    this.runtime?.ws.close();
    this.runtime = null;

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.log('info', 'WebSocket server stopped');
  }

  routeIsRuntime(toolName: string, args: Record<string, unknown> | undefined): boolean {
    return isRuntimeRoutedTool(toolName, args);
  }

  private isSocketOpen(ws: WebSocket): boolean {
    return ws.readyState === WebSocket.OPEN;
  }

  /** Drop slot when the WebSocket is gone or no longer usable. */
  private clearSlotIfDead(slot: ConnSlot | null): ConnSlot | null {
    if (!slot) return null;
    if (this.isSocketOpen(slot.ws)) return slot;
    try {
      slot.ws.close();
    } catch {
      // ignore
    }
    return null;
  }

  private normalizeProjectPath(path?: string): string {
    return (path ?? '').replace(/\\/g, '/').toLowerCase();
  }

  private releaseRuntimeSlot(ws: WebSocket, code: number, reason: string): void {
    if (this.runtime?.ws !== ws) return;
    // 1006 is common when play mode stops; avoid warn on stderr (Cursor labels it as error).
    const level = code === 1000 || code === 1006 ? 'debug' : 'warn';
    this.log(level, `Runtime disconnected: ${code} — ${reason}`);
    this.runtime = null;
    this.failPending('runtime', new Error('Godot runtime disconnected'));
    this.sendRuntimeStatusToEditor();
    this.notifyRuntimeStatus(false);
  }

  private releaseEditorSlot(ws: WebSocket, code: number, reason: string): void {
    if (this.editor?.ws !== ws) return;
    const level = code === 1000 || code === 1006 ? 'debug' : 'warn';
    this.log(level, `Editor disconnected: ${code} — ${reason}`);
    this.editor = null;
    this.failPending('editor', new Error('Godot disconnected'));
    this.notifyConnectionChange(false);
    if (!this.runtime && this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Allow a new connection to take over when the existing slot is dead or the
   * same project restarted play (new WebSocket, old slot still registered).
   */
  private shouldReplaceSlot(
    existing: ConnSlot,
    incomingWs: WebSocket,
    incomingProjectPath?: string
  ): boolean {
    if (existing.ws === incomingWs) return false;
    if (!this.isSocketOpen(existing.ws)) return true;
    const a = this.normalizeProjectPath(existing.info.projectPath);
    const b = this.normalizeProjectPath(incomingProjectPath);
    return Boolean(a && b && a === b);
  }

  private handleConnection(ws: WebSocket): void {
    let assignedRole: 'editor' | 'runtime' | null = null;

    // Wait for godot_ready before assigning editor vs runtime (do not default to editor).

    ws.on('message', (data) => {
      let message: WebSocketMessage;
      try {
        message = JSON.parse(data.toString()) as WebSocketMessage;
      } catch (err) {
        this.log('error', `Failed to parse message: ${err}`);
        return;
      }

      if (message.type === 'godot_ready') {
        const desiredRole: 'editor' | 'runtime' = (message.role === 'runtime') ? 'runtime' : 'editor';

        if (desiredRole === 'runtime') {
          this.runtime = this.clearSlotIfDead(this.runtime);
          const existing = this.runtime;
          if (existing && existing.ws !== ws) {
            this.log('debug', 'Replacing prior runtime connection with new session');
            try {
              existing.ws.close(4001, 'Another runtime session connected');
            } catch {
              // ignore
            }
            this.runtime = null;
          }
          if (this.editor?.ws === ws) {
            this.editor = null;
            this.notifyConnectionChange(false);
          }
          this.runtime = { ws, info: { connectedAt: new Date(), projectPath: message.project_path, role: 'runtime' } };
          assignedRole = 'runtime';
          this.startPingLoop();
          this.log('debug', `Godot runtime connected (project=${message.project_path})`);
          this.sendRuntimeStatusToEditor();
          this.notifyRuntimeStatus(true);
          return;
        }

        this.editor = this.clearSlotIfDead(this.editor);
        const existingEditor = this.editor;
        if (existingEditor && existingEditor.ws !== ws) {
          this.log('debug', 'Replacing prior editor connection with new session');
          try {
            existingEditor.ws.close(4000, 'Another editor session connected');
          } catch {
            // ignore
          }
          this.editor = null;
        }
        if (!this.editor) {
          this.editor = { ws, info: { connectedAt: new Date(), projectPath: message.project_path, role: 'editor' } };
          assignedRole = 'editor';
          this.startPingLoop();
          this.notifyConnectionChange(true, this.editor.info);
        } else {
          this.editor.info.projectPath = message.project_path;
          assignedRole = 'editor';
        }
        this.log('debug', `Godot editor ready (project=${message.project_path})`);
        this.sendRuntimeStatusToEditor();
        this.sendClientStatus(1);
        return;
      }

      if (assignedRole === null) {
        this.log('warn', `Ignoring ${message.type} from client before godot_ready`);
        return;
      }

      this.handleMessage(message, assignedRole);
    });

    ws.on('close', (code, reason) => {
      const reasonText = formatWsCloseReason(reason);
      this.releaseEditorSlot(ws, code, reasonText);
      this.releaseRuntimeSlot(ws, code, reasonText);
    });

    ws.on('error', (error) => {
      this.log('error', `WebSocket error: ${error.message}`);
    });
  }

  private startPingLoop(): void {
    if (this.pingInterval) return;
    this.pingInterval = setInterval(() => {
      this.sendTo(this.editor?.ws, { type: 'ping' });
      this.sendTo(this.runtime?.ws, { type: 'ping' });
    }, PING_INTERVAL);
  }

  private failPending(target: 'editor' | 'runtime', err: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      if (pending.target === target) {
        clearTimeout(pending.timeout);
        pending.reject(err);
        this.pendingRequests.delete(id);
      }
    }
  }

  private handleMessage(message: WebSocketMessage, role: 'editor' | 'runtime'): void {
    switch (message.type) {
      case 'tool_result':
        this.handleToolResult(message);
        break;
      case 'pong':
        break;
      case 'godot_ready':
        break;
      default:
        this.log('warn', `Unknown message type from ${role}: ${(message as { type: string }).type}`);
    }
  }

  private handleToolResult(message: ToolResultMessage): void {
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      this.log('warn', `Received result for unknown request: ${message.id}`);
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(message.id);
    const duration = Date.now() - pending.startTime;
    this.log('debug', `Tool ${pending.toolName} completed in ${duration}ms (${pending.target})`);
    if (message.success) {
      pending.resolve(message.result);
    } else {
      const err = new Error(message.error || 'Tool execution failed') as Error & {
        details?: unknown;
      };
      if (message.result !== undefined && message.result !== null) {
        err.details = message.result;
      }
      pending.reject(err);
    }
  }

  /** Invoke a tool on the in-game runtime helper (bypasses editor routing). */
  async invokeRuntimeTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const wireName = resolveRuntimeToolCommand(toolName);
    const wireArgs = convertCamelToSnakeCase(normalizeParameters(args)) as Record<string, unknown>;
    return this.invokeToolOnTarget('runtime', wireName, wireArgs, toolName);
  }

  /** True when the editor plugin or the in-game runtime helper is connected. */
  isAvailable(): boolean {
    return this.isConnected() || this.isRuntimeConnected();
  }

  async invokeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const target: 'editor' | 'runtime' = this.routeIsRuntime(toolName, args) ? 'runtime' : 'editor';
    const wireName = target === 'runtime' ? resolveRuntimeToolCommand(toolName) : toolName;
    const wireArgs = convertCamelToSnakeCase(normalizeParameters(args)) as Record<string, unknown>;
    return this.invokeToolOnTarget(target, wireName, wireArgs, toolName);
  }

  private async invokeToolOnTarget(
    target: 'editor' | 'runtime',
    wireToolName: string,
    args: Record<string, unknown>,
    logToolName: string = wireToolName
  ): Promise<unknown> {
    const slot = target === 'editor' ? this.editor : this.runtime;
    if (!slot || slot.ws.readyState !== WebSocket.OPEN) {
      if (target === 'runtime') {
        throw new Error(
          `Runtime helper is not connected. Tool '${logToolName}' requires the game to be running with the GessoRuntime autoload registered. ` +
          `Call run_scene with wait_for_runtime=true first.`
        );
      }
      throw new Error('Godot Editor is not connected. Is the editor open and the plugin enabled?');
    }

    const id = randomUUID();
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Tool ${logToolName} timed out after ${this.timeout}ms (${target})`));
      }, this.timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout, toolName: logToolName, startTime, target });

      const message: ToolInvokeMessage = {
        type: 'tool_invoke',
        id,
        tool: wireToolName,
        args,
      };
      this.sendTo(slot.ws, message);
      this.log('debug', `Invoking tool: ${logToolName} -> ${wireToolName} (${id}) on ${target}`);
    });
  }

  sendClientStatus(count: number): void {
    this.sendTo(this.editor?.ws, { type: 'client_status', count });
  }

  private sendRuntimeStatusToEditor(): void {
    this.sendTo(this.editor?.ws, { type: 'runtime_status', connected: !!this.runtime });
  }

  private sendTo(ws: WebSocket | undefined, message: WebSocketMessage | ToolInvokeMessage): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  isListening(): boolean { return this._listening; }
  isConnected(): boolean { return this.editor?.ws.readyState === WebSocket.OPEN; }
  isRuntimeConnected(): boolean { return this.runtime?.ws.readyState === WebSocket.OPEN; }

  getStatus(): {
    connected: boolean;
    runtimeConnected: boolean;
    projectPath?: string;
    connectedAt?: Date;
    pendingRequests: number;
    port: number;
  } {
    return {
      connected: this.isConnected(),
      runtimeConnected: this.isRuntimeConnected(),
      projectPath: this.editor?.info.projectPath,
      connectedAt: this.editor?.info.connectedAt,
      pendingRequests: this.pendingRequests.size,
      port: this.port,
    };
  }

  onConnectionChange(callback: ConnectionCallback): void {
    this.connectionCallbacks.add(callback);
  }
  offConnectionChange(callback: ConnectionCallback): void {
    this.connectionCallbacks.delete(callback);
  }

  onRuntimeStatusChange(callback: RuntimeStatusCallback): void {
    this.runtimeStatusCallbacks.add(callback);
  }

  private notifyConnectionChange(connected: boolean, info?: GodotInfo): void {
    for (const cb of this.connectionCallbacks) {
      try { cb(connected, info); } catch (err) { this.log('error', `Connection callback error: ${err}`); }
    }
  }

  private notifyRuntimeStatus(connected: boolean): void {
    for (const cb of this.runtimeStatusCallbacks) {
      try { cb(connected); } catch (err) { this.log('error', `Runtime status callback error: ${err}`); }
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    gessoLog(level, 'GessoBridge', message);
  }
}

let defaultBridge: EditorBridge | null = null;
export function getDefaultBridge(): EditorBridge {
  if (!defaultBridge) defaultBridge = new EditorBridge();
  return defaultBridge;
}
export function createBridge(port?: number, timeout?: number): EditorBridge {
  return new EditorBridge(port, timeout);
}
