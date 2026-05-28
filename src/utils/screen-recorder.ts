import { spawn, exec, ChildProcess } from 'child_process';
import os from 'os';
import fs from 'fs';
import { join } from 'path';
import { gessoLog, resolveProjectRoot } from '../utils.js';
import { VjepaClient } from './vjepa-client.js';

export interface ScreenContext {
  ok: boolean;
  recording_type: 'ffmpeg' | 'polling' | 'none';
  duration_seconds: number;
  video_path?: string;
  storyboard_path?: string;
  storyboard_base64?: string;
  vjepa_embeddings?: number[][];
  message?: string;
}

export class ScreenRecorder {
  private static instance: ScreenRecorder;
  private ffmpegProcess: ChildProcess | null = null;
  private isRecordingActive = false;
  private recordingStartTimestamp = 0;
  private activeTarget = 'desktop';
  private outputFilePath = '';
  private pollingTimer: NodeJS.Timeout | null = null;
  private polledFrames: string[] = []; // Store base64 frames for fallback
  private maxPolledFrames = 10; // Keep a small sliding window in memory

  private constructor() {}

  public static getInstance(): ScreenRecorder {
    if (!ScreenRecorder.instance) {
      ScreenRecorder.instance = new ScreenRecorder();
    }
    return ScreenRecorder.instance;
  }

  /**
   * Helper to execute CLI commands asynchronously.
   */
  private execPromise(cmd: string): Promise<string> {
    return new Promise((resolve) => {
      exec(cmd, (error, stdout) => {
        resolve(stdout || '');
      });
    });
  }

  /**
   * Checks if FFmpeg is installed and accessible.
   */
  public async checkFFmpegInstalled(): Promise<boolean> {
    const stdout = await this.execPromise('ffmpeg -version');
    return stdout.includes('ffmpeg version');
  }

  /**
   * Detects the best available video encoder on the system (GPU vs. CPU fallback).
   */
  public async detectBestEncoder(): Promise<string> {
    const stdout = await this.execPromise('ffmpeg -encoders');
    const encoders = stdout.toLowerCase();
    const platform = os.platform();

    if (platform === 'win32') {
      if (encoders.includes('h264_nvenc')) return 'h264_nvenc';
      if (encoders.includes('h264_qsv')) return 'h264_qsv';
      if (encoders.includes('h264_amf')) return 'h264_amf';
    } else if (platform === 'darwin') {
      if (encoders.includes('h264_videotoolbox')) return 'h264_videotoolbox';
    } else if (platform === 'linux') {
      if (encoders.includes('h264_nvenc')) return 'h264_nvenc';
      if (encoders.includes('h264_vaapi')) return 'h264_vaapi';
    }

    // Default universal software CPU encoder
    return 'libx264';
  }

  /**
   * Checks if ddagrab (DXGI Desktop Duplication) filter is supported.
   */
  public async hasDdagrab(): Promise<boolean> {
    if (os.platform() !== 'win32') return false;
    const stdout = await this.execPromise('ffmpeg -h filter=ddagrab');
    return stdout.includes('ddagrab');
  }

