#!/usr/bin/env node
/**
 * Run multiple Gesso runtime tools in one bridge session (avoids port churn from call-tool.mjs).
 */
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EditorBridge } from '../dist/editor-bridge.js';
import { detectGodotPath, reserveEphemeralPort, isPortInUse, releaseStaleGessoServerOnPort } from '../dist/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectPath =
  process.env.GESSO_PROJECT_ROOT ?? join(__dirname, '..', '..', 'test_project');

const USE_PORT = process.env.GESSO_PORT ? parseInt(process.env.GESSO_PORT, 10) : 6505;
const SPAWN_GODOT = process.env.GESSO_SPAWN_GODOT !== '0';

async function waitFor(fn, timeoutMs = 20000, intervalMs = 100) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function tryTool(bridge, name, args) {
  try {
    const res = await bridge.invokeRuntimeTool(name, args);
    const text = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
    const preview = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
    console.log(`\n=== OK: ${name} ===\n${preview}`);
    return { ok: true, res };
  } catch (err) {
    console.error(`\n=== FAIL: ${name} ===\n${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function main() {
  const godotPath =
    process.env.GODOT_PATH ??
    (await detectGodotPath(projectPath));
  if (!godotPath) {
    console.error('Godot not found. Set GODOT_PATH.');
    process.exit(1);
  }

  if (await isPortInUse(USE_PORT)) {
    await releaseStaleGessoServerOnPort(USE_PORT);
  }

  const bridge = new EditorBridge(USE_PORT, 45000);
  await bridge.start();
  console.log(`Bridge listening on ${USE_PORT}, project: ${projectPath}`);

  let godot = null;
  if (SPAWN_GODOT) {
    godot = spawn(
      godotPath,
      ['--path', projectPath, `--mcp-port=${USE_PORT}`],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    godot.stdout?.on('data', (d) => process.stderr.write(d));
    godot.stderr?.on('data', (d) => process.stderr.write(d));
    console.log('Spawned Godot with --mcp-port (close window or Ctrl+C when done).');
  } else {
    console.log('Waiting for existing editor/runtime to connect (GESSO_SPAWN_GODOT=0)…');
  }

  try {
    await waitFor(() => bridge.isRuntimeConnected(), 25000);
    const status = bridge.getStatus();
    console.log(
      `Connected — editor: ${status.connected}, runtime: ${status.runtimeConnected}`
    );

    await tryTool(bridge, 'game_get_scene_tree', {});
    await tryTool(bridge, 'query_runtime_node', {
      node_path: '/root/world/Player',
      properties: ['position', 'global_position', 'velocity'],
    });
    await tryTool(bridge, 'game_eval', {
      code: 'return get_tree().get_nodes_in_group("player").size()',
    });
    await tryTool(bridge, 'game_eval', {
      code:
        'var n = 0\nfor c in get_tree().root.find_child("Decorations", true, false).get_children():\n  if c is Area2D: n += 1\nreturn n',
    });

    await tryTool(bridge, 'game_input_sequence', {
      steps: [
        { type: 'wait', wait_ms: 500 },
        { type: 'key_press', action: 'ui_right' },
        { type: 'wait', wait_ms: 400 },
        { type: 'key_press', action: 'jump' },
        { type: 'wait', wait_ms: 800 },
        { type: 'key_release', action: 'ui_right' },
      ],
      stopOnError: false,
    });

    await waitFor(() => true, 300);

    const shot = await tryTool(bridge, 'game_screenshot', {});
    if (shot.ok && shot.res?.image_base64) {
      const out = join(projectPath, '.gesso-runtime-screenshot.png');
      writeFileSync(out, Buffer.from(shot.res.image_base64, 'base64'));
      console.log(`\nScreenshot saved: ${out}`);
    } else if (shot.ok && shot.res?.path) {
      console.log(`\nScreenshot path: ${shot.res.path}`);
    }

    await tryTool(bridge, 'query_runtime_node', {
      node_path: '/root/world/Player',
      properties: ['position', 'global_position'],
    });

    const fails = 0;
    process.exit(fails);
  } catch (err) {
    console.error('Session failed:', err.message);
    process.exit(1);
  } finally {
    if (godot) godot.kill();
    bridge.stop();
  }
}

main();
