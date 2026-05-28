import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScreenRecorder } from '../src/utils/screen-recorder.js';
import { VjepaClient } from '../src/utils/vjepa-client.js';

describe('VjepaClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should be a singleton', () => {
    const instance1 = VjepaClient.getInstance();
    const instance2 = VjepaClient.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should call health endpoint correctly', async () => {
    const mockHealth = {
      status: 'healthy',
      device: 'cuda',
      model_type: 'torchvision_vit_b16',
      latent_dim: 768,
      registered_actions: [],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealth,
    });

    const client = VjepaClient.getInstance();
    const health = await client.checkHealth();
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8765/health', expect.any(Object));
    expect(health).toEqual(mockHealth);
  });

  it('should encode frames to latents', async () => {
    const mockLatent = new Array(768).fill(0.1);
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latent: mockLatent }),
    });

    const client = VjepaClient.getInstance();
    const latent = await client.encodeFrame('base64StringHere');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8765/encode',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ image_b64: 'base64StringHere' }),
      })
    );
    expect(latent).toEqual(mockLatent);
  });
});

describe('ScreenRecorder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should be a singleton', () => {
    const instance1 = ScreenRecorder.getInstance();
    const instance2 = ScreenRecorder.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should detect best encoder fallback', async () => {
    const recorder = ScreenRecorder.getInstance();
    
    // Stub execPromise internally to return specific encoder lists
    const execSpy = vi.spyOn(recorder as any, 'execPromise');
    
    // Case A: NVIDIA nvenc available
    execSpy.mockResolvedValueOnce('H.264 nvenc encoder (h264_nvenc)');
    let encoder = await recorder.detectBestEncoder();
    expect(encoder).toBe('h264_nvenc');

    // Case B: Fallback to libx264
    execSpy.mockResolvedValueOnce('other encoders...');
    encoder = await recorder.detectBestEncoder();
    expect(encoder).toBe('libx264');
  });

  it('should trigger Godot screenshot polling if FFmpeg is not installed', async () => {
    const recorder = ScreenRecorder.getInstance();
    
    // Mock checkFFmpegInstalled to return false
    vi.spyOn(recorder, 'checkFFmpegInstalled').mockResolvedValue(false);
    
    // Mock editor bridge invocation callback
    const invokeSpy = vi.fn().mockResolvedValue({
      ok: true,
      base64_png: 'mockPngData',
    });

    const result = await recorder.startRecording(invokeSpy, 'game', 1);
    
    expect(result.success).toBe(true);
    expect(result.message).toContain('polling loop');
    expect(invokeSpy).toHaveBeenCalledWith('capture_screen', {
      target: 'game',
      return_base64: true,
    });

    await recorder.stopRecording();
  });
});
