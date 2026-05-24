/**
 * Asset generation tools for Godot MCP Server.
 *
 * NOTE: RunningHub workflow tools (inspect_runninghub_workflow,
 * customize_and_run_workflow) exist in the Godot plugin but are not
 * exposed as MCP tools yet. They require a RunningHub account / API key
 * and will be re-enabled in a future release.  The GDScript implementations
 * in asset_tools.gd are kept intact.
 */

import type { ToolDefinition } from '../types.js';

export const assetTools: ToolDefinition[] = [
  {
    name: 'generate_2d_asset',
    description: 'Render an SVG to a PNG asset on disk via Image.load_svg_from_buffer. The SVG is rendered directly from bytes \u2014 no temp file is created, so concurrent calls are safe and project-rename quirks (user:// rebinding) cannot break it. Returns resource_path, absolute_path, dimensions {width,height}, and the render_scale used.',
    inputSchema: {
      type: 'object',
      properties: {
        svg_code: {
          type: 'string',
          description: 'Complete SVG markup. Either single or double quotes are accepted in attributes.'
        },
        filename: {
          type: 'string',
          description: 'Output filename. ".png" appended if missing.'
        },
        save_path: {
          type: 'string',
          description: 'Destination directory (default: res://assets/generated/). Created if it does not exist.'
        },
        width: {
          type: 'number',
          description: 'Optional desired output width in pixels. Combined with the SVG\'s intrinsic width to derive a uniform render_scale.'
        },
        height: {
          type: 'number',
          description: 'Optional desired output height in pixels. Same as width but matched on the height axis. If both width and height are provided, width takes precedence for scale derivation.'
        },
        scale: {
          type: 'number',
          description: 'Optional explicit render scale (e.g. 2.0 = 2x). Overrides width/height-derived scaling. Default: 1.0.'
        }
      },
      required: ['svg_code', 'filename']
    }
  },
  {
    name: 'search_assets',
    description: 'Search the internet (via DuckDuckGo) for free game assets (2D art, 3D models, textures, audio, fonts) matching a query. Returns title, page link, and description snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search terms, e.g., "pixel art coins", "footstep sound ogg", "sci-fi skybox"'
        },
        source: {
          type: 'string',
          description: 'Optional site filter restriction: "opengameart.org" | "kenney.nl" | "polyhaven.com" | "itch.io"'
        },
        limit: {
          type: 'number',
          description: 'Optional max results to return (default: 10)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'inspect_asset_page',
    description: 'Fetch and parse an asset webpage (like OpenGameArt or Kenney) to extract direct download URLs, preview images/audio, and license details.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Webpage URL to inspect'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'download_asset',
    description: 'Download an asset file from a URL, save it to a project directory path, and optionally auto-extract it if it is a ZIP archive.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Direct download URL of the asset file'
        },
        destination_path: {
          type: 'string',
          description: 'The target project folder or filename (e.g., "res://assets/sound/laser.wav" or "res://assets/textures/")'
        },
        auto_extract: {
          type: 'boolean',
          description: 'If true, and the download is a ZIP file, it will be automatically extracted to the destination_path folder'
        }
      },
      required: ['url', 'destination_path']
    }
  }
];
