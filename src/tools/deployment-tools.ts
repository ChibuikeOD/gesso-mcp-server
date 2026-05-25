import type { ToolDefinition } from '../types.js';

export const deploymentTools: ToolDefinition[] = [
  {
    name: 'list_export_presets',
    description: 'Read the project\'s export_presets.cfg and return all configured export presets (names, platforms, and export paths).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'configure_export_preset',
    description: 'Create or update a default export preset for Windows, macOS, Linux, Android, or iOS in export_presets.cfg. This enables command-line exporting.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'Target platform: "windows" | "mac" | "linux" | "android" | "ios"'
        },
        preset_name: {
          type: 'string',
          description: 'Optional name for the preset (default matches platform name, e.g., "Windows Desktop")'
        },
        export_path: {
          type: 'string',
          description: 'Optional destination file path relative to project root (e.g., "build/windows/game.exe")'
        },
        package_name: {
          type: 'string',
          description: 'Optional mobile application package name / bundle identifier (e.g. "com.example.mygame")'
        },
        options: {
          type: 'object',
          description: 'Optional key-value object containing custom export option overrides.'
        }
      },
      required: ['platform']
    }
  },
  {
    name: 'export_game',
    description: 'Run the Godot headless exporter for a specific preset and build the game executable at the target output path.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          description: 'The export preset name to use (must be defined in export_presets.cfg, e.g. "Windows Desktop")'
        },
        output_path: {
          type: 'string',
          description: 'Target filepath for the export (e.g. "build/windows/game.exe")'
        },
        debug: {
          type: 'boolean',
          description: 'If true, export with debug symbols (defaults to false / release build)'
        }
      },
      required: ['preset', 'output_path']
    }
  },
  {
    name: 'deploy_to_itch',
    description: 'Upload a build folder or ZIP file to itch.io using the Butler CLI tool. Requires butler to be installed and authenticated on the system.',
    inputSchema: {
      type: 'object',
      properties: {
        build_path: {
          type: 'string',
          description: 'Path to the build folder or ZIP archive to upload (e.g. "build/windows/" or "build/windows.zip")'
        },
        target: {
          type: 'string',
          description: 'The itch.io target project in "username/game-slug:channel" format (e.g., "my-user/my-game:windows-64")'
        },
        butler_path: {
          type: 'string',
          description: 'Optional custom path to the butler executable (defaults to "butler")'
        }
      },
      required: ['build_path', 'target']
    }
  },
  {
    name: 'install_export_templates',
    description: 'Download or install Godot export templates for the current Godot version to avoid export template errors.',
    inputSchema: {
      type: 'object',
      properties: {
        local_tpz_path: {
          type: 'string',
          description: 'Optional path to a locally pre-downloaded .tpz or .zip export templates file.'
        },
        download_url: {
          type: 'string',
          description: 'Optional direct URL to download the export templates from.'
        },
        godot_version: {
          type: 'string',
          description: 'Optional Godot version to install templates for (e.g., "4.7.dev5", "4.3.stable"). Auto-detected if omitted.'
        }
      }
    }
  },
  {
    name: 'login_to_itch',
    description: 'Open the user\'s web browser to the itch.io login page to log in or manage credentials.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'create_itch_game_page',
    description: 'Open the user\'s web browser to the itch.io dashboard for creating a new game page.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'generate_android_keystore',
    description: 'Generate a release or debug keystore file using JDK keytool for signing Android APK exports.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: {
          type: 'string',
          description: 'Destination file path relative to project root or res:// (e.g. "res://debug.keystore")'
        },
        password: {
          type: 'string',
          description: 'Optional password for keystore and alias key (defaults to "android")'
        },
        alias: {
          type: 'string',
          description: 'Optional key alias (defaults to "androiddebugkey")'
        },
        common_name: {
          type: 'string',
          description: 'Optional developer name (defaults to "Android Debug")'
        }
      },
      required: ['output_path']
    }
  },
  {
    name: 'list_connected_devices',
    description: 'Check for connected Android USB devices (via adb) and iOS devices/simulators.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'deploy_to_device',
    description: 'Install and automatically launch an exported mobile build (APK/IPA) on a connected device.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'Target platform: "android" | "ios"'
        },
        build_path: {
          type: 'string',
          description: 'Path to the export file (e.g. "build/android/game.apk")'
        },
        package_name: {
          type: 'string',
          description: 'The app package identifier (e.g. "com.example.game")'
        },
        device_id: {
          type: 'string',
          description: 'Optional specific device ID from the connected list.'
        }
      },
      required: ['platform', 'build_path', 'package_name']
    }
  },
  {
    name: 'host_web_build',
    description: 'Start a local HTTP server with COOP/COEP isolation headers to run and test Godot 4 Web builds.',
    inputSchema: {
      type: 'object',
      properties: {
        build_path: {
          type: 'string',
          description: 'Optional path to the web export directory (defaults to "build/web")'
        },
        port: {
          type: 'number',
          description: 'Optional port to start the web server on (defaults to 8000)'
        }
      }
    }
  },
  {
    name: 'deploy_to_vercel',
    description: 'Deploy a web build folder to Vercel hosting platform using the Vercel CLI.',
    inputSchema: {
      type: 'object',
      properties: {
        build_path: {
          type: 'string',
          description: 'Optional path to the web build folder to deploy (defaults to "build/web")'
        },
        production: {
          type: 'boolean',
          description: 'Deploy to production instead of preview (defaults to true)'
        },
        vercel_path: {
          type: 'string',
          description: 'Optional custom path to the vercel executable (defaults to "vercel")'
        }
      }
    }
  }
];
