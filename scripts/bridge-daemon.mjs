#!/usr/bin/env node
/**
 * Persistent Gesso bridge + TCP control server for call-tool.mjs (single session).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ensureBridgeStarted,
  handleToolCall,
  editorBridge,
  PROJECT_ROOT,
  WEBSOCKET_PORT,
  SERVER_VERSION,
} from '../dist/index.js';
import { startControlServer, DEFAULT_CTRL_PORT } from '../dist/bridge-control.js';
import { detectGodotPath, gessoLog } from '../dist/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CTRL_PORT = parseInt(process.env.GESSO_CTRL_PORT ?? String(DEFAULT_CTRL_PORT), 10);
const STATE_DIR = join(PROJECT_ROOT, '.gesso');

function writeState() {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(
    join(STATE_DIR, 'bridge-daemon.json'),
    JSON.stringify(
      {
        pid: process.pid,
        websocket_port: WEBSOCKET_PORT,
        control_port: CTRL_PORT,
        project_root: PROJECT_ROOT,
        started_at: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

async function dispatch(tool, args) {
  if (tool === 'get_godot_status') {
    const status = editorBridge.getStatus();
    const live = status.connected || status.runtimeConnected;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              connected: status.connected,
              runtime_connected: status.runtimeConnected,
              server_version: SERVER_VERSION,
              websocket_port: WEBSOCKET_PORT,
              control_port: CTRL_PORT,
              mode: live ? 'live' : 'headless_fallback',
              project_path: status.projectPath || PROJECT_ROOT,
              connected_at: status.connectedAt?.toISOString() ?? null,
              pending_requests: status.pendingRequests,
              daemon: true,
            },
            null,
            2
          ),
        },
      ],
    };
  }
  return handleToolCall(tool, args);
}

async function main() {
  const godotPath = await detectGodotPath(PROJECT_ROOT);
  if (godotPath) {
    gessoLog('info', 'gesso-bridge-daemon', `Godot: ${godotPath}`);
  }

  await ensureBridgeStarted({ releaseStale: true });

  const server = startControlServer(CTRL_PORT, async (tool, args) => dispatch(tool, args));
  writeState();

  gessoLog(
    'info',
    'gesso-bridge-daemon',
    `Ready — WebSocket ${WEBSOCKET_PORT}, control ${CTRL_PORT}, project ${PROJECT_ROOT}`
  );

  const shutdown = () => {
    server.close();
    editorBridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
