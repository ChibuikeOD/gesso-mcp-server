import type { ToolDefinition } from '../types.js';

export const ggscaleTools: ToolDefinition[] = [
  {
    name: 'ggscale_manage_server',
    description: 'Start, stop, or query the status of the local gg-scale server (uses Docker Compose). Will attempt to start Docker Desktop on Windows if not running.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform: "start" | "stop" | "status"',
          enum: ['start', 'stop', 'status']
        },
        path: {
          type: 'string',
          description: 'Optional path to the gg-scale repository root. If omitted, it will resolve relative to the current workspace (e.g. "../gg-scale-main").'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'ggscale_bootstrap_tenant',
    description: 'Automatically bootstrap the local gg-scale admin dashboard, sign in, create a tenant and project, and return the generated secret API key.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional path to the gg-scale repository root.'
        },
        email: {
          type: 'string',
          description: 'Optional admin email to create (defaults to "admin@ggscale.local").'
        },
        password: {
          type: 'string',
          description: 'Optional admin password to create (auto-generated if omitted).'
        },
        tenant_name: {
          type: 'string',
          description: 'Optional tenant name to create (defaults to "Default Tenant").'
        },
        project_name: {
          type: 'string',
          description: 'Optional starter project name (defaults to "dev").'
        }
      }
    }
  },
  {
    name: 'ggscale_configure_godot',
    description: 'Configure a Godot 4 project to use gg-scale by generating a comprehensive ggscale.gd Autoload SDK and a demo scene/script.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project root (e.g., "test_project" or absolute path).'
        },
        api_key: {
          type: 'string',
          description: 'The secret gg-scale API key for authentication.'
        },
        server_url: {
          type: 'string',
          description: 'Optional local or remote gg-scale endpoint URL (defaults to "http://localhost:8080").'
        }
      },
      required: ['project_path', 'api_key']
    }
  }
];
