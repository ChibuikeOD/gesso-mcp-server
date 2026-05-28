import { gessoLog } from '../utils.js';

const JEPA_PORT = process.env.GESSO_JEPA_PORT ? parseInt(process.env.GESSO_JEPA_PORT, 10) : 8765;
const BASE_URL = `http://localhost:${JEPA_PORT}`;

export interface HealthResponse {
  status: string;
  device: string;
  model_type: string;
  latent_dim: number;
  registered_actions: string[];
}

export class VjepaClient {
  private static instance: VjepaClient;

  private constructor() {}

  public static getInstance(): VjepaClient {
    if (!VjepaClient.instance) {
      VjepaClient.instance = new VjepaClient();
    }
    return VjepaClient.instance;
  }

  /**
   * Encodes a base64-encoded PNG/JPEG frame into a high-dimensional latent embedding.
   */
  async encodeFrame(imageB64: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${BASE_URL}/encode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_b64: imageB64 }),
      });

      if (!response.ok) {
        gessoLog('error', 'vjepa-client', `Failed to encode frame: ${response.statusText}`);
        return null;
      }

      const data = await response.json() as { latent: number[] };
      return data.latent;
    } catch (err: any) {
      gessoLog('error', 'vjepa-client', `V-JEPA encode connection failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Calculates cosine similarity between two latent vectors.
   */
  async calculateSimilarity(latent1: number[], latent2: number[]): Promise<number | null> {
    try {
      const response = await fetch(`${BASE_URL}/similarity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latent_1: latent1, latent_2: latent2 }),
      });

      if (!response.ok) {
        gessoLog('error', 'vjepa-client', `Failed to calculate similarity: ${response.statusText}`);
        return null;
      }

      const data = await response.json() as { similarity: number };
      return data.similarity;
    } catch (err: any) {
      gessoLog('error', 'vjepa-client', `V-JEPA similarity connection failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Predicts the next latent state vector given a starting latent context and action name.
   */
  async predictNextState(latentContext: number[], action: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${BASE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latent_context: latentContext, action }),
      });

      if (!response.ok) {
        gessoLog('error', 'vjepa-client', `Failed to predict next state: ${response.statusText}`);
        return null;
      }

      const data = await response.json() as { z_predicted: number[] };
      return data.z_predicted;
    } catch (err: any) {
      gessoLog('error', 'vjepa-client', `V-JEPA prediction connection failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Checks if the V-JEPA service is active and responsive.
   */
  async checkHealth(): Promise<HealthResponse | null> {
    try {
      const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(1000) });
      if (!response.ok) return null;
      return await response.json() as HealthResponse;
    } catch (err) {
      return null;
    }
  }
}
