#!/usr/bin/env node
/**
 * Emit .cursor/mcp.json with gesso-router + grouped ctrl-client servers.
 * Usage: node scripts/generate-cursor-mcp.mjs [outputPath]
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distIndex = join(root, 'dist', 'index.js').replace(/\\/g, '/');
const distRouter = join(root, 'dist', 'router.js').replace(/\\/g, '/');
const projectCwd = process.env.GESSO_PROJECT_ROOT ?? join(root, '..', 'test_project').replace(/\\/g, '/');

const baseEnv = {
  GESSO_PROJECT_ROOT: projectCwd,
  GODOT_PATH:
    process.env.GODOT_PATH ??
    'c:/Users/chibu/OneDrive/Documents/Gesso/Godot 4/Godot_v4.7-dev5_win64_console.exe',
  GESSO_LOG_LEVEL: 'error',
};

const ALL_GROUPS = [
  'workspace',
  'scenes',
  'editor',
  'playtest_input',
  'playtest_inspect',
  'playtest_scene',
  'playtest_ui',
  'playtest_audio',
  'playtest_physics',
  'playtest_nodes_a',
  'playtest_nodes_b',
  'deploy',
  'integrations',
];

/** Default direct-access groups (enable at most one alongside the router). */
const DEFAULT_ENABLED_GROUPS = ['workspace', 'scenes', 'editor'];

function buildServers(includeGroups) {
  const servers = {
    'gesso-router': {
      command: 'node',
      args: [distRouter],
      cwd: projectCwd,
      env: { ...baseEnv },
    },
  };
  for (const group of includeGroups) {
    servers[`gesso-${group}`] = {
      command: 'node',
      args: [distIndex],
      cwd: projectCwd,
      env: {
        ...baseEnv,
        GESSO_TOOL_GROUP: group,
        GESSO_CTRL_CLIENT: '1',
      },
    };
  }
  return servers;
}

const writeAll = process.argv.includes('--all');
const outPath = process.argv.find((a) => a.endsWith('.json')) ?? join(root, '..', '.cursor', 'mcp.json');
const groups = writeAll ? ALL_GROUPS : DEFAULT_ENABLED_GROUPS;
const config = { mcpServers: buildServers(groups) };

writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath} (${Object.keys(config.mcpServers).length} servers)`);

const examplePath = join(root, '..', '.cursor', 'mcp.gesso-all-groups.json');
writeFileSync(
  examplePath,
  `${JSON.stringify({ mcpServers: buildServers(ALL_GROUPS) }, null, 2)}\n`,
  'utf8'
);
console.log(`Wrote ${examplePath} (all ${ALL_GROUPS.length} group servers — enable selectively)`);
console.log('Stay under ~40 tools: keep gesso-router on; enable at most one gesso-<group>, or use call_gesso_tool only.');
