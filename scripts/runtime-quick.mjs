#!/usr/bin/env node
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EditorBridge } from '../dist/editor-bridge.js';
import { detectGodotPath, isPortInUse, releaseStaleGessoServerOnPort } from '../dist/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectPath =
  process.env.GESSO_PROJECT_ROOT ?? join(__dirname, '..', '..', 'test_project');
const PORT = process.env.GESSO_PORT ? parseInt(process.env.GESSO_PORT, 10) : 6505;

const STEPS = [
  ['game_key_press', { action: 'ui_right', pressed: true }],
  ['game_key_press', { action: 'ui_right', pressed: false }],
  ['game_key_press', { action: 'jump' }],
  ['game_screenshot', {}],
  ['query_runtime_node', { node_path: '/root/world/Player', properties: ['global_position'] }],
];

const SPAWN = process.env.GESSO_SPAWN_GODOT !== '0';

async function waitFor(fn, ms = 30000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 80));
  }
}

async function main() {
  if (await isPortInUse(PORT)) await releaseStaleGessoServerOnPort(PORT);
  const bridge = new EditorBridge(PORT, 12000);
  await bridge.start();
  console.log(`Bridge on ${PORT}, waiting for runtime…`);

  let godot = null;
  if (SPAWN) {
    const godotPath =
      process.env.GODOT_PATH ?? (await detectGodotPath(projectPath));
    if (!godotPath) throw new Error('GODOT_PATH not set');
    godot = spawn(godotPath, [
      '--path',
      projectPath,
      `--mcp-port=${PORT}`,
      'res://scenes/world.tscn',
    ]);
    godot.stderr?.on('data', (d) => process.stderr.write(d));
    console.log('Spawned Godot playing world.tscn');
  }

  await waitFor(() => bridge.isRuntimeConnected());
  console.log('Runtime connected.');

  for (const [name, args] of STEPS) {
    try {
      const res = await bridge.invokeRuntimeTool(name, args);
      if (name === 'game_screenshot') {
        const b64 = res?.image_base64 ?? res?.base64 ?? res?.data;
        if (b64) {
          const out = join(projectPath, '.gesso-runtime-screenshot.png');
          writeFileSync(out, Buffer.from(b64, 'base64'));
          console.log(`OK ${name} -> ${out}`);
        } else {
          console.log(`OK ${name}:`, JSON.stringify(res).slice(0, 200));
        }
      } else {
        console.log(`OK ${name}:`, JSON.stringify(res).slice(0, 300));
      }
    } catch (e) {
      console.error(`FAIL ${name}:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (godot) godot.kill();
  bridge.stop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
