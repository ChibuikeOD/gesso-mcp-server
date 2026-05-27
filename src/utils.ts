import { join, dirname, normalize, resolve as resolvePath } from 'path';
import { existsSync, readdirSync } from 'fs';
import { createServer } from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type GessoLogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_RANK: Record<GessoLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** MCP servers must log to stderr; Cursor labels all stderr as [error]. Default warn keeps the panel quiet. */
export function gessoLog(
  level: GessoLogLevel,
  scope: string,
  message: string
): void {
  const configured = (process.env.GESSO_LOG_LEVEL ?? 'warn').toLowerCase() as GessoLogLevel;
  const minRank = LOG_LEVEL_RANK[configured] ?? LOG_LEVEL_RANK.warn;
  if (LOG_LEVEL_RANK[level] < minRank) {
    return;
  }
  const line = `[${new Date().toISOString()}] [${scope}] [${level.toUpperCase()}] ${message}`;
  console.error(line);
}

export interface OperationParams {
  [key: string]: any;
}

export const PARAMETER_MAPPINGS: Record<string, string> = {
  'project_path': 'projectPath',
  'scene_path': 'scenePath',
  'root_node_type': 'rootNodeType',
  'parent_node_path': 'parentNodePath',
  'node_type': 'nodeType',
  'node_name': 'nodeName',
  'texture_path': 'texturePath',
  'node_path': 'nodePath',
  'output_path': 'outputPath',
  'mesh_item_names': 'meshItemNames',
  'new_path': 'newPath',
  'file_path': 'filePath',
  'directory': 'directory',
  'recursive': 'recursive',
  'scene': 'scene',
  'type_hint': 'typeHint',
  'parent_path': 'parentPath',
  'signal_name': 'signalName',
  'target_path': 'targetPath',
  'class_name': 'className',
  'root_path': 'rootPath',
  'new_parent_path': 'newParentPath',
  'keep_global_transform': 'keepGlobalTransform',
  'script_path': 'scriptPath',
  'resource_type': 'resourceType',
  'resource_path': 'resourcePath',
  'final_value': 'finalValue',
  'trans_type': 'transType',
  'ease_type': 'easeType',
  'directory_path': 'directoryPath',
  'from_x': 'fromX',
  'from_y': 'fromY',
  'to_x': 'toX',
  'to_y': 'toY',
  'project_name': 'projectName',
  'action_name': 'actionName',
  'param_name': 'paramName',
  'shape_type': 'shapeType',
  'shape_params': 'shapeParams',
  'bus_name': 'busName',
  'from_position': 'fromPosition',
  'collision_layer': 'collisionLayer',
  'collision_mask': 'collisionMask',
  'source_id': 'sourceId',
  'atlas_x': 'atlasX',
  'atlas_y': 'atlasY',
  'alt_tile': 'altTile',
  'background_mode': 'backgroundMode',
  'background_color': 'backgroundColor',
  'ambient_light_color': 'ambientLightColor',
  'ambient_light_energy': 'ambientLightEnergy',
  'fog_enabled': 'fogEnabled',
  'fog_density': 'fogDensity',
  'fog_light_color': 'fogLightColor',
  'glow_enabled': 'glowEnabled',
  'glow_intensity': 'glowIntensity',
  'glow_bloom': 'glowBloom',
  'tonemap_mode': 'tonemapMode',
  'ssao_enabled': 'ssaoEnabled',
  'ssao_radius': 'ssaoRadius',
  'ssao_intensity': 'ssaoIntensity',
  'ssr_enabled': 'ssrEnabled',
  'wait_time': 'waitTime',
  'one_shot': 'oneShot',
  'speed_scale': 'speedScale',
  'process_material': 'processMaterial',
  'initial_velocity_min': 'initialVelocityMin',
  'initial_velocity_max': 'initialVelocityMax',
  'scale_min': 'scaleMin',
  'scale_max': 'scaleMax',
  'animation_name': 'animationName',
  'loop_mode': 'loopMode',
  'max_depth': 'maxDepth',
  'gravity_scale': 'gravityScale',
  'linear_velocity': 'linearVelocity',
  'angular_velocity': 'angularVelocity',
  'linear_damp': 'linearDamp',
  'angular_damp': 'angularDamp',
  'joint_type': 'jointType',
  'node_a_path': 'nodeAPath',
  'node_b_path': 'nodeBPath',
  'rest_length': 'restLength',
  'initial_offset': 'initialOffset',
  'bone_index': 'boneIndex',
  'bone_name': 'boneName',
  'font_sizes': 'fontSizes',
  'transparent_bg': 'transparentBg',
  'render_target_update_mode': 'renderTargetUpdateMode',
  'preset_name': 'presetName',
  'max_clients': 'maxClients',
  'mouse_mode': 'mouseMode',
  'time_scale': 'timeScale',
  'gravity_direction': 'gravityDirection',
  'physics_fps': 'physicsFps',
  'csg_type': 'csgType',
  'mesh_type': 'meshType',
  'light_type': 'lightType',
  'spot_angle': 'spotAngle',
  'effect_type': 'effectType',
  'gi_type': 'giType',
  'sky_type': 'skyType',
  'top_color': 'topColor',
  'bottom_color': 'bottomColor',
  'sun_energy': 'sunEnergy',
  'ground_color': 'groundColor',
  'dof_blur_far': 'dofBlurFar',
  'dof_blur_near': 'dofBlurNear',
  'dof_blur_amount': 'dofBlurAmount',
  'exposure_multiplier': 'exposureMultiplier',
  'auto_exposure': 'autoExposure',
  'auto_exposure_scale': 'autoExposureScale',
  'cell_size': 'cellSize',
  'agent_radius': 'agentRadius',
  'agent_height': 'agentHeight',
  'motion_scale': 'motionScale',
  'motion_offset': 'motionOffset',
  'state_name': 'stateName',
  'param_value': 'paramValue',
  'send_to': 'sendTo',
  'max_distance': 'maxDistance',
  'unit_size': 'unitSize',
  'max_db': 'maxDb',
  'attenuation_model': 'attenuationModel',
  'layer_type': 'layerType',
  'plugin_name': 'pluginName',
  'shader_path': 'shaderPath',
  'shader_type': 'shaderType',
  'translation_path': 'translationPath',
  'anchor_preset': 'anchorPreset',
  'mouse_filter': 'mouseFilter',
  'min_size': 'minSize',
  'caret_position': 'caretPosition',
  'selection_from': 'selectionFrom',
  'selection_to': 'selectionTo',
  'item_path': 'itemPath',
  'min_value': 'minValue',
  'max_value': 'maxValue',
  'msaa_2d': 'msaa2d',
  'msaa_3d': 'msaa3d',
  'scaling_mode': 'scalingMode',
  'scaling_scale': 'scalingScale',
  'source_path': 'sourcePath',
  'new_name': 'newName',
};

