import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { detectGodotPath } from '../src/utils.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Workspace paths
const workspaceRoot = join(__dirname, '..', '..');
const projectPath = join(workspaceRoot, 'test_project');
const runnerScript = join(__dirname, '..', 'src', 'scripts', 'gesso_headless_runner.gd');

describe('Gesso MCP Headless Integration', () => {
  it('should detect Godot and run headless script validation', async () => {
    const godotPath = await detectGodotPath(workspaceRoot);
    if (!godotPath) {
      console.warn("Skipping integration test: Godot path not found.");
      return;
    }

    expect(existsSync(runnerScript)).toBe(true);
    expect(existsSync(projectPath)).toBe(true);

    // Call validate_script on test_project/player.gd
    const args = [
      '--headless',
      '--path',
      projectPath,
      '--script',
      runnerScript,
      'validate_script',
      JSON.stringify({ path: 'res://player.gd' }),
    ];

    const { stdout, stderr } = await execFileAsync(godotPath, args, { timeout: 15000 });
    
    expect(stderr).not.toContain('[ERROR]');

    // Verify output has JSON markers
    const startM = 'VALIDATION_JSON_START';
    const endM = 'VALIDATION_JSON_END';
    const startIdx = stdout.indexOf(startM);
    const endIdx = stdout.indexOf(endM);

    expect(startIdx).not.toBe(-1);
    expect(endIdx).not.toBe(-1);

    const jsonStr = stdout.substring(startIdx + startM.length, endIdx).trim();
    const parsed = JSON.parse(jsonStr);

    expect(parsed.path).toContain('player.gd');
    expect(parsed.valid).toBe(true);
    expect(parsed.error_code).toBe(0);
  });
});

import { EditorBridge } from '../src/editor-bridge.js';
import { WebSocket } from 'ws';

describe('Gesso MCP WebSocket Bridge', () => {
  it('should handle editor connection and route tool calls', async () => {
    // Use a non-default port to avoid conflicts
    const bridge = new EditorBridge(6506, 5000);
    await bridge.start();

    try {
      expect(bridge.isConnected()).toBe(false);

      // Create a mock client
      const ws = new WebSocket('ws://127.0.0.1:6506');
      
      const openPromise = new Promise<void>((resolve) => ws.once('open', resolve));
      await openPromise;

      // Send godot_ready
      ws.send(JSON.stringify({
        type: 'godot_ready',
        role: 'editor',
        project_path: 'res://'
      }));

      // Wait for editor bridge to recognize connection
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (bridge.isConnected()) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });

      expect(bridge.isConnected()).toBe(true);

      // Set up handler to respond to tool_invoke
      const resultPromise = new Promise<void>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'tool_invoke') {
            expect(msg.tool).toBe('some_tool');
            expect(msg.args).toEqual({ foo: 'bar' });
            
            // Send back success result
            ws.send(JSON.stringify({
              type: 'tool_result',
              id: msg.id,
              success: true,
              result: { success: true, message: 'hello from editor' }
            }));
            resolve();
          }
        });
      });

      const res = await bridge.invokeTool('some_tool', { foo: 'bar' });
      expect(res).toEqual({ success: true, message: 'hello from editor' });

      await resultPromise;

      ws.close();
    } finally {
      bridge.stop();
    }
  });

  it('should connect to Godot runtime and invoke runtime tools', async () => {
    const godotPath = await detectGodotPath(workspaceRoot);
    if (!godotPath) {
      console.warn("Skipping runtime integration test: Godot path not found.");
      return;
    }

    // Start EditorBridge on port 6507 (runtime URL connects here)
    const bridge = new EditorBridge(6507, 5000);
    await bridge.start();

    let childProcess: any = null;

    try {
      expect(bridge.isRuntimeConnected()).toBe(false);

      // Spawn Godot in headless mode running the game scene
      childProcess = spawn(godotPath, ['--headless', '--path', projectPath, '--mcp-port=6507'], {
        detached: false
      });

      // Buffer stdout/stderr for troubleshooting
      let outputLogs = '';
      childProcess.stdout.on('data', (data: Buffer) => {
        outputLogs += data.toString();
      });
      childProcess.stderr.on('data', (data: Buffer) => {
        outputLogs += data.toString();
      });

      // Wait for runtime connection (timeout after 15s)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for Godot runtime to connect. Logs:\n${outputLogs}`));
        }, 15000);

        const interval = setInterval(() => {
          if (bridge.isRuntimeConnected()) {
            clearTimeout(timeout);
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });

      expect(bridge.isRuntimeConnected()).toBe(true);

      // Invoke runtime tool (query_runtime_node on root node)
      const res = await bridge.invokeTool('query_runtime_node', {
        node_path: '/root'
      }) as any;

      expect(res.name).toBe('root');
      expect(res.class).toBe('Window'); // Godot 4 root scene tree node is a Window (formerly Viewport in Godot 3)
      expect(res.valid).toBe(true);

    } finally {
      if (childProcess) {
        childProcess.kill();
      }
      bridge.stop();
    }
  }, 20000);
});

