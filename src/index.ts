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
import { dirname, join, normalize, resolve, extname } from 'path';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, renameSync, createWriteStream, rmSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Readable } from 'stream';
import { createServer } from 'http';

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

const DEFAULT_PRESETS: Record<string, { platform: string, name: string, export_path: string, options: Record<string, any> }> = {
  windows: {
    platform: 'Windows Desktop',
    name: 'Windows Desktop',
    export_path: 'build/windows/game.exe',
    options: {
      'custom_template/debug': '',
      'custom_template/release': '',
      'binary_format/embed_pck': false,
      'texture_format/bptc': true,
      'texture_format/s3tc': true,
      'texture_format/etc2': true,
      'texture_format/astc': true,
      'binary_format/architecture': 'x86_64',
      'codesign/enable': false,
      'codesign/identity': '',
      'codesign/password': '',
      'codesign/timestamp': true,
      'codesign/timestamp_server_url': '',
      'codesign/digest_algorithm': 1,
      'codesign/description': '',
      'codesign/url': '',
      'application/icon': '',
      'application/console_wrapper_icon': '',
      'application/icon_interpolated': true,
      'application/file_version': '',
      'application/product_version': '',
      'application/company_name': '',
      'application/product_name': '',
      'application/file_description': '',
      'application/copyright': '',
      'application/trademarks': '',
      'ssh_remote_deploy/enabled': false,
      'ssh_remote_deploy/host': '',
      'ssh_remote_deploy/port': '22',
      'ssh_remote_deploy/user': '',
      'ssh_remote_deploy/password': '',
      'ssh_remote_deploy/private_key_path': '',
      'ssh_remote_deploy/extra_args_ssh': '',
      'ssh_remote_deploy/extra_args_scp': '',
      'ssh_remote_deploy/run_script': ''
    }
  },
  linux: {
    platform: 'Linux/X11',
    name: 'Linux/X11',
    export_path: 'build/linux/game.x86_64',
    options: {
      'custom_template/debug': '',
      'custom_template/release': '',
      'binary_format/embed_pck': false,
      'texture_format/bptc': true,
      'texture_format/s3tc': true,
      'texture_format/etc2': true,
      'texture_format/astc': true,
      'binary_format/architecture': 'x86_64',
      'ssh_remote_deploy/enabled': false,
      'ssh_remote_deploy/host': '',
      'ssh_remote_deploy/port': '22',
      'ssh_remote_deploy/user': '',
      'ssh_remote_deploy/password': '',
      'ssh_remote_deploy/private_key_path': '',
      'ssh_remote_deploy/extra_args_ssh': '',
      'ssh_remote_deploy/extra_args_scp': '',
      'ssh_remote_deploy/run_script': ''
    }
  },
  mac: {
    platform: 'macOS',
    name: 'macOS',
    export_path: 'build/mac/game.zip',
    options: {
      'custom_template/debug': '',
      'custom_template/release': '',
      'binary_format/embed_pck': false,
      'texture_format/bptc': true,
      'texture_format/s3tc': true,
      'texture_format/etc2': true,
      'texture_format/astc': true,
      'codesign/enable': false,
      'codesign/identity': '',
      'codesign/password': '',
      'codesign/timestamp': true,
      'codesign/timestamp_server_url': '',
      'codesign/digest_algorithm': 1,
      'codesign/description': '',
      'codesign/url': '',
      'application/icon': '',
      'application/file_version': '',
      'application/product_version': '',
      'application/company_name': '',
      'application/product_name': '',
      'application/file_description': '',
      'application/copyright': '',
      'application/trademarks': '',
      'ssh_remote_deploy/enabled': false,
      'ssh_remote_deploy/host': '',
      'ssh_remote_deploy/port': '22',
      'ssh_remote_deploy/user': '',
      'ssh_remote_deploy/password': '',
      'ssh_remote_deploy/private_key_path': '',
      'ssh_remote_deploy/extra_args_ssh': '',
      'ssh_remote_deploy/extra_args_scp': '',
      'ssh_remote_deploy/run_script': ''
    }
  },
  android: {
    platform: 'Android',
    name: 'Android',
    export_path: 'build/android/game.apk',
    options: {
      'custom_template/debug': '',
      'custom_template/release': '',
      'gradle_build/use_gradle_build': false,
      'architectures/armeabi-v7a': true,
      'architectures/arm64-v8a': true,
      'architectures/x86': true,
      'architectures/x86_64': true,
      'version/code': 1,
      'version/name': '1.0',
      'package/unique_name': 'com.example.game',
      'package/name': 'My Game',
      'package/signed': true,
      'keystore/debug': '',
      'keystore/debug_user': '',
      'keystore/debug_password': '',
      'keystore/release': '',
      'keystore/release_user': '',
      'keystore/release_password': '',
      'xr_features/xr_mode': 0
    }
  },
  ios: {
    platform: 'iOS',
    name: 'iOS',
    export_path: 'build/ios/game.ipa',
    options: {
      'custom_template/debug': '',
      'custom_template/release': '',
      'architectures/arm64': true,
      'version/code': 1,
      'version/name': '1.0',
      'package/bundle_identifier': 'com.example.game',
      'package/name': 'My Game',
      'capabilities/arkit': false,
      'user_interface/ipad_support': true,
      'user_interface/iphone_support': true
    }
  },
  web: {
    platform: 'Web',
    name: 'Web',
    export_path: 'build/web/index.html',
    options: {
      'custom_template/debug': '',
      'custom_template/release': '',
      'variant/extensions_support': false,
      'vram_texture_compression/import_s3tc_bptc': true,
      'vram_texture_compression/import_etc2_astc': false,
      'html/export_icon': true,
      'html/custom_html_shell': '',
      'html/head_include': '',
      'html/canvas_resize_policy': 2,
      'html/focus_canvas_on_start': true,
      'html/experimental_virtual_keyboard': false,
      'progressive_web_app/enabled': false,
      'progressive_web_app/offline_page': '',
      'progressive_web_app/display': 1,
      'progressive_web_app/orientation': 0,
      'progressive_web_app/icon_144x144': '',
      'progressive_web_app/icon_180x180': '',
      'progressive_web_app/icon_512x512': '',
      'progressive_web_app/background_color': 'ffffff'
    }
  }
};

