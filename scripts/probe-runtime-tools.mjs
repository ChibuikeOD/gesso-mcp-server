/**
 * Live probe: start bridge, spawn headless Godot, invoke game_* tools (same path as MCP server).
 */
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EditorBridge } from '../dist/editor-bridge.js';
import { detectGodotPath, reserveEphemeralPort } from '../dist/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..', '..');
const projectPath = join(workspaceRoot, 'test_project');

const tests = [
  { name: 'game_os_info', args: {} },
  { name: 'game_render_settings', args: { action: 'get' } },
  { name: 'game_locale', args: { action: 'get' } },
  { name: 'game_resource', args: { action: 'exists', path: 'res://icon.png' } },
  { name: 'game_get_scene_tree', args: {} },
  { name: 'game_visual_shader', args: { action: 'create', shaderType: 'spatial' } },
  {
    name: 'game_terrain',
    args: {
      action: 'create',
      parentPath: '/root',
      width: 4,
      depth: 4,
      heightData: Array(25).fill(0),
    },
  },
  { name: 'game_video', args: { action: 'create', parentPath: '/root', name: 'ProbeVideo' } },
];

async function waitForRuntime(bridge, timeoutMs = 15000) {
  const start = Date.now();
  while (!bridge.isRuntimeConnected()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout waiting for GessoRuntime');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function main() {
  const godotPath = await detectGodotPath(workspaceRoot);
  if (!godotPath) {
    console.error('FAIL: Godot not found');
    process.exit(1);
  }

  const port = await reserveEphemeralPort();
  const bridge = new EditorBridge(port, 30000);
  await bridge.start();

  const godot = spawn(godotPath, ['--headless', '--path', projectPath, `--mcp-port=${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  godot.stdout?.on('data', (d) => { logs += d.toString(); });
  godot.stderr?.on('data', (d) => { logs += d.toString(); });

  try {
    await waitForRuntime(bridge);
    console.log(`OK: runtime connected on port ${port}`);

    let failed = 0;
    for (const t of tests) {
      try {
        const res = await bridge.invokeRuntimeTool(t.name, t.args);
        const preview = JSON.stringify(res).slice(0, 120);
        console.log(`OK  ${t.name}: ${preview}${preview.length >= 120 ? '…' : ''}`);
      } catch (err) {
        failed += 1;
        console.error(`FAIL ${t.name}: ${err.message}`);
      }
    }

    // game_video get_status follow-up
    try {
      const created = await bridge.invokeRuntimeTool('game_video', {
        action: 'create',
        parentPath: '/root',
        name: 'ProbeVideo2',
      });
      const status = await bridge.invokeRuntimeTool('game_video', {
        action: 'get_status',
        nodePath: created.path,
      });
      console.log(`OK  game_video get_status: playing=${status.playing}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL game_video get_status: ${err.message}`);
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('FAIL:', err.message);
    if (logs) console.error('Godot logs:\n', logs);
    process.exit(1);
  } finally {
    godot.kill();
    bridge.stop();
  }
}

main();
