import { describe, it, expect } from 'vitest';
import {
  normalizeParameters,
  convertCamelToSnakeCase,
  isGodot44OrLater,
} from '../src/utils.js';

describe('Gesso MCP Utilities', () => {
  describe('normalizeParameters', () => {
    it('should map snake_case properties to camelCase', () => {
      const input = {
        project_path: 'res://',
        root_node_type: 'CharacterBody2D',
        wait_time: 1.5,
        some_unknown_prop: 'remains_as_is'
      };

      const expected = {
        projectPath: 'res://',
        rootNodeType: 'CharacterBody2D',
        waitTime: 1.5,
        some_unknown_prop: 'remains_as_is'
      };

      expect(normalizeParameters(input)).toEqual(expected);
    });

    it('should recursively normalize nested objects', () => {
      const input = {
        project_path: 'res://',
        shape_params: {
          radius: 10,
          custom_size: {
            x: 20,
            y: 30
          }
        }
      };

      const expected = {
        projectPath: 'res://',
        shapeParams: {
          radius: 10,
          custom_size: {
            x: 20,
            y: 30
          }
        }
      };

      expect(normalizeParameters(input)).toEqual(expected);
    });
  });

  describe('convertCamelToSnakeCase', () => {
    it('should map camelCase properties to snake_case', () => {
      const input = {
        projectPath: 'res://',
        rootNodeType: 'CharacterBody2D',
        waitTime: 1.5,
        someCustomProp: 'gets_underscores'
      };

      const expected = {
        project_path: 'res://',
        root_node_type: 'CharacterBody2D',
        wait_time: 1.5,
        some_custom_prop: 'gets_underscores'
      };

      expect(convertCamelToSnakeCase(input)).toEqual(expected);
    });
  });

  describe('isGodot44OrLater', () => {
    it('should identify version 4.4 and above correctly', () => {
      expect(isGodot44OrLater('4.4')).toBe(true);
      expect(isGodot44OrLater('4.4-stable')).toBe(true);
      expect(isGodot44OrLater('4.5')).toBe(true);
      expect(isGodot44OrLater('4.7-dev5')).toBe(true);
      expect(isGodot44OrLater('4.3')).toBe(false);
      expect(isGodot44OrLater('3.5')).toBe(false);
    });
  });
});
