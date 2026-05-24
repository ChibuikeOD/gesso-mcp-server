#!/usr/bin/env node

/**
 * Gesso MCP Server
 * A hybrid, full-control Model Context Protocol server for the Godot 4.x Engine.
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
import { dirname, join, normalize } from 'path';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, renameSync, createWriteStream } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Readable } from 'stream';

import { allTools, toolExists } from './tools/index.js';
import { EditorBridge } from './editor-bridge.js';
import {
  normalizeParameters,
  convertCamelToSnakeCase,
  validatePath,
  createErrorResponse,
  detectGodotPath,
  isValidGodotPath,
  resolveProjectRoot,
  releaseStaleGessoServerOnPort,
  isPortInUse,
  gessoLog,
} from './utils.js';

const execFileAsync = promisify(execFile);

// Derive paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_NAME = 'gesso-mcp-server';
const SERVER_VERSION = '0.1.0';
const WEBSOCKET_PORT = process.env.GESSO_PORT ? parseInt(process.env.GESSO_PORT, 10) : 6505;

const PROJECT_ROOT = resolveProjectRoot(SERVER_NAME);
let godotPath: string | null = null;

// Initialize WebSocket Bridge
const editorBridge = new EditorBridge(WEBSOCKET_PORT);

// Headless CLI execution helper
async function executeHeadlessOperation(
  operation: string,
  params: Record<string, any>
): Promise<{ stdout: string; stderr: string }> {
  if (!godotPath) {
    godotPath = await detectGodotPath(PROJECT_ROOT);
    if (!godotPath) {
      throw new Error('Could not find a valid Godot executable path. Make sure Godot is installed or set GODOT_PATH.');
    }
  }

  const runnerScript = join(__dirname, 'scripts', 'gesso_headless_runner.gd');
  if (!existsSync(runnerScript)) {
    throw new Error(`Headless operations script missing: ${runnerScript}`);
  }

  // Convert parameters to snake_case for GDScript compatibility
  const snakeParams = convertCamelToSnakeCase(params);
  const paramsJson = JSON.stringify(snakeParams);

  const args = [
    '--headless',
    '--path',
    PROJECT_ROOT,
    '--script',
    runnerScript,
    operation,
    paramsJson,
  ];

  gessoLog('debug', SERVER_NAME, `Headless CLI: ${godotPath} ${args.join(' ')}`);
  const { stdout, stderr } = await execFileAsync(godotPath, args, { timeout: 15000 });
  return { stdout, stderr };
}

// Handler for direct Node-based filesystem operations (extremely fast fallback)
async function handleFsTool(name: string, args: any): Promise<any> {
  const resPath = args.path || args.root || '';
  const absPath = resPath.startsWith('res://')
    ? join(PROJECT_ROOT, resPath.substring(6))
    : join(PROJECT_ROOT, resPath);

  if (!validatePath(absPath)) {
    return { error: 'Invalid path' };
  }

  switch (name) {
    case 'list_dir': {
      try {
        if (!existsSync(absPath)) return { error: `Directory does not exist: ${resPath}` };
        const entries = readdirSync(absPath, { withFileTypes: true });
        const files: string[] = [];
        const folders: string[] = [];
        for (const entry of entries) {
          if (entry.isDirectory()) folders.push(entry.name);
          else files.push(entry.name);
        }
        return { files, folders, path: resPath };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case 'read_file': {
      try {
        if (!existsSync(absPath)) return { error: `File does not exist: ${resPath}` };
        const content = readFileSync(absPath, 'utf8');
        const lines = content.split('\n');
        const start = args.start_line ? Math.max(0, args.start_line - 1) : 0;
        const end = args.end_line ? Math.min(lines.length, args.end_line) : lines.length;
        const sliced = lines.slice(start, end).join('\n');
        return { content: sliced, path: resPath, line_count: lines.length };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case 'create_script':
    case 'write_file': {
      try {
        const dir = dirname(absPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(absPath, args.content || args.text || '', 'utf8');
        return { success: true, path: resPath, message: 'File written successfully' };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case 'delete_file': {
      try {
        if (!existsSync(absPath)) return { error: `File does not exist: ${resPath}` };
        if (args.create_backup !== false) {
          writeFileSync(absPath + '.bak', readFileSync(absPath));
        }
        unlinkSync(absPath);
        return { success: true, message: 'File deleted successfully' };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case 'create_folder': {
      try {
        if (!existsSync(absPath)) mkdirSync(absPath, { recursive: true });
        return { success: true, path: resPath };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case 'rename_file': {
      const destPath = args.new_path.startsWith('res://')
        ? join(PROJECT_ROOT, args.new_path.substring(6))
        : join(PROJECT_ROOT, args.new_path);
      try {
        if (!existsSync(absPath)) return { error: `Source file does not exist: ${resPath}` };
        const dir = dirname(destPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        renameSync(absPath, destPath);
        return { success: true, old_path: resPath, new_path: args.new_path };
      } catch (err: any) {
        return { error: err.message };
      }
    }
    case 'search_assets': {
      try {
        const query = args.query;
        const source = args.source || '';
        const limit = args.limit || 10;

        let ddgQuery = query;
        if (source) {
          ddgQuery = `site:${source} ${query}`;
        } else {
          ddgQuery = `site:opengameart.org OR site:kenney.nl OR site:polyhaven.com OR site:itch.io ${query}`;
        }

        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(ddgQuery)}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        if (!response.ok) {
          return { error: `Failed to search DuckDuckGo: ${response.status} ${response.statusText}` };
        }

        const html = await response.text();
        const parts = html.split('<div class="result results_links results_links_deep web-result');
        const results: any[] = [];

        for (let i = 1; i < parts.length && results.length < limit; i++) {
          const part = parts[i];
          const titleLinkMatch = part.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
          const snippetMatch = part.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

          if (titleLinkMatch) {
            let link = titleLinkMatch[1];
            if (link.includes('uddg=')) {
              const match = link.match(/uddg=([^&]+)/);
              if (match) {
                link = decodeURIComponent(match[1]);
              }
            } else if (link.startsWith('//')) {
              link = 'https:' + link;
            }

            const title = titleLinkMatch[2].replace(/<[^>]*>/g, '').trim()
              .replace(/&amp;/g, '&')
              .replace(/&#x27;/g, "'")
              .replace(/&quot;/g, '"');

            const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim()
              .replace(/&amp;/g, '&')
              .replace(/&#x27;/g, "'")
              .replace(/&quot;/g, '"') : '';

            results.push({ title, link, snippet });
          }
        }

        return { results, query: ddgQuery };
      } catch (err: any) {
        return { error: `Search failed: ${err.message}` };
      }
    }
    case 'inspect_asset_page': {
      try {
        const url = args.url;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        if (!response.ok) {
          return { error: `Failed to fetch webpage: ${response.status} ${response.statusText}` };
        }

        const html = await response.text();
        const isKenney = url.includes('kenney.nl');
        const downloads: any[] = [];
        const ccLicenses: string[] = [];
        const artPreviews: string[] = [];
        let match: any;

        if (isKenney) {
          const zipRegex = /href=['"]([^'"]+\.zip)['"]/g;
          while ((match = zipRegex.exec(html)) !== null) {
            if (!downloads.some(d => d.url === match[1])) {
              const parts = match[1].split('/');
              const filename = parts[parts.length - 1];
              downloads.push({
                url: match[1],
                name: filename
              });
            }
          }

          const ccRegex = /href=['"](https?:\/\/creativecommons\.org\/[a-zA-Z0-9.\/-]+)['"]/g;
          while ((match = ccRegex.exec(html)) !== null) {
            if (!ccLicenses.includes(match[1])) {
              ccLicenses.push(match[1]);
            }
          }

          const screenshotRegex = /class=['"]screenshot[^'"]*['"]\s+href=['"]([^'"]+)['"]/g;
          while ((match = screenshotRegex.exec(html)) !== null) {
            if (!artPreviews.includes(match[1])) {
              artPreviews.push(match[1]);
            }
          }
        } else {
          const fileRegex = /<span class="file">[\s\S]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
          while ((match = fileRegex.exec(html)) !== null) {
            downloads.push({
              url: match[1],
              name: match[2].replace(/<[^>]*>/g, '').trim()
            });
          }

          const ccRegex = /href=['"](https?:\/\/creativecommons\.org\/[a-zA-Z0-9.\/-]+)['"]/g;
          while ((match = ccRegex.exec(html)) !== null) {
            if (!ccLicenses.includes(match[1])) {
              ccLicenses.push(match[1]);
            }
          }

          const previewRegex = /href=['"](https?:\/\/opengameart\.org\/sites\/default\/files\/[^'"]+)['"]\s+class=['"]preview-lightbox['"]/g;
          while ((match = previewRegex.exec(html)) !== null) {
            if (!artPreviews.includes(match[1])) {
              artPreviews.push(match[1]);
            }
          }

          if (downloads.length === 0) {
            const fallbackRegex = /href=['"]([^'"]+\.(zip|tar\.gz|tgz|rar|7z|png|jpg|wav|mp3|ogg))['"]/ig;
            while ((match = fallbackRegex.exec(html)) !== null) {
              const fileUrl = match[1];
              if (!downloads.some(d => d.url === fileUrl) && !fileUrl.includes('//external-content.duckduckgo.com') && !fileUrl.includes('gravatar.com')) {
                const parts = fileUrl.split('/');
                const filename = parts[parts.length - 1];
                downloads.push({
                  url: fileUrl.startsWith('//') ? 'https:' + fileUrl : fileUrl.startsWith('/') ? new URL(fileUrl, url).toString() : fileUrl,
                  name: filename
                });
              }
            }
          }
        }

        return { downloads, licenses: ccLicenses, previews: artPreviews, url };
      } catch (err: any) {
        return { error: `Inspection failed: ${err.message}` };
      }
    }
    case 'download_asset': {
      try {
        const downloadUrl = args.url;
        const targetResPath = args.destination_path;
        const autoExtract = args.auto_extract !== false;

        const targetAbsPath = targetResPath.startsWith('res://')
          ? join(PROJECT_ROOT, targetResPath.substring(6))
          : join(PROJECT_ROOT, targetResPath);

        if (!validatePath(targetAbsPath)) {
          return { error: `Invalid destination path: ${targetResPath}` };
        }

        const urlObj = new URL(downloadUrl);
        const urlFilename = urlObj.pathname.split('/').pop() || 'downloaded_asset';

        let fileDestAbsPath = targetAbsPath;
        let isDirectoryTarget = false;

        if (targetResPath.endsWith('/') || !targetResPath.split('/').pop()?.includes('.')) {
          isDirectoryTarget = true;
          if (!existsSync(targetAbsPath)) {
            mkdirSync(targetAbsPath, { recursive: true });
          }
          fileDestAbsPath = join(targetAbsPath, urlFilename);
        } else {
          const parentDir = dirname(targetAbsPath);
          if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
          }
        }

        console.error(`[Downloader] Downloading: ${downloadUrl} to ${fileDestAbsPath}`);
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          return { error: `Failed to download file: ${response.status} ${response.statusText}` };
        }

        const fileStream = createWriteStream(fileDestAbsPath);
        if (!response.body) {
          return { error: 'Response body is empty' };
        }

        await new Promise<void>((resolve, reject) => {
          Readable.fromWeb(response.body as any).pipe(fileStream)
            .on('finish', () => resolve())
            .on('error', (e: any) => reject(e));
        });

        let extracted = false;
        let extractionMsg = '';

        if (autoExtract && (fileDestAbsPath.endsWith('.zip') || urlFilename.endsWith('.zip'))) {
          const extractDir = isDirectoryTarget ? targetAbsPath : dirname(targetAbsPath);
          console.error(`[Downloader] Extracting ZIP: ${fileDestAbsPath} to ${extractDir}`);
          try {
            await extractArchive(fileDestAbsPath, extractDir);
            extracted = true;
            extractionMsg = ` and extracted to ${targetResPath}`;
            unlinkSync(fileDestAbsPath);
          } catch (extError: any) {
            console.error(`[Downloader] Extraction failed:`, extError);
            extractionMsg = ` (Extraction failed: ${extError.message})`;
          }
        }

        return {
          success: true,
          message: `Asset downloaded successfully${extractionMsg}`,
          filename: urlFilename,
          saved_to: targetResPath,
          extracted
        };
      } catch (err: any) {
        return { error: `Download failed: ${err.message}` };
      }
    }
    default:
      return null;
  }
}

async function extractArchive(zipPath: string, destDir: string): Promise<boolean> {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  if (process.platform === 'win32') {
    try {
      await execFileAsync('tar', ['-xf', zipPath, '-C', destDir]);
      return true;
    } catch (tarError: any) {
      console.warn('Tar extraction failed, trying PowerShell Expand-Archive...', tarError.message);
      await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`
      ]);
      return true;
    }
  } else {
    try {
      await execFileAsync('unzip', ['-o', zipPath, '-d', destDir]);
      return true;
    } catch (unzipError: any) {
      console.warn('Unzip failed, trying tar...', unzipError.message);
      await execFileAsync('tar', ['-xf', zipPath, '-C', destDir]);
      return true;
    }
  }
}

// Master execution dispatcher routing calls to WebSocket or Headless CLI
async function handleToolCall(name: string, toolArgs: Record<string, unknown>): Promise<any> {
  const normalizedArgs = normalizeParameters(toolArgs);

  // 1. Direct Node-based Filesystem Tools (instant execution, works offline/online)
  const fsResult = await handleFsTool(name, normalizedArgs);
  if (fsResult !== null) {
    if (fsResult.error) return createErrorResponse(fsResult.error);
    return { content: [{ type: 'text', text: JSON.stringify(fsResult, null, 2) }] };
  }

  // 2. WebSocket execution (Editor and/or in-game runtime connected)
  if (editorBridge.isAvailable()) {
    try {
      const isRuntime = editorBridge.routeIsRuntime(name, normalizedArgs);
      if (isRuntime && !editorBridge.isRuntimeConnected()) {
        return createErrorResponse(
          `Runtime helper is not connected. The game must be running to execute ${name}. ` +
          `Use run_scene with wait_for_runtime=true first.`
        );
      }
      if (!isRuntime && !editorBridge.isConnected()) {
        return createErrorResponse(
          `Godot Editor is not connected. Tool '${name}' requires the editor plugin.`
        );
      }
      const result = await editorBridge.invokeTool(name, toolArgs);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return createErrorResponse(err.message);
    }
  }

  // 3. Headless CLI Fallback Mode
  gessoLog('info', SERVER_NAME, `Editor disconnected — headless fallback for: ${name}`);

  // Runtime-only or Editor-only tools cannot run headlessly
  const isRuntime = editorBridge.routeIsRuntime(name, normalizedArgs);
  const editorOnlyTools = new Set([
    'open_in_godot',
    'scene_tree_dump',
    'get_console_log',
    'get_errors',
    'clear_console_log',
    'capture_screen',
  ]);
  if (isRuntime) {
    return createErrorResponse(`The tool '${name}' requires a running game session. Start your game in the editor to use it.`);
  }
  if (editorOnlyTools.has(name)) {
    return createErrorResponse(`The tool '${name}' requires the Godot editor to be open and connected.`);
  }

  // Map to headless operation scripts
  try {
    let operation = name;
    let params: Record<string, any> = { ...normalizedArgs };

    // Standardize mapping for scene tools
    if (name === 'modify_node_property' || name === 'set_node_properties') {
      operation = 'modify_node';
    } else if (name === 'instance_scene') {
      operation = 'add_node';
      params.nodeType = 'PackedScene';
      params.properties = params.properties || {};
      params.properties.scene_path = params.instancePath;
    }

    const { stdout, stderr } = await executeHeadlessOperation(operation, params);
    
    if (stderr && stderr.includes('[ERROR]')) {
      return createErrorResponse(`Headless execution error: ${stderr}`);
    }

    // Extract JSON payload from stdout if present
    const markers: Record<string, [string, string]> = {
      read_scene: ['SCENE_JSON_START', 'SCENE_JSON_END'],
      get_resource_info: ['RESOURCE_JSON_START', 'RESOURCE_JSON_END'],
      list_signal_connections: ['SIGNALS_JSON_START', 'SIGNALS_JSON_END'],
      manage_theme_resource: ['THEME_JSON_START', 'THEME_JSON_END'],
      validate_script: ['VALIDATION_JSON_START', 'VALIDATION_JSON_END'],
      list_viewport_presets: ['VIEWPORT_JSON_START', 'VIEWPORT_JSON_END'],
      configure_game_viewport: ['VIEWPORT_JSON_START', 'VIEWPORT_JSON_END'],
      capture_screen: ['CAPTURE_JSON_START', 'CAPTURE_JSON_END'],
    };

    if (markers[operation]) {
      const [startM, endM] = markers[operation];
      const startIdx = stdout.indexOf(startM);
      const endIdx = stdout.indexOf(endM);
      if (startIdx !== -1 && endIdx !== -1) {
        const jsonStr = stdout.substring(startIdx + startM.length, endIdx).trim();
        try {
          const parsed = JSON.parse(jsonStr);
          return { content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }] };
        } catch {
          // Fall through to raw stdout
        }
      }
    }

    return { content: [{ type: 'text', text: stdout.trim() || `${name} executed headlessly.` }] };
  } catch (err: any) {
    return createErrorResponse(`Headless fallback failed: ${err.message}`);
  }
}

// Bootstrap MCP Server
async function main() {
  // Start WebSocket server (only one Gesso instance may own the bridge port)
  try {
    if (await isPortInUse(WEBSOCKET_PORT)) {
      gessoLog(
        'warn',
        SERVER_NAME,
        `Port ${WEBSOCKET_PORT} in use — stopping stale Gesso MCP server...`
      );
      await releaseStaleGessoServerOnPort(WEBSOCKET_PORT);
    }
    await editorBridge.start();
    gessoLog('info', SERVER_NAME, `Bridge ready on port ${WEBSOCKET_PORT} — project: ${PROJECT_ROOT}`);
  } catch (err: any) {
    gessoLog('warn', SERVER_NAME, `Failed to start WebSocket on port ${WEBSOCKET_PORT}: ${err.message}`);
    gessoLog('warn', SERVER_NAME, 'Headless & filesystem tools still work; live editor tools may be unavailable.');
  }

  // Tell the Godot plugin when the editor bridge is up. With stdio MCP, this
  // process only runs while Cursor has the gesso server enabled, so count=1
  // means "agent session active" once Godot is connected.
  editorBridge.onConnectionChange((connected) => {
    editorBridge.sendClientStatus(connected ? 1 : 0);
  });

  // Pre-detect Godot path
  godotPath = await detectGodotPath(PROJECT_ROOT);
  if (godotPath) {
    gessoLog('info', SERVER_NAME, `Godot: ${godotPath}`);
  } else {
    gessoLog('warn', SERVER_NAME, 'Godot path not detected — set GODOT_PATH for headless tools.');
  }

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Return connection status tool along with all registered tools
    const statusTool = {
      name: 'get_godot_status',
      description: 'Check if Godot editor is connected to the Gesso MCP server.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: []
      }
    };

    return {
      tools: [
        statusTool,
        ...allTools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }))
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (name === 'get_godot_status') {
      const status = editorBridge.getStatus();
      const live = status.connected || status.runtimeConnected;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected: status.connected,
            runtime_connected: status.runtimeConnected,
            server_version: SERVER_VERSION,
            websocket_port: WEBSOCKET_PORT,
            mode: live ? 'live' : 'headless_fallback',
            project_path: PROJECT_ROOT,
            connected_at: status.connectedAt?.toISOString() || null,
            pending_requests: status.pendingRequests,
          }, null, 2)
        }]
      };
    }

    if (name !== 'get_godot_status' && !toolExists(name)) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }

    return await handleToolCall(name, (args || {}) as Record<string, unknown>);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  gessoLog('info', SERVER_NAME, 'MCP server running (stdio)');

  if (editorBridge.isConnected()) {
    editorBridge.sendClientStatus(1);
  }
}

main().catch(err => {
  gessoLog('error', SERVER_NAME, `Startup failed: ${err}`);
  process.exit(1);
});
