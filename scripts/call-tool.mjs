#!/usr/bin/env node
/**
 * Invoke a Gesso MCP tool via the persistent bridge daemon (default) or one-shot stdio MCP.
 *
 * Usage:
 *   node scripts/call-tool.mjs <toolName> [jsonArgs]
 *   node scripts/call-tool.mjs <toolName> @path/to/args.json
 *
 * Options (env or flags):
 *   --stdio              Spawn a one-shot MCP server (legacy; may disrupt port 6505)
 *   --no-daemon          Fail if bridge daemon is not already running
 *   --port <n>           WebSocket bridge port (GESSO_PORT)
 *   --ctrl-port <n>      Control plane port (GESSO_CTRL_PORT, default 6506)
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  invokeViaControl,
  pingControlServer,
  waitForControlServer,
  DEFAULT_CTRL_PORT,
} from '../dist/bridge-control.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseCli(argv) {
  const flags = { stdio: false, noDaemon: false, port: null, ctrlPort: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stdio') flags.stdio = true;
    else if (a === '--no-daemon') flags.noDaemon = true;
    else if (a === '--port') flags.port = argv[++i];
    else if (a === '--ctrl-port') flags.ctrlPort = argv[++i];
    else positional.push(a);
  }
  return { flags, positional };
}

async function invokeViaStdio(toolName, args, projectRoot, godotPath) {
  const serverEntry = join(__dirname, '..', 'dist', 'index.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverEntry],
    cwd: projectRoot,
    env: {
      ...process.env,
      GESSO_PROJECT_ROOT: projectRoot,
      GODOT_PATH: godotPath,
      ...(process.env.GESSO_PORT ? {} : {}),
    },
  });
  const client = new Client({ name: 'gesso-call-tool', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    return await client.callTool({ name: toolName, arguments: args });
  } finally {
    await client.close();
  }
}

async function ensureDaemon(projectRoot, bridgePort, ctrlPort) {
  if (await pingControlServer(ctrlPort, 800)) {
    return;
  }

  const daemonScript = join(__dirname, 'bridge-daemon.mjs');
  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: 'ignore',
    cwd: projectRoot,
    env: {
      ...process.env,
      GESSO_PROJECT_ROOT: projectRoot,
      GESSO_PORT: String(bridgePort),
      GESSO_CTRL_PORT: String(ctrlPort),
    },
  });
  child.unref();

  const ready = await waitForControlServer(ctrlPort, 20000);
  if (!ready) {
    throw new Error(
      `Bridge daemon did not start on control port ${ctrlPort}. ` +
        `Run manually: node scripts/bridge-daemon.mjs`
    );
  }
}

async function main() {
  const { flags, positional } = parseCli(process.argv.slice(2));
  const toolName = positional[0];
  let argsJson = positional[1] ?? '{}';

  if (!toolName) {
    console.error(
      'Usage: node scripts/call-tool.mjs [--stdio|--no-daemon] [--port N] [--ctrl-port N] <toolName> [jsonArgs|@file.json]'
    );
    process.exit(1);
  }

  if (argsJson.startsWith('@')) {
    argsJson = readFileSync(argsJson.slice(1), 'utf8');
  }

  const projectRoot =
    process.env.GESSO_PROJECT_ROOT ?? join(__dirname, '..', '..', 'test_project');
  const godotPath =
    process.env.GODOT_PATH ??
    'c:/Users/chibu/OneDrive/Documents/Gesso/Godot 4/Godot_v4.7-dev5_win64_console.exe';
  const bridgePort = parseInt(flags.port ?? process.env.GESSO_PORT ?? '6505', 10);
  const ctrlPort = parseInt(flags.ctrlPort ?? process.env.GESSO_CTRL_PORT ?? String(DEFAULT_CTRL_PORT), 10);

  if (!flags.port) process.env.GESSO_PORT = String(bridgePort);
  if (!flags.ctrlPort) process.env.GESSO_CTRL_PORT = String(ctrlPort);

  const args = JSON.parse(argsJson);

  let result;
  if (flags.stdio) {
    result = await invokeViaStdio(toolName, args, projectRoot, godotPath);
  } else {
    if (!flags.noDaemon) {
      await ensureDaemon(projectRoot, bridgePort, ctrlPort);
    } else if (!(await pingControlServer(ctrlPort, 800))) {
      throw new Error(
        `Bridge daemon not running on control port ${ctrlPort}. ` +
          `Start it with: node scripts/bridge-daemon.mjs`
      );
    }
    result = await invokeViaControl(ctrlPort, toolName, args);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
