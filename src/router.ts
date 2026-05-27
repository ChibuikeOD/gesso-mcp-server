#!/usr/bin/env node
/**
 * Gesso Router MCP — small surface area for Cursor's tool limit.
 * Lists tool groups, lists tools in a group, and calls any Gesso tool via the bridge daemon.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'url';
import { normalize, resolve } from 'path';

import { listGroupSummaries, isValidGroupId, getToolsForGroup } from './tool-groups.js';
import { toolExists } from './tools/index.js';
import { ensureBridgeDaemon, invokeToolViaDaemon } from './daemon-client.js';
import { gessoLog } from './utils.js';

const SERVER_NAME = 'gesso-router';
const SERVER_VERSION = '0.1.0';

const ROUTER_TOOLS = [
  {
    name: 'list_gesso_tool_groups',
    description:
      'List Gesso MCP tool groups (workspace, scenes, editor, playtest_*, deploy, integrations) with counts and when to use each. Call this first to pick a group.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'list_gesso_group_tools',
    description:
      'List tool names and descriptions for one Gesso group (from list_gesso_tool_groups). Use before call_gesso_tool when unsure of exact tool names.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        group_id: {
          type: 'string',
          description:
            'Group id: workspace | scenes | editor | playtest_input | playtest_inspect | playtest_scene | playtest_ui | playtest_audio | playtest_physics | playtest_nodes_a | playtest_nodes_b | deploy | integrations',
        },
      },
      required: ['group_id'],
    },
  },
  {
    name: 'call_gesso_tool',
    description:
      'Invoke any Gesso tool by name via the shared bridge daemon. Pass JSON arguments matching the tool schema (use list_gesso_group_tools to discover).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tool: { type: 'string', description: 'Exact Gesso tool name (e.g. run_scene, game_screenshot)' },
        arguments: {
          type: 'object',
          description: 'Tool arguments object (default: {})',
        },
      },
      required: ['tool'],
    },
  },
  {
    name: 'get_godot_status',
    description: 'Check Godot editor/runtime connection to the Gesso bridge.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
] as const;

function textResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  };
}

async function main(): Promise<void> {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ROUTER_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = (args ?? {}) as Record<string, unknown>;

    try {
      if (name === 'list_gesso_tool_groups') {
        const groups = listGroupSummaries();
        const total = groups.reduce((n, g) => n + g.toolCount, 0);
        return textResult({
          totalTools: total,
          cursorHint:
            'Enable one grouped gesso-* MCP server for direct tools, or keep using call_gesso_tool (stays under Cursor ~40-tool limit).',
          groups: groups.map(({ tools, ...meta }) => meta),
        });
      }

      if (name === 'list_gesso_group_tools') {
        const groupId = String(params.group_id ?? '');
        if (!isValidGroupId(groupId)) {
          throw new McpError(ErrorCode.InvalidParams, `Unknown group_id: ${groupId}`);
        }
        const tools = getToolsForGroup(groupId);
        return textResult({
          group_id: groupId,
          toolCount: tools.length,
          tools: tools.map((t) => ({ name: t.name, description: t.description })),
        });
      }

      if (name === 'call_gesso_tool') {
        const tool = String(params.tool ?? '');
        if (!tool) {
          throw new McpError(ErrorCode.InvalidParams, 'tool is required');
        }
        if (!toolExists(tool)) {
          throw new McpError(ErrorCode.InvalidParams, `Unknown Gesso tool: ${tool}`);
        }
        const toolArgs =
          params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
            ? (params.arguments as Record<string, unknown>)
            : {};
        const result = await invokeToolViaDaemon(tool, toolArgs);
        return textResult(result);
      }

      if (name === 'get_godot_status') {
        const result = await invokeToolViaDaemon('get_godot_status', {});
        return textResult(result);
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    } catch (err) {
      if (err instanceof McpError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, message);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  gessoLog('debug', SERVER_NAME, 'Router MCP running (stdio)');
}

const __filename = fileURLToPath(import.meta.url);
const isMainModule =
  process.argv[1] && normalize(resolve(process.argv[1])) === normalize(__filename);

if (isMainModule) {
  main().catch((err) => {
    gessoLog('error', SERVER_NAME, `Startup failed: ${err}`);
    process.exit(1);
  });
}