function parseValue(val: string): any {
  if (val.startsWith('"') && val.endsWith('"')) {
    return val.substring(1, val.length - 1);
  }
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  if (/^\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}

function parseExportPresets(content: string): any[] {
  const lines = content.split(/\r?\n/);
  const presets: any[] = [];
  let currentSection = '';
  let currentPreset: any = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      if (currentSection.startsWith('preset.') && !currentSection.endsWith('.options')) {
        currentPreset = {
          id: currentSection,
          name: '',
          platform: '',
          runnable: false,
          dedicated_server: false,
          custom_features: '',
          export_filter: 'all_resources',
          include_filter: '',
          exclude_filter: '',
          export_path: '',
          encryption_include_filters: '',
          encryption_exclude_filters: '',
          encrypt_pck: false,
          encrypt_directory: false,
          options: {}
        };
        presets.push(currentPreset);
      }
    } else if (currentSection.startsWith('preset.')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.substring(0, eqIdx).trim();
        const val = parseValue(line.substring(eqIdx + 1).trim());
        
        if (currentSection.endsWith('.options')) {
          const presetId = currentSection.slice(0, -'.options'.length);
          const preset = presets.find(p => p.id === presetId);
          if (preset) {
            preset.options[key] = val;
          }
        } else {
          if (currentPreset) {
            currentPreset[key] = val;
          }
        }
      }
    }
  }
  return presets;
}

function serializeExportPresets(presets: any[]): string {
  let out = '';
  presets.forEach(p => {
    out += `[${p.id}]\n\n`;
    Object.keys(p).forEach(key => {
      if (key === 'id' || key === 'options') return;
      const val = p[key];
      if (typeof val === 'boolean') {
        out += `${key}=${val}\n`;
      } else if (typeof val === 'number') {
        out += `${key}=${val}\n`;
      } else {
        out += `${key}="${val}"\n`;
      }
    });
    out += `\n[${p.id}.options]\n\n`;
    Object.keys(p.options).forEach(key => {
      const val = p.options[key];
      if (typeof val === 'boolean') {
        out += `${key}=${val}\n`;
      } else if (typeof val === 'number') {
        out += `${key}=${val}\n`;
      } else {
        out += `${key}="${val}"\n`;
      }
    });
    out += `\n`;
  });
  return out;
}

async function detectAdbPath(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('adb', ['--version'], { timeout: 2000 });
    if (stdout.trim().length > 0) return 'adb';
  } catch {}

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || 'C:\\Users\\chibu', 'AppData', 'Local');
    const sdkPath = join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
    if (existsSync(sdkPath)) return sdkPath;
  } else {
    const home = process.env.HOME || '';
    const possiblePaths = [
      join(home, 'Android', 'Sdk', 'platform-tools', 'adb'),
      join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
      '/usr/bin/adb',
      '/usr/local/bin/adb'
    ];
    for (const p of possiblePaths) {
      if (existsSync(p)) return p;
    }
  }
  return null;
}

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

