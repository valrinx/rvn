import type { McpToolDefinition } from './tools/tool-types.js';

export interface RvnPluginPermission {
  readonly name: string;
  readonly reason: string;
}

export interface RvnSkillDescriptor {
  readonly id: string;
  readonly description: string;
  readonly tags: readonly string[];
}

export interface RvnRecipeDescriptor {
  readonly name: string;
  readonly steps: readonly string[];
}

export interface RvnPlugin {
  readonly id: string;
  readonly version: string;
  readonly tools?: readonly McpToolDefinition[];
  readonly hooks?: readonly string[];
  readonly skills?: readonly RvnSkillDescriptor[];
  readonly recipes?: readonly RvnRecipeDescriptor[];
  readonly requiredPermissions?: readonly RvnPluginPermission[];
}