  /**
   * Starts a screen recording session.
   * Capped at low FPS (1-2) to be extremely memory/CPU efficient.
   */
  public async startRecording(
    editorBridgeInvoke: (tool: string, args: any) => Promise<any>,
    target = 'desktop',
    fps = 2
  ): Promise<{ success: boolean; message: string }> {
    if (this.isRecordingActive) {
      return { success: false, message: 'Screen recording is already active.' };
    }

    const projectRoot = resolveProjectRoot('gesso-mcp-server');
    const recordingsDir = join(projectRoot, '.gesso_recordings');
    
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    this.outputFilePath = join(recordingsDir, `recording_${Date.now()}.mp4`);
    this.activeTarget = target;
    this.recordingStartTimestamp = Date.now();
    this.isRecordingActive = true;

    const ffmpegAvailable = await this.checkFFmpegInstalled();

    if (ffmpegAvailable) {
      try {
        const platform = os.platform();
        const encoder = await this.detectBestEncoder();
        const args: string[] = [];

        // Build OS-specific capture source
        if (platform === 'win32') {
          const ddagrabSupported = await this.hasDdagrab();
          if (ddagrabSupported) {
            args.push('-f', 'ddagrab', '-framerate', String(fps), '-i', 'desktop');
          } else {
            args.push('-f', 'gdigrab', '-framerate', String(fps), '-i', 'desktop');
          }
        } else if (platform === 'darwin') {
          args.push('-f', 'avfoundation', '-framerate', String(fps), '-i', '1:none');
        } else {
          // Linux
          const display = process.env.DISPLAY || ':0.0';
          args.push('-f', 'x11grab', '-framerate', String(fps), '-i', display);
        }

        // Configure H.264 Encoder settings
        args.push('-c:v', encoder);
        if (encoder === 'libx264') {
          // Fast encoding preset for software rendering with low CPU hit
          args.push('-preset', 'ultrafast', '-crf', '28');
        }
        
        // Force overwrite output file and output format
        args.push('-y', this.outputFilePath);

        gessoLog('info', 'screen-recorder', `Spawning FFmpeg with args: ffmpeg ${args.join(' ')}`);
        
        this.ffmpegProcess = spawn('ffmpeg', args, {
          detached: true,
          stdio: 'ignore',
        });

        this.ffmpegProcess.unref();

        return {
          success: true,
          message: `Hardware-optimized screen recording started in the background using FFmpeg (${encoder}). Output will be saved to ${this.outputFilePath}`,
        };
      } catch (err: any) {
        gessoLog('warn', 'screen-recorder', `FFmpeg startup failed: ${err.message}. Falling back to Node-based screenshot polling.`);
      }
    }

    // Node-based polling fallback using Gesso Godot Plugin's capture tool
    gessoLog('info', 'screen-recorder', 'FFmpeg not found or failed. Starting Godot screenshot polling loop.');
    this.polledFrames = [];
    this.ffmpegProcess = null;

    // Grab a frame immediately
    await this.pollFrame(editorBridgeInvoke);

    // Poll at 1 FPS (1000ms intervals) to remain memory/CPU friendly
    this.pollingTimer = setInterval(async () => {
      await this.pollFrame(editorBridgeInvoke);
    }, 1000);

    return {
      success: true,
      message: 'FFmpeg not found. Gesso has initiated a memory-efficient screenshot polling loop (1 FPS) using the Godot editor plugin WebSocket bridge.',
    };
  }

  /**
   * Helper to poll a screenshot frame from the editorBridge.
   */
  private async pollFrame(editorBridgeInvoke: (tool: string, args: any) => Promise<any>) {
    try {
      // Map targets to godot capture_screen targets
      const targetMap: Record<string, string> = {
        desktop: 'fullscreen',
        game: 'game',
        editor: 'editor',
      };
      
      const captureTarget = targetMap[this.activeTarget] || 'fullscreen';
      const response = await editorBridgeInvoke('capture_screen', {
        target: captureTarget,
        return_base64: true,
      });

      if (response && response.ok && response.base64_png) {
        this.polledFrames.push(response.base64_png);
        // Maintain rolling ring buffer (only keep last N frames)
        if (this.polledFrames.length > this.maxPolledFrames) {
          this.polledFrames.shift();
        }
      }
    } catch (err: any) {
      gessoLog('error', 'screen-recorder', `Failed to poll frame: ${err.message}`);
    }
  }

  /**
   * Stops the active screen recording session.
   */
  public async stopRecording(): Promise<{ success: boolean; message: string }> {
    if (!this.isRecordingActive) {
      return { success: false, message: 'No active screen recording session is running.' };
    }

    this.isRecordingActive = false;

    if (this.ffmpegProcess) {
      // Kill the FFmpeg process gracefully by sending SIGTERM or 'q'
      try {
        gessoLog('info', 'screen-recorder', 'Stopping FFmpeg process gracefully.');
        this.ffmpegProcess.kill('SIGTERM');
        this.ffmpegProcess = null;
      } catch (err: any) {
        gessoLog('error', 'screen-recorder', `Error stopping FFmpeg process: ${err.message}`);
      }
      
      return {
        success: true,
        message: `FFmpeg recording complete. Output saved to ${this.outputFilePath}`,
      };
    }

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      return {
        success: true,
        message: `Polled screen recording complete. Collected ${this.polledFrames.length} frames in memory.`,
      };
    }

