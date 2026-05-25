/**
 * Local TCP control plane so CLI tools can invoke Gesso without spawning a new MCP server.
 */
import { createServer, type Server, connect, type Socket } from 'net';
import { randomUUID } from 'crypto';

export const DEFAULT_CTRL_PORT = 6506;

export interface ControlInvokeRequest {
  type: 'invoke';
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface ControlPingRequest {
  type: 'ping';
  id: string;
}

export type ControlRequest = ControlInvokeRequest | ControlPingRequest;

export interface ControlResponse {
  type: 'result' | 'error' | 'pong';
  id: string;
  result?: unknown;
  message?: string;
}

export function startControlServer(
  port: number,
  onInvoke: (tool: string, args: Record<string, unknown>) => Promise<unknown>
): Server {
  const server = createServer((socket) => {
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          void handleLine(socket, line, onInvoke);
        }
        newline = buffer.indexOf('\n');
      }
    });
  });

  server.listen(port, '127.0.0.1');
  return server;
}

async function handleLine(
  socket: Socket,
  line: string,
  onInvoke: (tool: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  let req: ControlRequest;
  try {
    req = JSON.parse(line) as ControlRequest;
  } catch {
    writeResponse(socket, { type: 'error', id: '', message: 'Invalid JSON' });
    return;
  }

  if (req.type === 'ping') {
    writeResponse(socket, { type: 'pong', id: req.id });
    return;
  }

  try {
    const result = await onInvoke(req.tool, req.args ?? {});
    writeResponse(socket, { type: 'result', id: req.id, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeResponse(socket, { type: 'error', id: req.id, message });
  }
}

function writeResponse(socket: Socket, res: ControlResponse): void {
  socket.write(`${JSON.stringify(res)}\n`);
}

export async function waitForControlServer(port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingControlServer(port, 500)) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

export async function pingControlServer(port: number, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await sendControlRequest(port, { type: 'ping', id: randomUUID() }, timeoutMs);
    return res.type === 'pong';
  } catch {
    return false;
  }
}

export async function invokeViaControl(
  port: number,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 120000
): Promise<unknown> {
  const res = await sendControlRequest(
    port,
    { type: 'invoke', id: randomUUID(), tool, args },
    timeoutMs
  );
  if (res.type === 'error') {
    throw new Error(res.message ?? 'Control invoke failed');
  }
  return res.result;
}

function sendControlRequest(
  port: number,
  request: ControlRequest,
  timeoutMs: number
): Promise<ControlResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Control server timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      clearTimeout(timer);
      socket.end();
      try {
        resolve(JSON.parse(buffer.slice(0, newline)) as ControlResponse);
      } catch (err) {
        reject(err);
      }
    });

    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}
