import { describe, it, expect } from 'vitest';
import {
  resolveRuntimeToolCommand,
  isRuntimeRoutedTool,
  isGameRuntimeTool,
} from '../src/runtime-tool-routing.js';

describe('runtime-tool-routing', () => {
  it('routes game_* tools to runtime', () => {
    expect(isGameRuntimeTool('game_os_info')).toBe(true);
    expect(isRuntimeRoutedTool('game_terrain', {})).toBe(true);
    expect(isRuntimeRoutedTool('read_scene', {})).toBe(false);
  });

  it('strips game_ prefix and applies aliases', () => {
    expect(resolveRuntimeToolCommand('game_os_info')).toBe('os_info');
    expect(resolveRuntimeToolCommand('game_get_ui')).toBe('get_ui_elements');
    expect(resolveRuntimeToolCommand('take_screenshot')).toBe('screenshot');
    expect(resolveRuntimeToolCommand('game_input_sequence')).toBe('input_sequence');
    expect(resolveRuntimeToolCommand('test_input_sequence')).toBe('input_sequence');
    expect(isRuntimeRoutedTool('test_input_sequence', {})).toBe(true);
  });
});