    return { success: true, message: 'Screen recording stopped.' };
  }

  /**
   * Compiles the recorded frames into a visual-semantic history block.
   */
  public async compileContext(
    includeStoryboard = true,
    includeVjepa = true
  ): Promise<ScreenContext> {
    const elapsedSeconds = Math.round((Date.now() - this.recordingStartTimestamp) / 1000);
    const result: ScreenContext = {
      ok: true,
      recording_type: this.ffmpegProcess ? 'ffmpeg' : (this.pollingTimer || this.polledFrames.length > 0 ? 'polling' : 'none'),
      duration_seconds: elapsedSeconds,
    };

    if (result.recording_type === 'none') {
      return { ok: false, recording_type: 'none', duration_seconds: 0, message: 'No recorded frame data available.' };
    }

    // Case 1: FFmpeg recording compiled
    if (result.recording_type === 'ffmpeg' && fs.existsSync(this.outputFilePath)) {
      result.video_path = this.outputFilePath;

      if (includeStoryboard) {
        const projectRoot = resolveProjectRoot('gesso-mcp-server');
        const storyboardPath = join(projectRoot, '.gesso_recordings', `storyboard_${Date.now()}.jpg`);
        
        // Sampling rate: 4 frames spread evenly across the video duration
        // We compile a 2x2 storyboard using FFmpeg's tile filter
        const sampleFps = elapsedSeconds > 0 ? Math.max(0.1, 4 / elapsedSeconds) : 1;
        const ffmpegCmd = `ffmpeg -y -i "${this.outputFilePath}" -vf "fps=${sampleFps},scale=480:-1,tile=2x2" -frames:v 1 "${storyboardPath}"`;
        
        gessoLog('info', 'screen-recorder', `Compiling storyboard using FFmpeg command: ${ffmpegCmd}`);
        await this.execPromise(ffmpegCmd);

        if (fs.existsSync(storyboardPath)) {
          result.storyboard_path = storyboardPath;
          const imageBuffer = fs.readFileSync(storyboardPath);
          result.storyboard_base64 = imageBuffer.toString('base64');
        }
      }

      // V-JEPA Embedding calculation
      if (includeVjepa) {
        const vjepaClient = VjepaClient.getInstance();
        const health = await vjepaClient.checkHealth();
        if (health) {
          gessoLog('info', 'screen-recorder', 'V-JEPA Service detected. Extracting video frames for latents.');
          const projectRoot = resolveProjectRoot('gesso-mcp-server');
          const framesDir = join(projectRoot, '.gesso_recordings', `temp_frames_${Date.now()}`);
          fs.mkdirSync(framesDir, { recursive: true });

          // Extract up to 5 keyframes
          const sampleFps = elapsedSeconds > 0 ? Math.max(0.1, 5 / elapsedSeconds) : 1;
          const extractCmd = `ffmpeg -y -i "${this.outputFilePath}" -vf "fps=${sampleFps},scale=224:224" "${framesDir}/frame_%d.jpg"`;
          await this.execPromise(extractCmd);

          if (fs.existsSync(framesDir)) {
            const files = fs.readdirSync(framesDir).sort((a, b) => {
              const numA = parseInt(a.replace('frame_', '').replace('.jpg', ''), 10);
              const numB = parseInt(b.replace('frame_', '').replace('.jpg', ''), 10);
              return numA - numB;
            });

            const embeddings: number[][] = [];
            for (const file of files) {
              const filePath = join(framesDir, file);
              const frameB64 = fs.readFileSync(filePath).toString('base64');
              const latent = await vjepaClient.encodeFrame(frameB64);
              if (latent) {
                embeddings.push(latent);
              }
              // Cleanup frame file
              try { fs.unlinkSync(filePath); } catch {}
            }
            try { fs.rmdirSync(framesDir); } catch {}

            result.vjepa_embeddings = embeddings;
          }
        }
      }
    } 
    // Case 2: Polled screenshots fallback compiled
    else if (result.recording_type === 'polling' && this.polledFrames.length > 0) {
      // Pick 4 frames spread evenly for our storyboard
      const length = this.polledFrames.length;
      if (includeStoryboard) {
        // Return frames directly in base64. If we have multiple, we sample them.
        if (length <= 4) {
          // Send all of them as base64 list
          result.storyboard_base64 = this.polledFrames[length - 1]; // Main/final keyframe
          result.message = `Node polling mode active. Captured ${length} frames. Returning latest frame as storyboard_base64.`;
        } else {
          // Sample 4 indices
          const idxs = [0, Math.floor(length / 3), Math.floor((2 * length) / 3), length - 1];
          const sampledFrames = idxs.map(i => this.polledFrames[i]);
          
          // Since stitching in Node without packages is complex, we pass the latest frame
          // and let the agent know we have a sequence of frames. We can pack them in a JSON message list.
          result.storyboard_base64 = this.polledFrames[length - 1];
          result.message = `Node polling mode active. Captured ${length} frames. Returning final frame as storyboard_base64.`;
        }
      }

      if (includeVjepa) {
        const vjepaClient = VjepaClient.getInstance();
        const health = await vjepaClient.checkHealth();
        if (health) {
          gessoLog('info', 'screen-recorder', 'V-JEPA Service detected. Encoding polled frames.');
          // Encode up to 5 polled frames
          const sampleCount = Math.min(5, length);
          const embeddings: number[][] = [];
          for (let i = 0; i < sampleCount; i++) {
            const idx = Math.floor((i * length) / sampleCount);
            const frameB64 = this.polledFrames[idx];
            const latent = await vjepaClient.encodeFrame(frameB64);
            if (latent) {
              embeddings.push(latent);
            }
          }
          result.vjepa_embeddings = embeddings;
        }
      }
    }

    return result;
  }
}
