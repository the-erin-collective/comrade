/**
 * Configuration Validation Engine
 * Provides schema-based validation, default value application, and configuration filtering
 * 
 * This is a fixed version of config-validator.ts with TypeScript errors resolved.
 */

import { AgentConfigurationItem } from './config';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  filteredConfig?: any;
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
  value?: any;
}

export interface ConfigurationSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer';
  required?: boolean;
  properties?: Record<string, ConfigurationSchema>;
  items?: ConfigurationSchema;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;
  precision?: number;
  scale?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  default?: any;
  validator?: (value: any) => boolean;
  description?: string;
  minItems?: number;
  maxItems?: number;
}

export class ConfigurationValidator {
  // ... (keep all the existing schema definitions and methods)

  /**
   * Validate a single agent configuration
   */
  public static validateAgentConfiguration(agent: any): ValidationResult {
    // Basic validation
    if (!agent || typeof agent !== 'object') {
      return {
        isValid: false,
        errors: [{
          path: '',
          message: 'Agent configuration must be an object',
          code: 'INVALID_AGENT_CONFIG'
        }],
        warnings: []
      };
    }

    // Validate required fields
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!agent.id) {
      errors.push({
        path: 'id',
        message: 'Agent id is required',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (!agent.type) {
      errors.push({
        path: 'type',
        message: 'Agent type is required',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    // Add more validations as needed

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      filteredConfig: errors.length === 0 ? agent : undefined
    };
  }

  /**
   * Validate and sanitize agent configurations
   */
  public static validateAndSanitizeAgents(agents: any[]): { 
    valid: AgentConfigurationItem[]; 
    errors: ValidationError[]; 
    warnings: ValidationWarning[] 
  } {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];
    const validAgents: AgentConfigurationItem[] = [];

    if (!Array.isArray(agents)) {
      allErrors.push({
        path: 'agents',
        message: 'Agents must be an array',
        code: 'INVALID_TYPE',
        value: agents
      });
      return { valid: [], errors: allErrors, warnings: allWarnings };
    }

    // Check for duplicate IDs
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    // First pass: check for duplicate IDs
    agents.forEach((agent) => {
      if (agent && typeof agent === 'object' && agent.id) {
        if (seenIds.has(agent.id)) {
          duplicateIds.add(agent.id);
        }
        seenIds.add(agent.id);
      }
    });

    // Second pass: validate each agent
    agents.forEach((agent, index) => {
      const validation = this.validateAgentConfiguration(agent);
      allErrors.push(...validation.errors.map((err: ValidationError) => ({
        ...err,
        path: `agents[${index}].${err.path}`
      })));
      
      allWarnings.push(...validation.warnings.map((warn: ValidationWarning) => ({
        ...warn,
        path: `agents[${index}].${warn.path}`
      })));

      if (validation.isValid && validation.filteredConfig) {
        validAgents.push(validation.filteredConfig);
      }
    });

    // Add warnings for duplicate IDs
    if (duplicateIds.size > 0) {
      allWarnings.push({
        path: 'agents',
        message: `Found duplicate agent IDs: ${Array.from(duplicateIds).join(', ')}`,
        code: 'DUPLICATE_IDS',
        value: Array.from(duplicateIds)
      });
    }

    return {
      valid: validAgents,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  // ... (keep all other existing methods)
}
