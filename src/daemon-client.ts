/**
 * Ensure the bridge daemon is running and invoke tools via the TCP control plane.
 */
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_CTRL_PORT,
  invokeViaControl,
  pingControlServer,
  waitForControlServer,
} from './bridge-control.js';
import { resolveProjectRoot, gessoLog } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getControlPort(): number {
  return parseInt(process.env.GESSO_CTRL_PORT ?? String(DEFAULT_CTRL_PORT), 10);
}

export async function ensureBridgeDaemon(): Promise<void> {
  const ctrlPort = getControlPort();
  if (await pingControlServer(ctrlPort, 800)) {
    return;
  }

  const projectRoot = resolveProjectRoot('gesso-daemon');
  const daemonScript = join(__dirname, '..', 'scripts', 'bridge-daemon.mjs');
  gessoLog('debug', 'gesso-daemon', `Starting bridge daemon (control port ${ctrlPort})...`);

  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: 'ignore',
    cwd: projectRoot,
    env: { ...process.env, GESSO_PROJECT_ROOT: projectRoot },
    windowsHide: true,
  });
  child.unref();

  const ready = await waitForControlServer(ctrlPort, 20000);
  if (!ready) {
    throw new Error(
      `Bridge daemon did not start on control port ${ctrlPort}. Run: node gesso-mcp-server/scripts/bridge-daemon.mjs`
    );
  }
}

export async function invokeToolViaDaemon(
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  await ensureBridgeDaemon();
  return invokeViaControl(getControlPort(), tool, args);
}
