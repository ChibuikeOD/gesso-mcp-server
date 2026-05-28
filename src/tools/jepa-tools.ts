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
  },
  {
    name: 'jepa_save_baseline',
    description: 'Launches a scene, waits for the runtime connection, takes a screenshot, encodes the layout using the V-JEPA service, and saves it to `.gesso/baselines/<baseline_name>.json`. Always stops the scene before returning.',
    inputSchema: {
      type: 'object',
      properties: {
        scene_path: {
          type: 'string',
          description: 'Godot scene path (e.g. "res://scenes/brick_breaker/menu.tscn")'
        },
        baseline_name: {
          type: 'string',
          description: 'Name of the baseline file to create (e.g. "menu_start")'
        }
      },
      required: ['scene_path', 'baseline_name']
    }
  },
  {
    name: 'jepa_verify_scene',
    description: 'Launches a scene, captures the visual frame, encodes it, loads the baseline representation, and calculates the similarity. Exits the scene afterward.',
    inputSchema: {
      type: 'object',
      properties: {
        scene_path: {
          type: 'string',
          description: 'Godot scene path'
        },
        baseline_name: {
          type: 'string',
          description: 'Name of the baseline file to load'
        },
        threshold: {
          type: 'number',
          description: 'Cosine similarity threshold (default: 0.95)'
        }
      },
      required: ['scene_path', 'baseline_name']
    }
  },
  {
    name: 'jepa_run_playtest',
    description: 'Launches a scene and runs an automated playtest sequence. Simulates inputs, tracks visual similarity across frames to detect rendering/freeze glitches, and outputs a summary including Godot errors.',
    inputSchema: {
      type: 'object',
      properties: {
        scene_path: {
          type: 'string',
          description: 'Godot scene path to playtest'
        },
        steps: {
          type: 'number',
          description: 'Number of interactive steps to execute (default: 15)'
        },
        threshold: {
          type: 'number',
          description: 'Similarity threshold for freeze/anomaly detection (default: 0.95)'
        }
      },
      required: ['scene_path']
    }
  },
  {
    name: 'start_screen_recording',
    description: 'Starts a memory-efficient background screen recording session. Automatically detects OS and GPU encoders, falling back to CPU software rendering or native screenshot polling.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['desktop', 'game', 'editor'],
          description: 'Target to capture (default: "desktop")'
        },
        fps: {
          type: 'number',
          description: 'Framerate to capture, between 1 and 5 FPS (default: 2)'
        }
      },
      required: []
    }
  },
  {
    name: 'stop_screen_recording',
    description: 'Stops the active screen recording session and stops saving frames to disk/memory.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_screen_context',
    description: 'Retrieves the visual-semantic context of the last recorded session. Compiles a 2x2 storyboard grid of screenshots and/or fetches V-JEPA latent vectors.',
    inputSchema: {
      type: 'object',
      properties: {
        include_storyboard: {
          type: 'boolean',
          description: 'Compile and return a 2x2 tiled image of keyframes (default: true)'
        },
        include_vjepa: {
          type: 'boolean',
          description: 'Request 768-dimensional V-JEPA latent embeddings from the local service (default: true)'
        }
      },
      required: []
    }
  }
];

