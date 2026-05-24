#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { readFileSync } from 'fs';

const toolName = process.argv[2];
let argsJson = process.argv[3] ?? '{}';
if (argsJson.startsWith('@')) {
  argsJson = readFileSync(argsJson.slice(1), 'utf8');
}

if (!toolName) {
  console.error('Usage: node scripts/call-tool.mjs <toolName> [jsonArgs]');
  process.exit(1);
}

const projectRoot =
  process.env.GESSO_PROJECT_ROOT ??
  join(__dirname, '..', '..', 'test_project');
const godotPath =
  process.env.GODOT_PATH ??
  'c:/Users/chibu/OneDrive/Documents/Gesso/Godot 4/Godot_v4.7-dev5_win64_console.exe';

const serverEntry = join(__dirname, '..', 'dist', 'index.js');

const transport = new StdioClientTransport({
  command: 'node',
  args: [serverEntry],
  cwd: projectRoot,
  env: {
    ...process.env,
    GESSO_PROJECT_ROOT: projectRoot,
    GODOT_PATH: godotPath,
  },
});

const client = new Client({ name: 'gesso-probe', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const args = JSON.parse(argsJson);
  const result = await client.callTool({ name: toolName, arguments: args });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
} finally {
  await client.close();
}