const activeWebServers = new Map<number, any>();

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
    case 'list_export_presets': {
      try {
        const presetsPath = join(PROJECT_ROOT, 'export_presets.cfg');
        if (!existsSync(presetsPath)) {
          return { presets: [], message: 'No export_presets.cfg file found in project root.' };
        }
        const content = readFileSync(presetsPath, 'utf8');
        const presets = parseExportPresets(content);
        return { presets };
      } catch (err: any) {
        return { error: `Failed to list export presets: ${err.message}` };
      }
    }
    case 'configure_export_preset': {
      try {
        const platform = args.platform;
        if (!platform || !DEFAULT_PRESETS[platform]) {
          return { error: `Unsupported or invalid platform: "${platform}". Supported platforms: windows, mac, linux, android, ios` };
        }

        const presetName = args.preset_name || args.presetName || DEFAULT_PRESETS[platform].name;
        const exportPath = args.export_path || args.exportPath || DEFAULT_PRESETS[platform].export_path;
        const packageName = args.package_name || args.packageName;
        const customOptions = args.options;

        const presetsPath = join(PROJECT_ROOT, 'export_presets.cfg');
        let presets: any[] = [];
        if (existsSync(presetsPath)) {
          const content = readFileSync(presetsPath, 'utf8');
          presets = parseExportPresets(content);
        }

        let existing = presets.find(p => p.name === presetName);
        let action = 'updated';

        const applyOverrides = (presetObj: any) => {
          if (packageName) {
            if (platform === 'android') {
              presetObj.options['package/unique_name'] = packageName;
            } else if (platform === 'ios') {
              presetObj.options['package/bundle_identifier'] = packageName;
            }
          }
          if (customOptions && typeof customOptions === 'object') {
            Object.assign(presetObj.options, customOptions);
          }
        };

        if (existing) {
          existing.export_path = exportPath;
          applyOverrides(existing);
        } else {
          action = 'created';
          const defaults = DEFAULT_PRESETS[platform];
          const newPreset = {
            id: `preset.${presets.length}`,
            name: presetName,
            platform: defaults.platform,
            runnable: true,
            dedicated_server: false,
            custom_features: '',
            export_filter: 'all_resources',
            include_filter: '',
            exclude_filter: '',
            export_path: exportPath,
            encryption_include_filters: '',
            encryption_exclude_filters: '',
            encrypt_pck: false,
            encrypt_directory: false,
            options: { ...defaults.options }
          };
          applyOverrides(newPreset);
          presets.push(newPreset);
        }

        const newContent = serializeExportPresets(presets);
        writeFileSync(presetsPath, newContent, 'utf8');

        return {
          success: true,
          preset_name: presetName,
          export_path: exportPath,
          action
        };
      } catch (err: any) {
        return { error: `Failed to configure export preset: ${err.message}` };
      }
    }
    case 'export_game': {
      try {
        const preset = args.preset;
        const outputPath = args.output_path || args.outputPath;
        const debug = args.debug === true;

        if (!preset) return { error: 'Preset name is required' };
        if (!outputPath) return { error: 'Output path is required' };

        const absOutputPath = outputPath.startsWith('res://')
          ? join(PROJECT_ROOT, outputPath.substring(6))
          : resolve(PROJECT_ROOT, outputPath);

        if (!validatePath(absOutputPath)) {
          return { error: `Invalid output path: ${outputPath}` };
        }

        const parentDir = dirname(absOutputPath);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }

        if (!godotPath) {
          godotPath = await detectGodotPath(PROJECT_ROOT);
          if (!godotPath) {
            return { error: 'Could not find a valid Godot executable path. Make sure Godot is installed or set GODOT_PATH.' };
          }
        }

        const exportFlag = debug ? '--export-debug' : '--export-release';
        const argsList = [
          '--headless',
          '--path', PROJECT_ROOT,
          exportFlag, preset, absOutputPath
        ];

        gessoLog('info', SERVER_NAME, `Exporting game using: ${godotPath} ${argsList.join(' ')}`);
        
        // Pass APPDATA/HOME environment variables so Godot knows where templates are located
        const exportEnv = {
          ...process.env,
          APPDATA: process.env.APPDATA || join(process.env.USERPROFILE || `C:\\Users\\${process.env.USERNAME || 'chibu'}`, 'AppData', 'Roaming'),
          HOME: process.env.HOME || process.env.USERPROFILE || `C:\\Users\\${process.env.USERNAME || 'chibu'}`
        };

        try {
          const { stdout, stderr } = await execFileAsync(godotPath, argsList, { env: exportEnv, timeout: 120000 });
          return {
            success: true,
            preset,
            output_path: outputPath,
            stdout,
            stderr
          };
        } catch (execErr: any) {
          return {
            success: false,
            error: execErr.message,
            stdout: execErr.stdout,
            stderr: execErr.stderr
          };
        }
      } catch (err: any) {
        return { error: `Export failed: ${err.message}` };
      }
    }
    case 'deploy_to_itch': {
      try {
        const buildPath = args.build_path || args.buildPath;
        const target = args.target;
        const butler = args.butler_path || args.butlerPath || 'butler';

        if (!buildPath) return { error: 'Build path is required' };
        if (!target) return { error: 'Target is required' };

        const absBuildPath = buildPath.startsWith('res://')
          ? join(PROJECT_ROOT, buildPath.substring(6))
          : resolve(PROJECT_ROOT, buildPath);

        if (!validatePath(absBuildPath)) {
          return { error: `Invalid build path: ${buildPath}` };
        }

        if (!existsSync(absBuildPath)) {
          return { error: `Build path does not exist: ${buildPath}` };
        }

        const butlerArgs = ['push', absBuildPath, target];
        gessoLog('info', SERVER_NAME, `Deploying to itch.io: ${butler} ${butlerArgs.join(' ')}`);

        try {
          const { stdout, stderr } = await execFileAsync(butler, butlerArgs, { timeout: 180000 });
          return {
            success: true,
            target,
            stdout,
            stderr
          };
        } catch (execErr: any) {
          return {
            success: false,
            error: execErr.message,
            stdout: execErr.stdout,
            stderr: execErr.stderr
          };
        }
      } catch (err: any) {
        return { error: `Deployment failed: ${err.message}` };
      }
    }
    case 'install_export_templates': {
      try {
        let finalGodotVersion = args.godot_version || args.godotVersion;
        if (!finalGodotVersion) {
          if (!godotPath) {
            godotPath = await detectGodotPath(PROJECT_ROOT);
          }
          if (godotPath) {
            try {
              const { stdout } = await execFileAsync(godotPath, ['--version'], { timeout: 5000 });
              const versionStr = stdout.trim();
              const match = versionStr.match(/^(\d+\.\d+(?:\.\d+)?\.(?:dev|stable|beta|rc|alpha)\d*)/);
              if (match) {
                finalGodotVersion = match[1];
              } else {
                finalGodotVersion = versionStr;
              }
            } catch (err: any) {
              console.error('[Templates] Failed to run godot --version:', err.message);
            }
          }
        }

        if (!finalGodotVersion) {
          return { error: 'Could not auto-detect Godot version and no version was provided.' };
        }

        const match = finalGodotVersion.match(/^(\d+)\.(\d+)(?:\.(\d+))?\.([a-z]+)(\d*)/);
        let downloadUrl = args.download_url || args.downloadUrl;
        let versionDir = finalGodotVersion;

        if (match) {
          const major = match[1];
          const minor = match[2];
          const patch = match[3];
          const status = match[4];
          const statusNum = match[5];

          versionDir = `${major}.${minor}${patch ? '.' + patch : ''}.${status}${statusNum}`;

          if (!downloadUrl) {
            if (status === 'stable') {
              const verTag = `${major}.${minor}${patch ? '.' + patch : ''}`;
              downloadUrl = `https://downloads.tuxfamily.org/godotengine/${verTag}/Godot_v${verTag}-stable_export_templates.tpz`;
            } else {
              const verTag = `${major}.${minor}${patch ? '.' + patch : ''}`;
              downloadUrl = `https://downloads.tuxfamily.org/godotengine/${major}.${minor}/${status}${statusNum}/Godot_v${verTag}-${status}${statusNum}_export_templates.tpz`;
            }
          }
        } else {
          if (!downloadUrl) {
            return { error: `Could not parse Godot version format "${finalGodotVersion}" and no download_url was specified.` };
          }
        }

        let appDataPath = '';
        if (process.platform === 'win32') {
          appDataPath = process.env.APPDATA || join(process.env.USERPROFILE || 'C:\\Users\\chibu', 'AppData', 'Roaming');
        } else if (process.platform === 'darwin') {
          appDataPath = join(process.env.HOME || '', 'Library', 'Application Support');
        } else {
          appDataPath = join(process.env.HOME || '', '.local', 'share');
        }

        const templatesBaseDir = process.platform === 'linux'
          ? join(appDataPath, 'godot', 'export_templates')
          : join(appDataPath, 'Godot', 'export_templates');

        const destTemplatesDir = join(templatesBaseDir, versionDir);

        const versionTxtPath = join(destTemplatesDir, 'version.txt');
        if (existsSync(versionTxtPath) && readFileSync(versionTxtPath, 'utf8').trim() === versionDir) {
          return {
            success: true,
            message: `Export templates for Godot version ${versionDir} are already installed.`,
            installed_dir: destTemplatesDir
          };
        }

        const localTpzPath = args.local_tpz_path || args.localTpzPath;
        let archivePath = localTpzPath;
        let isTempArchive = false;
        const tempTpzPath = join(PROJECT_ROOT, `temp_templates_${versionDir}.zip`);

        if (!archivePath) {
          if (!downloadUrl) {
            return { error: 'No download_url or local_tpz_path provided.' };
          }
          console.error(`[Templates] Downloading templates from: ${downloadUrl}`);
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            return { error: `Failed to download templates: ${response.status} ${response.statusText}` };
          }
          const fileStream = createWriteStream(tempTpzPath);
          if (!response.body) {
            return { error: 'Response body is empty' };
          }
          await new Promise<void>((resolve, reject) => {
            Readable.fromWeb(response.body as any).pipe(fileStream)
              .on('finish', () => resolve())
              .on('error', (e: any) => reject(e));
          });
          archivePath = tempTpzPath;
          isTempArchive = true;
        }

        if (!existsSync(archivePath)) {
          return { error: `Templates archive not found at: ${archivePath}` };
        }

        const tempExtractDir = join(PROJECT_ROOT, `temp_extracted_${versionDir}`);
        console.error(`[Templates] Extracting templates: ${archivePath} to ${tempExtractDir}`);
        await extractArchive(archivePath, tempExtractDir);

        const extractedTemplatesDir = join(tempExtractDir, 'templates');
        if (!existsSync(extractedTemplatesDir)) {
          if (isTempArchive && existsSync(tempTpzPath)) unlinkSync(tempTpzPath);
          try {
            if (existsSync(tempExtractDir)) {
              rmSync(tempExtractDir, { recursive: true, force: true });
            }
          } catch {}
          return { error: `Invalid templates archive: missing 'templates' root directory.` };
        }

        if (!existsSync(destTemplatesDir)) {
          mkdirSync(destTemplatesDir, { recursive: true });
        }

        console.error(`[Templates] Copying template files to: ${destTemplatesDir}`);
        const files = readdirSync(extractedTemplatesDir);
        for (const file of files) {
          const srcFile = join(extractedTemplatesDir, file);
          const destFile = join(destTemplatesDir, file);
          renameSync(srcFile, destFile);
        }

        writeFileSync(versionTxtPath, versionDir, 'utf8');

        // Cleanup
        try {
          if (isTempArchive && existsSync(tempTpzPath)) unlinkSync(tempTpzPath);
          if (existsSync(tempExtractDir)) {
            rmSync(tempExtractDir, { recursive: true, force: true });
          }
        } catch (cleanErr: any) {
          console.error(`[Templates] Cleanup failed: ${cleanErr.message}`);
        }

        return {
          success: true,
          message: `Successfully installed export templates for version ${versionDir}`,
          installed_dir: destTemplatesDir
        };
      } catch (err: any) {
        return { error: `Failed to install templates: ${err.message}` };
      }
    }
    case 'login_to_itch': {
      try {
        const url = 'https://itch.io/login';
        let command = '';
        let argsList: string[] = [];
        if (process.platform === 'win32') {
          command = 'cmd.exe';
          argsList = ['/c', 'start', '', url];
        } else if (process.platform === 'darwin') {
          command = 'open';
          argsList = [url];
        } else {
          command = 'xdg-open';
          argsList = [url];
        }
        gessoLog('info', SERVER_NAME, `Opening browser: ${command} ${argsList.join(' ')}`);
        await execFileAsync(command, argsList, { timeout: 5000 });
        return { success: true, message: `Opened itch.io login page in web browser.` };
      } catch (err: any) {
        return { error: `Failed to open web browser: ${err.message}` };
      }
    }
    case 'create_itch_game_page': {
      try {
        const url = 'https://itch.io/game/new';
        let command = '';
        let argsList: string[] = [];
        if (process.platform === 'win32') {
          command = 'cmd.exe';
          argsList = ['/c', 'start', '', url];
        } else if (process.platform === 'darwin') {
          command = 'open';
          argsList = [url];
        } else {
          command = 'xdg-open';
          argsList = [url];
        }
        gessoLog('info', SERVER_NAME, `Opening browser: ${command} ${argsList.join(' ')}`);
        await execFileAsync(command, argsList, { timeout: 5000 });
        return { success: true, message: `Opened itch.io game creation page in web browser.` };
      } catch (err: any) {
        return { error: `Failed to open web browser: ${err.message}` };
      }
    }
    case 'generate_android_keystore': {
      try {
        const outputPath = args.output_path || args.outputPath;
        if (!outputPath) return { error: 'Output path is required' };

        const password = args.password || 'android';
        const alias = args.alias || 'androiddebugkey';
        const commonName = args.common_name || args.commonName || 'Android Debug';

        const absOutputPath = outputPath.startsWith('res://')
          ? join(PROJECT_ROOT, outputPath.substring(6))
          : resolve(PROJECT_ROOT, outputPath);

        if (!validatePath(absOutputPath)) {
          return { error: `Invalid output path: ${outputPath}` };
        }

        const parentDir = dirname(absOutputPath);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }

        if (existsSync(absOutputPath)) {
          return {
            success: true,
            message: 'Keystore already exists at destination.',
            path: outputPath
          };
        }

        const argsList = [
          '-genkeypair', '-v',
          '-keystore', absOutputPath,
          '-alias', alias,
          '-keyalg', 'RSA',
          '-keysize', '2048',
          '-validity', '10000',
          '-storepass', password,
          '-keypass', password,
          '-dname', `CN=${commonName}, O=Android, C=US`
        ];

        gessoLog('info', SERVER_NAME, `Generating Android keystore using keytool at: ${absOutputPath}`);
        try {
          const { stdout, stderr } = await execFileAsync('keytool', argsList, { timeout: 15000 });
          return {
            success: true,
            message: 'Successfully generated Android keystore.',
            path: outputPath,
            stdout,
            stderr
          };
        } catch (execErr: any) {
          if (execErr.code === 'ENOENT') {
            return {
              error: 'Failed to find JDK keytool executable. Please make sure Java Development Kit (JDK) is installed and keytool is in your system PATH.'
            };
          }
          return {
            success: false,
            error: execErr.message,
            stdout: execErr.stdout,
            stderr: execErr.stderr
          };
        }
      } catch (err: any) {
        return { error: `Failed to generate keystore: ${err.message}` };
      }
    }
    case 'list_connected_devices': {
      try {
        const devices: any[] = [];
        const adbPath = await detectAdbPath();

        if (adbPath) {
          try {
            const { stdout } = await execFileAsync(adbPath, ['devices'], { timeout: 5000 });
            const lines = stdout.split('\n');
            for (let line of lines) {
              line = line.trim();
              if (!line || line.startsWith('List of devices attached')) continue;
              const parts = line.split(/\s+/);
              if (parts.length >= 2) {
                devices.push({
                  id: parts[0],
                  status: parts[1],
                  platform: 'android'
                });
              }
            }
          } catch (err: any) {
            console.error('[Devices] ADB devices check failed:', err.message);
          }
        }

        if (process.platform === 'darwin') {
          try {
            const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'booted'], { timeout: 5000 });
            const lines = stdout.split('\n');
            for (let line of lines) {
              line = line.trim();
              if (line.includes('(Booted)')) {
                const match = line.match(/^([^\(]+)\s+\(([^\)]+)\)\s+\(Booted\)/);
                if (match) {
                  devices.push({
                    id: match[2],
                    name: match[1].trim(),
                    status: 'booted',
                    platform: 'ios',
                    type: 'simulator'
                  });
                }
              }
            }
          } catch {}
        }

        return { devices, adb_path: adbPath };
      } catch (err: any) {
        return { error: `Failed to list connected devices: ${err.message}` };
      }
    }
    case 'deploy_to_device': {
      try {
        const platform = args.platform;
        const buildPath = args.build_path || args.buildPath;
        const packageName = args.package_name || args.packageName;
        const deviceId = args.device_id || args.deviceId;

        if (!platform) return { error: 'Platform is required' };
        if (!buildPath) return { error: 'Build path is required' };
        if (!packageName) return { error: 'Package name is required' };

        const absBuildPath = buildPath.startsWith('res://')
          ? join(PROJECT_ROOT, buildPath.substring(6))
          : resolve(PROJECT_ROOT, buildPath);

        if (!validatePath(absBuildPath)) {
          return { error: `Invalid build path: ${buildPath}` };
        }

        if (!existsSync(absBuildPath)) {
          return { error: `Build path does not exist: ${buildPath}` };
        }

        if (platform === 'android') {
          const adbPath = await detectAdbPath();
          if (!adbPath) {
            return { error: 'Could not locate Android debug bridge (adb). Please make sure Android SDK platform-tools are installed.' };
          }

          const installArgs = deviceId ? ['-s', deviceId, 'install', '-r', absBuildPath] : ['install', '-r', absBuildPath];
          gessoLog('info', SERVER_NAME, `Installing package: ${adbPath} ${installArgs.join(' ')}`);
          
          try {
            await execFileAsync(adbPath, installArgs, { timeout: 60000 });
          } catch (instErr: any) {
            return {
              success: false,
              message: 'Installation failed.',
              error: instErr.message,
              stdout: instErr.stdout,
              stderr: instErr.stderr
            };
          }

          const launchArgs = deviceId 
            ? ['-s', deviceId, 'shell', 'am', 'start', '-n', `${packageName}/com.godot.game.GodotApp`]
            : ['shell', 'am', 'start', '-n', `${packageName}/com.godot.game.GodotApp`];
          
          gessoLog('info', SERVER_NAME, `Launching activity: ${adbPath} ${launchArgs.join(' ')}`);
          const { stdout, stderr } = await execFileAsync(adbPath, launchArgs, { timeout: 15000 });
          
          return {
            success: true,
            message: 'Successfully installed and launched the game on Android device.',
            stdout,
            stderr
          };
        } else if (platform === 'ios') {
          if (process.platform !== 'darwin') {
            return { error: 'iOS deployment to devices/simulators is only supported on macOS host systems.' };
          }

          gessoLog('info', SERVER_NAME, `Deploying to iOS simulator: booted ${absBuildPath}`);
          const installArgs = ['simctl', 'install', 'booted', absBuildPath];
          
          try {
            await execFileAsync('xcrun', installArgs, { timeout: 30000 });
          } catch (instErr: any) {
            return {
              success: false,
              message: 'iOS Simulator installation failed.',
              error: instErr.message,
              stdout: instErr.stdout,
              stderr: instErr.stderr
            };
          }

          const launchArgs = ['simctl', 'launch', 'booted', packageName];
          const { stdout, stderr } = await execFileAsync('xcrun', launchArgs, { timeout: 15000 });

          return {
            success: true,
            message: 'Successfully installed and launched the game on iOS simulator.',
            stdout,
            stderr
          };
        } else {
          return { error: `Unsupported deployment platform: ${platform}` };
        }
      } catch (err: any) {
        return { error: `Deployment failed: ${err.message}` };
      }
    }
    case 'host_web_build': {
      try {
        const buildPath = args.build_path || args.buildPath || 'build/web';
        const port = args.port || 8000;

        const absBuildPath = buildPath.startsWith('res://')
          ? join(PROJECT_ROOT, buildPath.substring(6))
          : resolve(PROJECT_ROOT, buildPath);

        if (!validatePath(absBuildPath)) {
          return { error: `Invalid build path: ${buildPath}` };
        }

        if (!existsSync(absBuildPath)) {
          return { error: `Web build directory does not exist: ${buildPath}` };
        }

        const indexHtml = join(absBuildPath, 'index.html');
        if (!existsSync(indexHtml)) {
          console.warn(`[Web Server] index.html not found under: ${absBuildPath}`);
        }

        const existingServer = activeWebServers.get(port);
        if (existingServer) {
          gessoLog('info', SERVER_NAME, `Stopping existing local web server on port ${port}...`);
          existingServer.close();
          activeWebServers.delete(port);
        }

        const MIME_TYPES: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.wasm': 'application/wasm',
          '.pck': 'application/octet-stream',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.json': 'application/json',
        };

        const server = createServer((req, res) => {
          const reqUrl = req.url || '/';
          const safeUrl = reqUrl.split('?')[0].replace(/\.\./g, '');
          const filePath = safeUrl === '/' ? indexHtml : join(absBuildPath, safeUrl);

          if (!existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
          }

          const ext = extname(filePath).toLowerCase();
          const mime = MIME_TYPES[ext] || 'application/octet-stream';

          try {
            const fileContent = readFileSync(filePath);
            res.writeHead(200, {
              'Content-Type': mime,
              'Cross-Origin-Opener-Policy': 'same-origin',
              'Cross-Origin-Embedder-Policy': 'require-corp',
              'Cache-Control': 'no-cache',
            });
            res.end(fileContent);
          } catch (serverErr: any) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Internal Server Error: ${serverErr.message}`);
          }
        });

        await new Promise<void>((resolvePromise, rejectPromise) => {
          server.listen(port, () => {
            activeWebServers.set(port, server);
            resolvePromise();
          });
          server.on('error', (serverErr) => rejectPromise(serverErr));
        });

        const url = `http://localhost:${port}/`;
        gessoLog('info', SERVER_NAME, `Web server hosting ${absBuildPath} on ${url}`);

        let browserCmd = '';
        let browserArgsList: string[] = [];
        if (process.platform === 'win32') {
          browserCmd = 'cmd.exe';
          browserArgsList = ['/c', 'start', '', url];
        } else if (process.platform === 'darwin') {
          browserCmd = 'open';
          browserArgsList = [url];
        } else {
          browserCmd = 'xdg-open';
          browserArgsList = [url];
        }

        try {
          await execFileAsync(browserCmd, browserArgsList, { timeout: 5000 });
        } catch (browserErr: any) {
          console.error('[Web Server] Failed to open browser:', browserErr.message);
        }

        return {
          success: true,
          message: `Web server hosting ${buildPath} started on port ${port} and opened in browser.`,
          url
        };
      } catch (err: any) {
        return { error: `Failed to start local web server: ${err.message}` };
      }
    }
    case 'deploy_to_vercel': {
      try {
        const buildPath = args.build_path || args.buildPath || 'build/web';
        const production = args.production !== false;
        const vercel = args.vercel_path || args.vercelPath || 'vercel';

        const absBuildPath = buildPath.startsWith('res://')
          ? join(PROJECT_ROOT, buildPath.substring(6))
          : resolve(PROJECT_ROOT, buildPath);

        if (!validatePath(absBuildPath)) {
          return { error: `Invalid build path: ${buildPath}` };
        }

        if (!existsSync(absBuildPath)) {
          return { error: `Web build directory does not exist: ${buildPath}` };
        }

        const vercelArgs = ['deploy', absBuildPath];
        if (production) {
          vercelArgs.push('--prod');
        }
        vercelArgs.push('--yes');

        gessoLog('info', SERVER_NAME, `Deploying to Vercel: ${vercel} ${vercelArgs.join(' ')}`);

        try {
          const { stdout, stderr } = await execFileAsync(vercel, vercelArgs, { timeout: 90000 });
          return {
            success: true,
            stdout,
            stderr
          };
        } catch (execErr: any) {
          if (execErr.code === 'ENOENT') {
            return {
              error: 'Failed to find Vercel CLI executable. Please install it using "npm install -g vercel" and log in first.'
            };
          }
          return {
            success: false,
            error: execErr.message,
            stdout: execErr.stdout,
            stderr: execErr.stderr
          };
        }
      } catch (err: any) {
        return { error: `Vercel deployment failed: ${err.message}` };
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
export async function handleToolCall(name: string, toolArgs: Record<string, unknown>): Promise<any> {
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

/** Start the WebSocket bridge if this process owns it (CLI daemon / first MCP start). */
export async function ensureBridgeStarted(options?: { releaseStale?: boolean }): Promise<void> {
  if (editorBridge.isListening()) {
    return;
  }
  const releaseStale = options?.releaseStale !== false;
  try {
    if (await isPortInUse(WEBSOCKET_PORT)) {
      if (releaseStale) {
        gessoLog('warn', SERVER_NAME, `Port ${WEBSOCKET_PORT} in use — stopping stale Gesso MCP server...`);
        await releaseStaleGessoServerOnPort(WEBSOCKET_PORT);
      } else {
        throw new Error(
          `Port ${WEBSOCKET_PORT} is already in use. Attach to the bridge daemon, use --stdio, or set GESSO_PORT.`
        );
      }
    }
    await editorBridge.start();
    gessoLog('info', SERVER_NAME, `Bridge ready on port ${WEBSOCKET_PORT} — project: ${PROJECT_ROOT}`);
  } catch (err: any) {
    gessoLog('warn', SERVER_NAME, `Failed to start WebSocket on port ${WEBSOCKET_PORT}: ${err.message}`);
    gessoLog('warn', SERVER_NAME, 'Headless & filesystem tools still work; live editor tools may be unavailable.');
  }
}

export { editorBridge, PROJECT_ROOT, SERVER_NAME, SERVER_VERSION, WEBSOCKET_PORT };

// Bootstrap MCP Server
async function main() {
  await ensureBridgeStarted({ releaseStale: true });

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

const isMainModule =
  process.argv[1] && normalize(resolve(process.argv[1])) === normalize(__filename);

if (isMainModule) {
  main().catch((err) => {
    gessoLog('error', SERVER_NAME, `Startup failed: ${err}`);
    process.exit(1);
  });
}
