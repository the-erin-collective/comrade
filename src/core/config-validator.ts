/**
 * Configuration Validation Engine
 * Provides schema-based validation, default value application, and configuration filtering
 */

import { AgentConfigurationItem, MCPServerConfig, ComradeConfiguration } from './config';
import { LLMProvider, AgentCapabilities } from './agent';

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
  // Numeric constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;
  precision?: number;  // Maximum number of significant digits
  scale?: number;      // Maximum number of decimal places
  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  // Other
  default?: any;
  validator?: (value: any) => boolean;
  description?: string;
  // Deprecated - for backward compatibility
  minItems?: number;
  maxItems?: number;
}

export class ConfigurationValidator {
  public static readonly AGENT_SCHEMA: ConfigurationSchema = {
    type: 'object',
    required: true,
    properties: {
      id: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_-]+$/,
        description: 'Unique identifier for the agent'
      },
      name: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 200,
        description: 'Display name for the agent'
      },
      provider: {
        type: 'string',
        required: true,
        enum: ['openai', 'anthropic', 'ollama', 'custom'],
        description: 'AI provider type'
      },
      model: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 100,
        description: 'Model identifier'
      },
      endpoint: {
        type: 'string',
        required: false,
        pattern: /^https?:\/\/.+/,
        description: 'Custom endpoint URL'
      },
      temperature: {
        type: 'number',
        required: false,
        minimum: 0,
        maximum: 2,
        default: 0.7,
        description: 'Sampling temperature'
      },
      maxTokens: {
        type: 'number',
        required: false,
        minimum: 1,
        maximum: 200000,
        description: 'Maximum tokens per response'
      },
      timeout: {
        type: 'number',
        required: false,
        minimum: 1000,
        maximum: 300000,
        default: 30000,
        description: 'Request timeout in milliseconds'
      },
      capabilities: {
        type: 'object',
        required: true,
        properties: {
          hasVision: {
            type: 'boolean',
            required: false,
            default: false,
            description: 'Supports image analysis'
          },
          hasToolUse: {
            type: 'boolean',
            required: false,
            default: false,
            description: 'Supports function calling'
          },
          reasoningDepth: {
            type: 'string',
            required: false,
            enum: ['basic', 'intermediate', 'advanced'],
            default: 'intermediate',
            description: 'Reasoning capability level'
          },
          speed: {
            type: 'string',
            required: false,
            enum: ['fast', 'medium', 'slow'],
            default: 'medium',
            description: 'Response speed tier'
          },
          costTier: {
            type: 'string',
            required: false,
            enum: ['low', 'medium', 'high'],
            default: 'medium',
            description: 'Cost tier'
          },
          maxTokens: {
            type: 'number',
            required: false,
            minimum: 1,
            maximum: 200000,
            default: 4000,
            description: 'Maximum tokens supported'
          },
          supportedLanguages: {
            type: 'array',
            required: false,
            items: {
              type: 'string',
              minLength: 2,
              maxLength: 5
            },
            default: ['en'],
            description: 'Supported language codes'
          },
          specializations: {
            type: 'array',
            required: false,
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 50
            },
            default: ['code'],
            description: 'Agent specialization areas'
          }
        }
      },
      isEnabledForAssignment: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Enable for auto-assignment'
      }
    }
  };

  public static readonly MCP_SERVER_SCHEMA: ConfigurationSchema = {
    type: 'object',
    required: true,
    properties: {
      id: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_-]+$/,
        description: 'Unique identifier for the MCP server'
      },
      name: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 200,
        description: 'Display name for the MCP server'
      },
      command: {
        type: 'string',
        required: true,
        minLength: 1,
        description: 'Command to execute'
      },
      args: {
        type: 'array',
        required: false,
        items: {
          type: 'string'
        },
        default: [],
        description: 'Command arguments'
      },
      env: {
        type: 'object',
        required: false,
        description: 'Environment variables'
      },
      timeout: {
        type: 'number',
        required: false,
        minimum: 1000,
        maximum: 300000,
        default: 10000,
        description: 'Timeout in milliseconds'
      }
    }
  };

  public static readonly CONFIGURATION_SCHEMA: ConfigurationSchema = {
    type: 'object',
    required: true,
    properties: {
      agents: {
        type: 'array',
        required: false,
        items: ConfigurationValidator.AGENT_SCHEMA,
        default: [],
        description: 'Agent configurations'
      },
      assignmentDefaultMode: {
        type: 'string',
        required: false,
        enum: ['speed', 'structure'],
        default: 'speed',
        description: 'Default assignment mode'
      },
      mcpServers: {
        type: 'array',
        required: false,
        items: ConfigurationValidator.MCP_SERVER_SCHEMA,
        default: [],
        description: 'MCP server configurations'
      },
      contextMaxFiles: {
        type: 'number',
        required: false,
        minimum: 1,
        maximum: 1000,
        default: 100,
        description: 'Maximum files in context'
      },
      contextMaxTokens: {
        type: 'number',
        required: false,
        minimum: 100,
        maximum: 1000000,
        default: 8000,
        description: 'Maximum tokens in context'
      }
    }
  };

  /**
   * Validate agent configuration with schema-based validation
   */
  public static validateAgentConfiguration(config: any): ValidationResult {
    return this.validateValue(config, this.AGENT_SCHEMA, 'agent');
  }

  /**
   * Validate MCP server configuration
   */
  public static validateMCPServerConfiguration(config: any): ValidationResult {
    return this.validateValue(config, this.MCP_SERVER_SCHEMA, 'mcpServer');
  }

  /**
   * Validate complete configuration
   */
  public static validateConfiguration(config: any): ValidationResult {
    return this.validateValue(config, this.CONFIGURATION_SCHEMA, 'configuration');
  }

  /**
   * Apply default values to configuration
   */
  public static applyDefaults(config: any, schema: ConfigurationSchema): any {
    if (!config || typeof config !== 'object') {
      return schema.default !== undefined ? schema.default : {};
    }

    if (schema.type === 'array') {
      if (!Array.isArray(config)) {
        return schema.default !== undefined ? schema.default : [];
      }
      
      if (schema.items) {
        return config.map(item => this.applyDefaults(item, schema.items!));
      }
      return config;
    }

    if (schema.type === 'object' && schema.properties) {
      const result = { ...config };
      
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (result[key] === undefined && propSchema.default !== undefined) {
          result[key] = propSchema.default;
        } else if (result[key] !== undefined) {
          result[key] = this.applyDefaults(result[key], propSchema);
        }
      }
      
      return result;
    }

    return config;
  }

  /**
   * Filter out invalid configurations
   */
  public static filterValidConfigurations<T>(configs: any[], schema: ConfigurationSchema): T[] {
    if (!Array.isArray(configs)) {
      return [];
    }

    return configs
      .map(config => {
        const validation = this.validateValue(config, schema, 'item');
        if (validation.isValid) {
          return validation.filteredConfig || config;
        }
        console.warn('Filtering out invalid configuration:', config, validation.errors);
        return null;
      })
      .filter((config): config is T => config !== null);
  }

  /**
   * Validate and sanitize agent configurations
   */
  public static validateAndSanitizeAgents(agents: any[]): { valid: AgentConfigurationItem[], errors: ValidationError[], warnings: ValidationWarning[] } {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];
    const validAgents: AgentConfigurationItem[] = [];

    if (!Array.isArray(agents)) {
      allErrors.push({
        path: 'agents',
        message: 'Agents configuration must be an array',
        code: 'INVALID_TYPE',
        value: agents
      });
      return { valid: [], errors: allErrors, warnings: allWarnings };
    }

    // Check for duplicate IDs
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    agents.forEach((agent, index) => {
      if (agent && typeof agent === 'object' && agent.id) {
        if (seenIds.has(agent.id)) {
          duplicateIds.add(agent.id);
        }
        seenIds.add(agent.id);
      }
    });

    agents.forEach((agent, index) => {
      const validation = this.validateAgentConfiguration(agent);
      allErrors.push(...validation.errors.map(err => ({ ...err, path: `agents[${index}].${err.path}` })));
      allWarnings.push(...validation.warnings.map(warn => ({ ...warn, path: `agents[${index}].${warn.path}` })));

      if (validation.isValid && validation.filteredConfig) {
        const sanitizedAgent = validation.filteredConfig as AgentConfigurationItem;
        
        // Add warning for duplicate IDs
        if (duplicateIds.has(sanitizedAgent.id)) {
          allWarnings.push({
            path: `agents[${index}].id`,
            message: `Duplicate agent ID: ${sanitizedAgent.id}`,
            code: 'DUPLICATE_ID',
            value: sanitizedAgent.id
          });
        }

        validAgents.push(sanitizedAgent);
      }
    });

    return { valid: validAgents, errors: allErrors, warnings: allWarnings };
  }

  /**
   * Core validation logic
   */
  private static validateValue(value: any, schema: ConfigurationSchema, path: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let filteredConfig = value;

    // Handle null/undefined values
    if (value === null || value === undefined) {
      if (schema.required) {
        errors.push({
          path,
          message: `Required field is missing`,
          code: 'REQUIRED_FIELD_MISSING'
        });
        return { isValid: false, errors, warnings };
      }
      
      if (schema.default !== undefined) {
        filteredConfig = schema.default;
      }
      
      return { isValid: true, errors, warnings, filteredConfig };
    }

    // Type validation
    if (!this.validateType(value, schema.type)) {
      errors.push({
        path,
        message: `Expected ${schema.type}, got ${typeof value}`,
        code: 'INVALID_TYPE',
        value
      });
      return { isValid: false, errors, warnings };
    }

    // Apply defaults first
    filteredConfig = this.applyDefaults(value, schema);

    // Specific validations based on type
    switch (schema.type) {
      case 'string':
        this.validateString(filteredConfig, schema, path, errors, warnings);
        break;
      case 'number':
        this.validateNumber(filteredConfig, schema, path, errors, warnings);
        break;
      case 'array':
        const arrayResult = this.validateArray(filteredConfig, schema, path);
        errors.push(...arrayResult.errors);
        warnings.push(...arrayResult.warnings);
        if (arrayResult.filteredConfig !== undefined) {
          filteredConfig = arrayResult.filteredConfig;
        }
        break;
      case 'object':
        const objectResult = this.validateObject(filteredConfig, schema, path);
        errors.push(...objectResult.errors);
        warnings.push(...objectResult.warnings);
        if (objectResult.filteredConfig !== undefined) {
          filteredConfig = objectResult.filteredConfig;
        }
        break;
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(filteredConfig)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        code: 'INVALID_ENUM_VALUE',
        value: filteredConfig
      });
    }

    // Custom validator
    if (schema.validator && !schema.validator(filteredConfig)) {
      errors.push({
        path,
        message: 'Custom validation failed',
        code: 'CUSTOM_VALIDATION_FAILED',
        value: filteredConfig
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      filteredConfig
    };
  }

  private static validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      default:
        return false;
    }
  }

  private static validateString(value: string, schema: ConfigurationSchema, path: string, errors: ValidationError[], warnings: ValidationWarning[]): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters long`,
        code: 'STRING_TOO_SHORT',
        value
      });
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        message: `String must be at most ${schema.maxLength} characters long`,
        code: 'STRING_TOO_LONG',
        value
      });
    }

    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push({
        path,
        message: `String does not match required pattern`,
        code: 'INVALID_PATTERN',
        value
      });
    }
  }

  /**
   * Validate a number against the schema constraints
   * Implements comprehensive numeric validation including:
   * - minimum/maximum (inclusive bounds)
   * - exclusiveMinimum/exclusiveMaximum (exclusive bounds)
   * - multipleOf (divisibility)
   * - precision/scale (for decimal numbers)
   * - integer type checking
   */
  private static validateNumber(value: number, schema: ConfigurationSchema, path: string, errors: ValidationError[], warnings: ValidationWarning[]): void {
    // Check for non-finite numbers
    if (!Number.isFinite(value)) {
      errors.push({
        path,
        message: `Number must be finite, got ${value}`,
        code: 'INVALID_NUMBER',
        value
      });
      return;
    }

    // Check for integer type
    if (schema.type === 'integer' && !Number.isInteger(value)) {
      errors.push({
        path,
        message: `Value must be an integer, got ${value}`,
        code: 'NOT_AN_INTEGER',
        value
      });
    }

    // Handle exclusiveMinimum (can be number or boolean for backwards compatibility)
    const exclusiveMin = typeof schema.exclusiveMinimum === 'boolean' 
      ? (schema.exclusiveMinimum ? schema.minimum : undefined)
      : schema.exclusiveMinimum;

    if (exclusiveMin !== undefined) {
      if (value <= exclusiveMin) {
        errors.push({
          path,
          message: `Number must be greater than ${exclusiveMin} (got ${value})`,
          code: 'NUMBER_TOO_SMALL_EXCLUSIVE',
          value
        });
      }
    } else if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        message: `Number must be at least ${schema.minimum} (got ${value})`,
        code: 'NUMBER_TOO_SMALL',
        value
      });
    }

    // Handle exclusiveMaximum (can be number or boolean for backwards compatibility)
    const exclusiveMax = typeof schema.exclusiveMaximum === 'boolean'
      ? (schema.exclusiveMaximum ? schema.maximum : undefined)
      : schema.exclusiveMaximum;

    if (exclusiveMax !== undefined) {
      if (value >= exclusiveMax) {
        errors.push({
          path,
          message: `Number must be less than ${exclusiveMax} (got ${value})`,
          code: 'NUMBER_TOO_LARGE_EXCLUSIVE',
          value
        });
      }
    } else if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path,
        message: `Number must be at most ${schema.maximum} (got ${value})`,
        code: 'NUMBER_TOO_LARGE',
        value
      });
    }

    // Check multipleOf constraint
    if (schema.multipleOf !== undefined) {
      // Use a small epsilon for floating point comparison
      const epsilon = 1e-10;
      const remainder = Math.abs(value) % schema.multipleOf;
      
      if (remainder > epsilon && Math.abs(remainder - schema.multipleOf) > epsilon) {
        errors.push({
          path,
          message: `Number must be a multiple of ${schema.multipleOf} (got ${value})`,
          code: 'NOT_A_MULTIPLE',
          value
        });
      }
    }

    // Check precision and scale for decimal numbers
    if (schema.precision !== undefined || schema.scale !== undefined) {
      const strValue = value.toString();
      const decimalIndex = strValue.indexOf('.');
      
      // Handle precision (total significant digits)
      if (schema.precision !== undefined) {
        const significantDigits = decimalIndex === -1 
          ? strValue.replace(/^0+/, '').length 
          : strValue.replace(/\.|^0+/g, '').length;
          
        if (significantDigits > schema.precision) {
          errors.push({
            path,
            message: `Number must have at most ${schema.precision} significant digits (got ${significantDigits})`,
            code: 'PRECISION_TOO_HIGH',
            value
          });
        }
      }
      
      // Handle scale (decimal places)
      if (schema.scale !== undefined) {
        const decimalPlaces = decimalIndex === -1 ? 0 : strValue.length - decimalIndex - 1;
        if (decimalPlaces > schema.scale) {
          errors.push({
            path,
            message: `Number must have at most ${schema.scale} decimal places (got ${decimalPlaces})`,
            code: 'SCALE_TOO_HIGH',
            value
          });
        }
      }
    }
  }

  private static validateArray(value: any[], schema: ConfigurationSchema, path: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const filteredItems: any[] = [];

    if (schema.items) {
      value.forEach((item, index) => {
        const itemResult = this.validateValue(item, schema.items!, `${path}[${index}]`);
        errors.push(...itemResult.errors);
        warnings.push(...itemResult.warnings);
        
        if (itemResult.isValid) {
          filteredItems.push(itemResult.filteredConfig !== undefined ? itemResult.filteredConfig : item);
        }
      });
    } else {
      filteredItems.push(...value);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      filteredConfig: filteredItems
    };
  }

  private static validateObject(value: any, schema: ConfigurationSchema, path: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const filteredObject: any = {};

    if (schema.properties) {
      // Validate each property
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const propPath = path ? `${path}.${key}` : key;
        const propResult = this.validateValue(value[key], propSchema, propPath);
        
        errors.push(...propResult.errors);
        warnings.push(...propResult.warnings);
        
        if (propResult.isValid || propResult.filteredConfig !== undefined) {
          filteredObject[key] = propResult.filteredConfig !== undefined ? propResult.filteredConfig : value[key];
        }
      }

      // Check for unknown properties
      for (const key of Object.keys(value)) {
        if (!schema.properties[key]) {
          warnings.push({
            path: `${path}.${key}`,
            message: `Unknown property: ${key}`,
            code: 'UNKNOWN_PROPERTY',
            value: value[key]
          });
        }
      }
    } else {
      // If no properties schema, copy all properties
      Object.assign(filteredObject, value);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      filteredConfig: filteredObject
    };
  }

  /**
   * Generate a unique ID for configurations
   */
  public static generateUniqueId(prefix: string = 'config'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate configuration before saving
   */
  public static validateBeforeSave(config: any, type: 'agent' | 'mcpServer' | 'configuration'): ValidationResult {
    switch (type) {
      case 'agent':
        return this.validateAgentConfiguration(config);
      case 'mcpServer':
        return this.validateMCPServerConfiguration(config);
      case 'configuration':
        return this.validateConfiguration(config);
      default:
        return {
          isValid: false,
          errors: [{ path: 'type', message: 'Unknown configuration type', code: 'UNKNOWN_TYPE' }],
          warnings: []
        };
    }
  }
}