export const REVERSE_PARAMETER_MAPPINGS: Record<string, string> = Object.fromEntries(
  Object.entries(PARAMETER_MAPPINGS).map(([snake, camel]) => [camel, snake])
);

export function normalizeParameters(params: OperationParams): OperationParams {
  if (!params || typeof params !== 'object') {
    return params;
  }

  const result: OperationParams = {};

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      let normalizedKey = key;

      if (key.includes('_') && PARAMETER_MAPPINGS[key]) {
        normalizedKey = PARAMETER_MAPPINGS[key];
      }

      if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
        result[normalizedKey] = normalizeParameters(params[key] as OperationParams);
      } else {
        result[normalizedKey] = params[key];
      }
    }
  }

  return result;
}

export function convertCamelToSnakeCase(params: OperationParams): OperationParams {
  const result: OperationParams = {};

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      const snakeKey = REVERSE_PARAMETER_MAPPINGS[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

      if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
        result[snakeKey] = convertCamelToSnakeCase(params[key] as OperationParams);
      } else {
        result[snakeKey] = params[key];
      }
    }
  }

  return result;
}

export function validatePath(path: string): boolean {
  if (!path || path.includes('..')) {
    return false;
  }
  return true;
}

export function createErrorResponse(message: string): any {
  gessoLog('debug', 'SERVER', `Error response: ${message}`);
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    isError: true,
  };
}

