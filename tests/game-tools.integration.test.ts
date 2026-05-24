/**
 * Live tests for game_* runtime tools against GessoRuntime autoload.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { EditorBridge } from '../src/editor-bridge.js';
import { detectGodotPath, reserveEphemeralPort } from '../src/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..', '..');
const projectPath = join(workspaceRoot, 'test_project');
const projectGodot = join(projectPath, 'project.godot');

const PLUGIN_SECTION = /\[editor_plugins\][\s\S]*?(?=\n\[)/;
const PLUGINS_DISABLED_BLOCK = `[editor_plugins]

enabled=PackedStringArray()

`;

async function waitForRuntime(bridge: EditorBridge, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (!bridge.isRuntimeConnected()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout waiting for GessoRuntime WebSocket connection');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('game_* runtime tools (GessoRuntime)', () => {
  let bridge: EditorBridge;
  let godot: ChildProcess | null = null;
  let originalProjectFile: string;
  let bridgePort = 0;

  beforeAll(async () => {
    const godotPath = await detectGodotPath(workspaceRoot);
    if (!godotPath) {
      console.warn('Skipping game tools test: Godot not found');
      return;
    }

    bridgePort = await reserveEphemeralPort();

    originalProjectFile = readFileSync(projectGodot, 'utf8');
    const patched = originalProjectFile.replace(PLUGIN_SECTION, PLUGINS_DISABLED_BLOCK);
    if (!patched.includes('gesso_runtime.gd')) {
      throw new Error('Project autoload must point at gesso_runtime.gd (MCPRuntime entry)');
    }
    writeFileSync(projectGodot, patched, 'utf8');

    bridge = new EditorBridge(bridgePort, 30000);
    await bridge.start();

    godot = spawn(godotPath, ['--headless', '--path', projectPath, `--mcp-port=${bridgePort}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForRuntime(bridge);
  }, 30000);

  afterAll(async () => {
    if (godot) {
      godot.kill();
      godot = null;
    }
    if (bridge) bridge.stop();
    if (originalProjectFile) {
      writeFileSync(projectGodot, originalProjectFile, 'utf8');
    }
  });

  async function invokeGameTool(toolName: string, args: Record<string, unknown> = {}) {
    if (!bridge?.isRuntimeConnected()) {
      throw new Error('GessoRuntime not connected');
    }
    return bridge.invokeRuntimeTool(toolName, args);
  }

  it('game_os_info returns platform metadata', async () => {
    if (!bridge?.isRuntimeConnected()) return;
    const res = (await invokeGameTool('game_os_info')) as Record<string, unknown>;
    expect(res.os_name).toBeTruthy();
    expect(res.processor_count).toBeGreaterThan(0);
  });

  it('game_render_settings get returns viewport settings', async () => {
    if (!bridge?.isRuntimeConnected()) return;
    const res = (await invokeGameTool('game_render_settings', { action: 'get' })) as Record<string, unknown>;
    expect(res).toHaveProperty('msaa_2d');
    expect(res).toHaveProperty('scaling_3d_scale');
  });

  it('game_locale get returns current locale', async () => {
    if (!bridge?.isRuntimeConnected()) return;
    const res = (await invokeGameTool('game_locale', { action: 'get' })) as Record<string, unknown>;
    expect(res.locale).toBeTruthy();
  });

  it('game_resource exists checks res://icon.png', async () => {
    if (!bridge?.isRuntimeConnected()) return;
    const res = (await invokeGameTool('game_resource', {
      action: 'exists',
      path: 'res://icon.png',
    })) as Record<string, unknown>;
    expect(res.exists).toBe(true);
  });

  it('game_get_scene_tree returns root children', async () => {
    if (!bridge?.isRuntimeConnected()) return;
    const res = (await invokeGameTool('game_get_scene_tree')) as Record<string, unknown>;
    expect(res).toHaveProperty('tree');
  });

  it('game_visual_shader create returns a shader id', async () => {
    if (!bridge?.isRuntimeConnected()) return;
    const res = (await invokeGameTool('game_visual_shader', {
      action: 'create',
      shaderType: 'spatial',
    })) as Record<string, unknown>;
    expect(res.shader_id).toBeGreaterThan(0);
  });

  it('game_terrain create spawns a MeshInstance3D', async () => {
    if (!bridge?.isRuntimeConnected()) return;
    const res = (await invokeGameTool('game_terrain', {
      action: 'create',
      parentPath: '/root',
      width: 4,
      depth: 4,
      heightData: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    })) as Record<string, unknown>;
    expect(res.path).toBeTruthy();
    expect(res.vertex_count).toBe(25);
  });

  it('game_video create and get_status on player', async () => {
    if (!bridge?.isRuntimeConnected()) return;
    const created = (await invokeGameTool('game_video', {
      action: 'create',
      parentPath: '/root',
      name: 'McpTestVideo',
    })) as Record<string, unknown>;
    expect(created.path).toBeTruthy();
    const status = (await invokeGameTool('game_video', {
      action: 'get_status',
      nodePath: created.path,
    })) as Record<string, unknown>;
    expect(status.playing).toBe(false);
  });
});
