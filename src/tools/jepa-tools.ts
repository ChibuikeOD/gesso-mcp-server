/**
 * JEPA World Model tools for Godot MCP Server
 */

import type { ToolDefinition } from '../types.js';

export const jepaTools: ToolDefinition[] = [
  {
    name: 'jepa_encode_frame',
    description: 'Captures the current running game screen (or encodes a provided image file) and encodes it into a JEPA semantic latent embedding using the V-JEPA service.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: {
          type: 'string',
          description: 'Optional res:// path to a saved image file to encode. If not provided, will capture the running game screen.'
        }
      },
      required: []
    }
  },
  {
    name: 'jepa_scene_similarity',
    description: 'Computes the cosine similarity between two latent embedding vectors to determine semantic/visual similarity (e.g. for regression testing, visual glitches, or scene verification).',
    inputSchema: {
      type: 'object',
      properties: {
        latent_1: {
          type: 'array',
          items: { type: 'number' },
          description: 'First latent vector'
        },
        latent_2: {
          type: 'array',
          items: { type: 'number' },
          description: 'Second latent vector'
        }
      },
      required: ['latent_1', 'latent_2']
    }
  },
  {
    name: 'jepa_imagine_next_state',
    description: 'Predicts the next imagined latent embedding vector using the V-JEPA world model predictor, given a current latent vector and a game action.',
    inputSchema: {
      type: 'object',
      properties: {
        latent_context: {
          type: 'array',
          items: { type: 'number' },
          description: 'Current state latent vector representation'
        },
        action: {
          type: 'string',
          description: 'Action name from InputMap (e.g. "ui_right", "ui_left", "jump", "shoot")'
        }
      },
      required: ['latent_context', 'action']
    }
  },
  {
    name: 'jepa_get_status',
    description: 'Retrieves health and status information of the V-JEPA FastAPI microservice, including loaded model config and device information.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];