export function isGodot44OrLater(version: string): boolean {
  const match = version.match(/^(\d+)\.(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    return major > 4 || (major === 4 && minor >= 4);
  }
  return false;
}

export async function isValidGodotPath(path: string): Promise<boolean> {
  try {
    if (!existsSync(path)) return false;
    const { stdout } = await execFileAsync(path, ['--version'], { timeout: 2000, windowsHide: true });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function detectGodotPath(workspaceRoot?: string): Promise<string | null> {
  // 1. Check environment variable
  if (process.env.GODOT_PATH) {
    const normalized = normalize(process.env.GODOT_PATH);
    if (await isValidGodotPath(normalized)) return normalized;
  }

  // 2. Check local workspace Godot directory (Windows)
  if (workspaceRoot) {
    const localConsoleExe = normalize(join(workspaceRoot, 'Godot 4', 'Godot_v4.7-dev5_win64_console.exe'));
    if (await isValidGodotPath(localConsoleExe)) return localConsoleExe;

    const localExe = normalize(join(workspaceRoot, 'Godot 4', 'Godot_v4.7-dev5_win64.exe'));
    if (await isValidGodotPath(localExe)) return localExe;

    // Check parent directory
    const parentRoot = dirname(workspaceRoot);
    const parentConsoleExe = normalize(join(parentRoot, 'Godot 4', 'Godot_v4.7-dev5_win64_console.exe'));
    if (await isValidGodotPath(parentConsoleExe)) return parentConsoleExe;

    const parentExe = normalize(join(parentRoot, 'Godot 4', 'Godot_v4.7-dev5_win64.exe'));
    if (await isValidGodotPath(parentExe)) return parentExe;
  }

  // 3. Fallback to system check
  const osPlatform = process.platform;
  const possiblePaths: string[] = ['godot'];

  if (osPlatform === 'win32') {
    possiblePaths.push(
      'C:\\Program Files\\Godot\\Godot.exe',
      'C:\\Program Files (x86)\\Godot\\Godot.exe',
      'C:\\Program Files\\Godot_4\\Godot.exe',
      'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
      `${process.env.USERPROFILE}\\Godot\\Godot.exe`
    );
  } else if (osPlatform === 'darwin') {
    possiblePaths.push(
      '/Applications/Godot.app/Contents/MacOS/Godot',
      '/Applications/Godot_4.app/Contents/MacOS/Godot',
      `${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`
    );
  } else {
    possiblePaths.push('/usr/bin/godot', '/usr/local/bin/godot');
  }

  for (const path of possiblePaths) {
    if (path === 'godot') {
      try {
        const { stdout } = await execFileAsync('godot', ['--version'], { timeout: 1000, windowsHide: true });
        if (stdout.trim().length > 0) return 'godot';
      } catch {}
    } else {
      if (await isValidGodotPath(path)) return path;
    }
  }

  return null;
}

/** Resolve Godot project folder (directory containing project.godot). */
export function resolveProjectRoot(serverName: string): string {
  const envRoot = process.env.GESSO_PROJECT_ROOT?.trim();
  if (envRoot) {
    const resolved = resolvePath(envRoot);
    if (existsSync(join(resolved, 'project.godot'))) {
      return resolved;
    }
    console.error(`[${serverName}] GESSO_PROJECT_ROOT has no project.godot: ${resolved}`);
  }

  const cwd = process.cwd();
  if (existsSync(join(cwd, 'project.godot'))) {
    return cwd;
  }

  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = join(cwd, entry.name);
        if (existsSync(join(subPath, 'project.godot'))) {
          return subPath;
        }
      }
    }
  } catch {
    // ignore
  }

  return cwd;
}

/** Bind to port 0 and return the allocated ephemeral port (always released before resolve). */
export async function reserveEphemeralPort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const tester = createServer();
    tester.once('error', reject);
    tester.listen(0, host, () => {
      const addr = tester.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      tester.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

export async function isPortInUse(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.close(() => resolve(false));
      })
      .listen(port, host);
  });
}

/**
 * Stop a stale gesso-mcp-server Node process that is still listening on the
 * WebSocket port so this instance can bind and share state with Cursor stdio.
 */
export async function releaseStaleGessoServerOnPort(port: number): Promise<boolean> {
  if (!(await isPortInUse(port))) {
    return false;
  }

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1`,
        ],
        { timeout: 8000, windowsHide: true }
      );
      const pid = parseInt(stdout.trim(), 10);
      if (!pid || pid === process.pid) {
        return false;
      }

      const { stdout: cmdLine } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { timeout: 5000, windowsHide: true }
      );
      if (!cmdLine.includes('gesso-mcp-server')) {
        gessoLog(
          'warn',
          'Gesso',
          `Port ${port} is used by PID ${pid} (not gesso-mcp-server). Close that app or set GESSO_PORT.`
        );
        return false;
      }

      await execFileAsync('taskkill', ['/PID', String(pid), '/F'], { timeout: 5000, windowsHide: true });
      await new Promise((r) => setTimeout(r, 400));
      return true;
    } catch {
      return false;
    }
  }

  // Unix: best-effort lsof/fuser not implemented; caller handles EADDRINUSE
  return false;
}
