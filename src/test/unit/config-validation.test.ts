/**
 * Unit tests for the Configuration Validation Engine
 * Tests requirements 6.1, 6.2, 6.3, 6.4
 */

import * as assert from 'assert';
import { ConfigurationValidator, ValidationResult, ValidationError, ValidationWarning } from '../../core/config-validator';
import { AgentConfigurationItem, MCPServerConfig, ComradeConfiguration } from '../../core/config';
import { AgentCapabilities } from '../../core/agent';

describe('Configuration Validation Engine Tests', () => {

  describe('Agent Configuration Validation', () => {  it('should validate complete valid agent configuration', () => {
      const validAgent: AgentConfigurationItem = {
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000,
        capabilities: {
          hasVision: true,
          hasToolUse: true,
          reasoningDepth: 'advanced',
          speed: 'medium',
          costTier: 'high',
          maxTokens: 4000,
          supportedLanguages: ['en', 'es'],
          specializations: ['code', 'analysis']
        },
        isEnabledForAssignment: true
      };

      const result = ConfigurationValidator.validateAgentConfiguration(validAgent);
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.ok(result.filteredConfig);
      assert.strictEqual(result.filteredConfig.id, validAgent.id);
    });

  it('should apply default values for missing optional properties (Requirement 6.1)', () => {
      const minimalAgent = {
        id: 'minimal-agent',
        name: 'Minimal Agent',
        provider: 'openai',
        model: 'gpt-4',
        capabilities: {}
      };

      const result = ConfigurationValidator.validateAgentConfiguration(minimalAgent);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.filteredConfig);
      
      const config = result.filteredConfig as AgentConfigurationItem;
      assert.strictEqual(config.temperature, 0.7); // Default applied
      assert.strictEqual(config.timeout, 30000); // Default applied
      assert.strictEqual(config.isEnabledForAssignment, true); // Default applied
      assert.strictEqual(config.capabilities.hasVision, false); // Default applied
      assert.strictEqual(config.capabilities.reasoningDepth, 'intermediate'); // Default applied
      assert.deepStrictEqual(config.capabilities.supportedLanguages, ['en']); // Default applied
    });

  it('should validate required fields and format validity (Requirement 6.2)', () => {
      const invalidAgent = {
        // Missing required 'id' field
        name: 'Test Agent',
        provider: 'invalid-provider', // Invalid enum value
        model: '', // Empty required field
        temperature: 3.0, // Out of range
        maxTokens: -100, // Invalid negative value
        capabilities: {
          reasoningDepth: 'invalid-depth' // Invalid enum value
        }
      };

      const result = ConfigurationValidator.validateAgentConfiguration(invalidAgent);
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.length > 0);
      
      // Check for specific validation errors
      const errorCodes = result.errors.map(e => e.code);
      assert.ok(errorCodes.includes('REQUIRED_FIELD_MISSING')); // Missing id
      assert.ok(errorCodes.includes('INVALID_ENUM_VALUE')); // Invalid provider
      assert.ok(errorCodes.includes('STRING_TOO_SHORT')); // Empty model
      assert.ok(errorCodes.includes('NUMBER_TOO_LARGE')); // Temperature out of range
      assert.ok(errorCodes.includes('NUMBER_TOO_SMALL')); // Negative maxTokens
    });

  it('should filter out invalid configurations and log warnings (Requirement 6.3)', () => {
      const mixedAgents = [
        {
          id: 'valid-agent',
          name: 'Valid Agent',
          provider: 'openai',
          model: 'gpt-4',
          capabilities: {}
        },
        {
          // Invalid agent - missing required fields
          name: 'Invalid Agent',
          provider: 'invalid-provider'
        },
        {
          id: 'another-valid',
          name: 'Another Valid Agent',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          capabilities: {}
        },
        null, // Invalid entry
        'not-an-object' // Invalid entry
      ];

      const result = ConfigurationValidator.validateAndSanitizeAgents(mixedAgents);
      
      assert.strictEqual(result.valid.length, 2); // Only 2 valid agents
      assert.ok(result.errors.length > 0); // Should have errors for invalid entries
      assert.strictEqual(result.valid[0].id, 'valid-agent');
      assert.strictEqual(result.valid[1].id, 'another-valid');
    });

  it('should detect duplicate agent IDs', () => {
      const agentsWithDuplicates = [
        {
          id: 'duplicate-id',
          name: 'Agent 1',
          provider: 'openai',
          model: 'gpt-4',
          capabilities: {}
        },
        {
          id: 'duplicate-id',
          name: 'Agent 2',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          capabilities: {}
        }
      ];

      const result = ConfigurationValidator.validateAndSanitizeAgents(agentsWithDuplicates);
      
      assert.strictEqual(result.valid.length, 2); // Both are valid individually
      assert.ok(result.warnings.some(w => w.code === 'DUPLICATE_ID'));
    });

  it('should validate string patterns and lengths', () => {
      const agentWithInvalidStrings = {
        id: 'invalid@id!', // Invalid pattern
        name: '', // Too short
        provider: 'openai',
        model: 'a'.repeat(101), // Too long
        endpoint: 'not-a-url', // Invalid URL pattern
        capabilities: {}
      };

      const result = ConfigurationValidator.validateAgentConfiguration(agentWithInvalidStrings);
      
      assert.strictEqual(result.isValid, false);
      const errorCodes = result.errors.map(e => e.code);
      assert.ok(errorCodes.includes('INVALID_PATTERN')); // Invalid ID pattern
      assert.ok(errorCodes.includes('STRING_TOO_SHORT')); // Empty name
      assert.ok(errorCodes.includes('STRING_TOO_LONG')); // Model too long
    });

  it('should validate numeric ranges', () => {
      const agentWithInvalidNumbers = {
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        temperature: -0.5, // Below minimum
        maxTokens: 0, // Below minimum
        timeout: 500, // Below minimum
        capabilities: {
          maxTokens: 300000 // Above maximum
        }
      };

      const result = ConfigurationValidator.validateAgentConfiguration(agentWithInvalidNumbers);
      
      assert.strictEqual(result.isValid, false);
      const errorCodes = result.errors.map(e => e.code);
      assert.ok(errorCodes.includes('NUMBER_TOO_SMALL'));
      assert.ok(errorCodes.includes('NUMBER_TOO_LARGE'));
    });
  });

  describe('MCP Server Configuration Validation', () => {  it('should validate complete valid MCP server configuration', () => {
      const validServer: MCPServerConfig = {
        id: 'test-mcp',
        name: 'Test MCP Server',
        command: 'python',
        args: ['-m', 'test_server'],
        env: { 'TEST_VAR': 'value' },
        timeout: 15000
      };

      const result = ConfigurationValidator.validateMCPServerConfiguration(validServer);
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.ok(result.filteredConfig);
    });

  it('should apply default values for MCP server configuration', () => {
      const minimalServer = {
        id: 'minimal-mcp',
        name: 'Minimal MCP Server',
        command: 'python'
      };

      const result = ConfigurationValidator.validateMCPServerConfiguration(minimalServer);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.filteredConfig);
      
      const config = result.filteredConfig as MCPServerConfig;
      assert.deepStrictEqual(config.args, []); // Default applied
      assert.strictEqual(config.timeout, 10000); // Default applied
    });

  it('should validate required MCP server fields', () => {
      const invalidServer = {
        // Missing required 'id' field
        name: 'Test Server',
        command: '' // Empty required field
      };

      const result = ConfigurationValidator.validateMCPServerConfiguration(invalidServer);
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.length > 0);
      
      const errorCodes = result.errors.map(e => e.code);
      assert.ok(errorCodes.includes('REQUIRED_FIELD_MISSING'));
      assert.ok(errorCodes.includes('STRING_TOO_SHORT'));
    });

  it('should filter valid MCP server configurations', () => {
      const mixedServers = [
        {
          id: 'valid-server',
          name: 'Valid Server',
          command: 'python'
        },
        {
          // Invalid - missing command
          id: 'invalid-server',
          name: 'Invalid Server'
        },
        {
          id: 'another-valid',
          name: 'Another Valid Server',
          command: 'node'
        }
      ];

      const validServers = ConfigurationValidator.filterValidConfigurations<MCPServerConfig>(
        mixedServers,
        ConfigurationValidator.MCP_SERVER_SCHEMA
      );
      
      assert.strictEqual(validServers.length, 2);
      assert.strictEqual(validServers[0].id, 'valid-server');
      assert.strictEqual(validServers[1].id, 'another-valid');
    });
  });

  describe('Complete Configuration Validation', () => {  it('should validate complete configuration with defaults', () => {
      const config = {
        agents: [
          {
            id: 'test-agent',
            name: 'Test Agent',
            provider: 'openai',
            model: 'gpt-4',
            capabilities: {}
          }
        ]
        // Missing other optional fields
      };

      const result = ConfigurationValidator.validateConfiguration(config);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.filteredConfig);
      
      const validatedConfig = result.filteredConfig as ComradeConfiguration;
      assert.strictEqual(validatedConfig.assignmentDefaultMode, 'speed'); // Default applied
      assert.deepStrictEqual(validatedConfig.mcpServers, []); // Default applied
      assert.strictEqual(validatedConfig.contextMaxFiles, 100); // Default applied
      assert.strictEqual(validatedConfig.contextMaxTokens, 8000); // Default applied
    });

  it('should validate configuration enum values', () => {
      const configWithInvalidEnums = {
        agents: [],
        assignmentDefaultMode: 'invalid-mode', // Invalid enum
        mcpServers: [],
        contextMaxFiles: -10, // Invalid negative
        contextMaxTokens: 50 // Below minimum
      };

      const result = ConfigurationValidator.validateConfiguration(configWithInvalidEnums);
      
      assert.strictEqual(result.isValid, false);
      const errorCodes = result.errors.map(e => e.code);
      assert.ok(errorCodes.includes('INVALID_ENUM_VALUE'));
      assert.ok(errorCodes.includes('NUMBER_TOO_SMALL'));
    });

  it('should handle unknown properties with warnings', () => {
      const configWithUnknownProps = {
        agents: [],
        assignmentDefaultMode: 'speed',
        mcpServers: [],
        contextMaxFiles: 100,
        contextMaxTokens: 8000,
        unknownProperty: 'should generate warning'
      };

      const result = ConfigurationValidator.validateConfiguration(configWithUnknownProps);
      
      assert.strictEqual(result.isValid, true); // Still valid
      assert.ok(result.warnings.some(w => w.code === 'UNKNOWN_PROPERTY'));
    });
  });

  describe('Validation Before Save (Requirement 6.4)', () => {  it('should validate agent configuration before save', () => {
      const invalidAgent = {
        name: 'Test Agent',
        provider: 'invalid-provider'
        // Missing required fields
      };

      const result = ConfigurationValidator.validateBeforeSave(invalidAgent, 'agent');
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.length > 0);
    });

  it('should validate MCP server configuration before save', () => {
      const invalidServer = {
        name: 'Test Server'
        // Missing required fields
      };

      const result = ConfigurationValidator.validateBeforeSave(invalidServer, 'mcpServer');
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.length > 0);
    });

  it('should validate complete configuration before save', () => {
      const invalidConfig = {
        agents: 'not-an-array', // Invalid type
        assignmentDefaultMode: 'invalid-mode'
      };

      const result = ConfigurationValidator.validateBeforeSave(invalidConfig, 'configuration');
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.length > 0);
    });

  it('should handle unknown configuration type', () => {
      const result = ConfigurationValidator.validateBeforeSave({}, 'unknown' as any);
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.code === 'UNKNOWN_TYPE'));
    });
  });

  describe('Utility Functions', () => {  it('should generate unique IDs', () => {
      const id1 = ConfigurationValidator.generateUniqueId('test');
      const id2 = ConfigurationValidator.generateUniqueId('test');
      
      assert.ok(id1.startsWith('test_'));
      assert.ok(id2.startsWith('test_'));
      assert.notStrictEqual(id1, id2);
    });

  it('should apply defaults recursively', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, default: 'default-name' },
          nested: {
            type: 'object' as const,
            properties: {
              value: { type: 'number' as const, default: 42 }
            }
          },
          array: {
            type: 'array' as const,
            default: ['default-item'],
            items: { type: 'string' as const }
          }
        }
      };

      const config = {
        nested: {}
      };

      const result = ConfigurationValidator.applyDefaults(config, schema);
      
      assert.strictEqual(result.name, 'default-name');
      assert.strictEqual(result.nested.value, 42);
      assert.deepStrictEqual(result.array, ['default-item']);
    });

  it('should handle null and undefined values', () => {
      const schema = {
        type: 'object' as const,
        default: { defaultProp: 'value' }
      };

      const nullResult = ConfigurationValidator.applyDefaults(null, schema);
      const undefinedResult = ConfigurationValidator.applyDefaults(undefined, schema);
      
      assert.deepStrictEqual(nullResult, { defaultProp: 'value' });
      assert.deepStrictEqual(undefinedResult, { defaultProp: 'value' });
    });
  });

  describe('Error and Warning Handling', () => {  it('should provide detailed error information', () => {
      const invalidAgent = {
        id: '',
        name: 'Test Agent',
        provider: 'invalid-provider',
        model: 'gpt-4',
        temperature: 5.0,
        capabilities: {}
      };

      const result = ConfigurationValidator.validateAgentConfiguration(invalidAgent);
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.length > 0);
      
      result.errors.forEach(error => {
        assert.ok(error.path);
        assert.ok(error.message);
        assert.ok(error.code);
      });
    });

  it('should provide warning information for non-critical issues', () => {
      const configWithUnknownProps = {
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        capabilities: {},
        unknownProperty: 'value'
      };

      const result = ConfigurationValidator.validateAgentConfiguration(configWithUnknownProps);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.code === 'UNKNOWN_PROPERTY'));
    });
  });
});

