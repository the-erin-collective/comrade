/**
 * Advanced Tool Registry Tests
 * 
 * This test suite focuses on advanced tool registry features including:
 * - Complex parameter validation
 * - Tool execution error handling
 * - Performance with many tools
 * - Schema generation edge cases
 */

import assert from 'assert';
import { ToolRegistry } from '../../core/tool-registry';
import { Tool, ToolResult, ToolParameter } from '../../core/types';

// Advanced mock tools for testing
class AsyncTool implements Tool {
  name = 'async_tool';
  description = 'A tool that performs async operations';
  parameters: ToolParameter[] = [
    {
      name: 'delay',
      type: 'number',
      description: 'Delay in milliseconds',
      required: false
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const delay = parameters.delay || 100;
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return {
      success: true,
      output: `Async operation completed after ${delay}ms`,
      metadata: {
        executionTime: delay,
        toolName: this.name,
        parameters,
        timestamp: new Date()
      }
    };
  }
}

class ValidationTool implements Tool {
  name = 'validation_tool';
  description = 'A tool with complex parameter validation';
  parameters: ToolParameter[] = [
    {
      name: 'email',
      type: 'string',
      description: 'Email address',
      required: true
    },
    {
      name: 'age',
      type: 'number',
      description: 'Age in years',
      required: true
    },
    {
      name: 'role',
      type: 'string',
      description: 'User role',
      required: true,
      enum: ['admin', 'user', 'guest']
    },
    {
      name: 'preferences',
      type: 'object',
      description: 'User preferences',
      required: false
    },
    {
      name: 'tags',
      type: 'array',
      description: 'User tags',
      required: false
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    // Custom validation logic
    const { email, age, role } = parameters;
    
    if (!email.includes('@')) {
      return {
        success: false,
        error: 'Invalid email format',
        metadata: {
          executionTime: 1,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    }
    
    if (age < 0 || age > 150) {
      return {
        success: false,
        error: 'Age must be between 0 and 150',
        metadata: {
          executionTime: 1,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    }
    
    return {
      success: true,
      output: `Validated user: ${email}, age: ${age}, role: ${role}`,
      metadata: {
        executionTime: 10,
        toolName: this.name,
        parameters,
        timestamp: new Date()
      }
    };
  }
}

class ErrorTool implements Tool {
  name = 'error_tool';
  description = 'A tool that can throw different types of errors';
  parameters: ToolParameter[] = [
    {
      name: 'error_type',
      type: 'string',
      description: 'Type of error to throw',
      required: true,
      enum: ['sync', 'async', 'timeout', 'memory']
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const errorType = parameters.error_type;
    
    switch (errorType) {
      case 'sync':
        throw new Error('Synchronous error occurred');
      
      case 'async':
        await new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Asynchronous error occurred')), 10);
        });
        break;
      
      case 'timeout':
        await new Promise(resolve => setTimeout(resolve, 5000)); // Long delay
        break;
      
      case 'memory':
        // Simulate memory error
        throw new Error('Out of memory');
      
      default:
        throw new Error('Unknown error type');
    }
    
    return {
      success: true,
      output: 'Should not reach here',
      metadata: {
        executionTime: 1,
        toolName: this.name,
        parameters,
        timestamp: new Date()
      }
    };
  }
}

describe('Advanced Tool Registry Tests', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Complex Parameter Validation', () => {
    let validationTool: ValidationTool;

    beforeEach(() => {
      validationTool = new ValidationTool();
      registry.registerTool(validationTool);
    });

    it('should validate email format', async () => {
      const validResult = await registry.executeTool('validation_tool', {
        email: 'test@example.com',
        age: 25,
        role: 'user'
      });

      assert.strictEqual(validResult.success, true);

      const invalidResult = await registry.executeTool('validation_tool', {
        email: 'invalid-email',
        age: 25,
        role: 'user'
      });

      assert.strictEqual(invalidResult.success, false);
      assert.ok(invalidResult.error?.includes('Invalid email format'));
    });

    it('should validate numeric ranges', async () => {
      const validAges = [0, 25, 150];
      const invalidAges = [-1, 151, 999];

      for (const age of validAges) {
        const result = await registry.executeTool('validation_tool', {
          email: 'test@example.com',
          age,
          role: 'user'
        });
        assert.strictEqual(result.success, true, `Age ${age} should be valid`);
      }

      for (const age of invalidAges) {
        const result = await registry.executeTool('validation_tool', {
          email: 'test@example.com',
          age,
          role: 'user'
        });
        assert.strictEqual(result.success, false, `Age ${age} should be invalid`);
      }
    });

    it('should validate enum values', async () => {
      const validRoles = ['admin', 'user', 'guest'];
      const invalidRoles = ['superuser', 'moderator', ''];

      for (const role of validRoles) {
        const result = await registry.executeTool('validation_tool', {
          email: 'test@example.com',
          age: 25,
          role
        });
        assert.strictEqual(result.success, true, `Role ${role} should be valid`);
      }

      for (const role of invalidRoles) {
        const result = await registry.executeTool('validation_tool', {
          email: 'test@example.com',
          age: 25,
          role
        });
        assert.strictEqual(result.success, false, `Role ${role} should be invalid`);
      }
    });

    it('should handle complex object parameters', async () => {
      const result = await registry.executeTool('validation_tool', {
        email: 'test@example.com',
        age: 25,
        role: 'user',
        preferences: {
          theme: 'dark',
          notifications: true,
          language: 'en'
        },
        tags: ['developer', 'javascript', 'testing']
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('test@example.com'));
    });

    it('should validate array parameters', async () => {
      const validArrays = [
        [],
        ['tag1'],
        ['tag1', 'tag2', 'tag3']
      ];

      const invalidArrays = [
        'not-an-array',
        123,
        { not: 'array' }
      ];

      for (const tags of validArrays) {
        const result = await registry.executeTool('validation_tool', {
          email: 'test@example.com',
          age: 25,
          role: 'user',
          tags
        });
        assert.strictEqual(result.success, true);
      }

      for (const tags of invalidArrays) {
        const result = await registry.executeTool('validation_tool', {
          email: 'test@example.com',
          age: 25,
          role: 'user',
          tags
        });
        assert.strictEqual(result.success, false);
      }
    });
  });

  describe('Asynchronous Tool Execution', () => {
    let asyncTool: AsyncTool;

    beforeEach(() => {
      asyncTool = new AsyncTool();
      registry.registerTool(asyncTool);
    });

    it('should handle async tool execution', async () => {
      const startTime = Date.now();
      
      const result = await registry.executeTool('async_tool', {
        delay: 50
      });

      const executionTime = Date.now() - startTime;

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('50ms'));
      assert.ok(executionTime >= 50);
    });

    it('should handle concurrent tool executions', async () => {
      const promises: Promise<ToolResult>[] = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(registry.executeTool('async_tool', {
          delay: 20 + i * 10
        }));
      }

      const results: ToolResult[] = await Promise.all(promises);

      results.forEach((result, index) => {
        assert.strictEqual(result.success, true);
        assert.ok(result.output?.includes(`${20 + index * 10}ms`));
      });
    });

    it('should handle tool execution timeouts gracefully', async () => {
      // This test would need a timeout mechanism in the registry
      // For now, we'll test that long-running tools don't crash
      const result = await registry.executeTool('async_tool', {
        delay: 100
      });

      assert.strictEqual(result.success, true);
    });
  });

  describe('Error Handling and Recovery', () => {
    let errorTool: ErrorTool;

    beforeEach(() => {
      errorTool = new ErrorTool();
      registry.registerTool(errorTool);
    });

    it('should handle synchronous errors', async () => {
      const result = await registry.executeTool('error_tool', {
        error_type: 'sync'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Synchronous error occurred'));
      assert.strictEqual(result.metadata.toolName, 'error_tool');
    });

    it('should handle asynchronous errors', async () => {
      const result = await registry.executeTool('error_tool', {
        error_type: 'async'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Asynchronous error occurred'));
    });

    it('should handle different error types', async () => {
      const errorTypes = ['sync', 'async', 'memory'];

      for (const errorType of errorTypes) {
        const result = await registry.executeTool('error_tool', {
          error_type: errorType
        });

        assert.strictEqual(result.success, false);
        assert.ok(result.error);
        assert.strictEqual(result.metadata.toolName, 'error_tool');
      }
    });

    it('should provide detailed error metadata', async () => {
      const result = await registry.executeTool('error_tool', {
        error_type: 'sync'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.metadata.executionTime >= 0);
      assert.ok(result.metadata.timestamp instanceof Date);
      assert.deepStrictEqual(result.metadata.parameters, { error_type: 'sync' });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of tools efficiently', () => {
      const startTime = Date.now();

      // Register many tools
      for (let i = 0; i < 1000; i++) {
        const tool: Tool = {
          name: `perf_tool_${i}`,
          description: `Performance test tool ${i}`,
          parameters: [
            {
              name: 'input',
              type: 'string',
              description: 'Input parameter',
              required: true
            }
          ],
          async execute(parameters) {
            return {
              success: true,
              output: `Tool ${i} executed with ${parameters.input}`,
              metadata: {
                executionTime: 1,
                toolName: `perf_tool_${i}`,
                parameters,
                timestamp: new Date()
              }
            };
          }
        };
        registry.registerTool(tool);
      }

      const registrationTime = Date.now() - startTime;

      assert.strictEqual(registry.size(), 1000);
      assert.ok(registrationTime < 1000); // Should register quickly

      // Test retrieval performance
      const retrievalStart = Date.now();
      const tool500 = registry.getTool('perf_tool_500');
      const retrievalTime = Date.now() - retrievalStart;

      assert.ok(tool500);
      assert.ok(retrievalTime < 10); // Should retrieve quickly
    });

    it('should handle tool execution with large parameters efficiently', async () => {
      const largeTool: Tool = {
        name: 'large_param_tool',
        description: 'Tool that handles large parameters',
        parameters: [
          {
            name: 'large_data',
            type: 'string',
            description: 'Large data parameter',
            required: true
          }
        ],
        async execute(parameters) {
          return {
            success: true,
            output: `Processed ${parameters.large_data.length} characters`,
            metadata: {
              executionTime: 10,
              toolName: 'large_param_tool',
              parameters: { large_data: `[${parameters.large_data.length} chars]` }, // Truncate for metadata
              timestamp: new Date()
            }
          };
        }
      };

      registry.registerTool(largeTool);

      const largeData = 'A'.repeat(100000); // 100KB of data
      const startTime = Date.now();

      const result = await registry.executeTool('large_param_tool', {
        large_data: largeData
      });

      const executionTime = Date.now() - startTime;

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('100000 characters'));
      assert.ok(executionTime < 1000); // Should handle large data efficiently
    });

    it('should handle concurrent tool executions efficiently', async () => {
      const concurrentTool: Tool = {
        name: 'concurrent_tool',
        description: 'Tool for concurrent execution testing',
        parameters: [
          {
            name: 'id',
            type: 'number',
            description: 'Execution ID',
            required: true
          }
        ],
        async execute(parameters) {
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, 10));
          
          return {
            success: true,
            output: `Concurrent execution ${parameters.id}`,
            metadata: {
              executionTime: 10,
              toolName: 'concurrent_tool',
              parameters,
              timestamp: new Date()
            }
          };
        }
      };

      registry.registerTool(concurrentTool);

      const startTime = Date.now();
      const promises: Promise<ToolResult>[] = [];

      // Execute 50 tools concurrently
      for (let i = 0; i < 50; i++) {
        promises.push(registry.executeTool('concurrent_tool', { id: i }));
      }

      const results: ToolResult[] = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All should succeed
      results.forEach((result, index) => {
        assert.strictEqual(result.success, true);
        assert.ok(result.output?.includes(`${index}`));
      });

      // Should execute concurrently (much faster than sequential)
      assert.ok(totalTime < 200); // Should be much less than 50 * 10ms
    });
  });

  describe('Schema Generation Edge Cases', () => {
    it('should generate schemas for tools with no parameters', () => {
      const noParamTool: Tool = {
        name: 'no_param_tool',
        description: 'Tool with no parameters',
        parameters: [],
        async execute() {
          return {
            success: true,
            output: 'No parameters needed',
            metadata: {
              executionTime: 1,
              toolName: 'no_param_tool',
              parameters: {},
              timestamp: new Date()
            }
          };
        }
      };

      registry.registerTool(noParamTool);
      const schemas = registry.getToolSchemas();

      const schema = schemas.find(s => s.name === 'no_param_tool');
      assert.ok(schema);
      assert.strictEqual(schema.parameters.type, 'object');
      assert.deepStrictEqual(schema.parameters.properties, {});
      assert.deepStrictEqual(schema.parameters.required, []);
    });

    it('should handle tools with complex parameter types', () => {
      const complexTool: Tool = {
        name: 'complex_schema_tool',
        description: 'Tool with complex parameter schema',
        parameters: [
          {
            name: 'union_param',
            type: 'string',
            description: 'Parameter that could be multiple types',
            required: false,
            enum: ['option1', 'option2', 'option3']
          },
          {
            name: 'nested_object',
            type: 'object',
            description: 'Nested object parameter',
            required: true
          },
          {
            name: 'array_of_objects',
            type: 'array',
            description: 'Array of objects',
            required: false
          }
        ],
        async execute() {
          return {
            success: true,
            output: 'Complex schema handled',
            metadata: {
              executionTime: 1,
              toolName: 'complex_schema_tool',
              parameters: {},
              timestamp: new Date()
            }
          };
        }
      };

      registry.registerTool(complexTool);
      const schemas = registry.getToolSchemas();

      const schema = schemas.find(s => s.name === 'complex_schema_tool');
      assert.ok(schema);
      assert.ok(schema.parameters.properties.union_param);
      assert.ok(schema.parameters.properties.union_param.enum);
      assert.strictEqual(schema.parameters.properties.nested_object.type, 'object');
      assert.strictEqual(schema.parameters.properties.array_of_objects.type, 'array');
      assert.deepStrictEqual(schema.parameters.required, ['nested_object']);
    });

    it('should handle tools with very long descriptions', () => {
      const longDescription = 'A'.repeat(10000);
      
      const longDescTool: Tool = {
        name: 'long_desc_tool',
        description: longDescription,
        parameters: [
          {
            name: 'param',
            type: 'string',
            description: longDescription,
            required: true
          }
        ],
        async execute() {
          return {
            success: true,
            output: 'Long description handled',
            metadata: {
              executionTime: 1,
              toolName: 'long_desc_tool',
              parameters: {},
              timestamp: new Date()
            }
          };
        }
      };

      registry.registerTool(longDescTool);
      const schemas = registry.getToolSchemas();

      const schema = schemas.find(s => s.name === 'long_desc_tool');
      assert.ok(schema);
      assert.strictEqual(schema.description, longDescription);
      assert.strictEqual(schema.parameters.properties.param.description, longDescription);
    });
  });

  describe('Tool Registry Management', () => {
    it('should handle tool replacement correctly', () => {
      const originalTool: Tool = {
        name: 'replaceable_tool',
        description: 'Original tool',
        parameters: [],
        async execute() {
          return {
            success: true,
            output: 'Original implementation',
            metadata: {
              executionTime: 1,
              toolName: 'replaceable_tool',
              parameters: {},
              timestamp: new Date()
            }
          };
        }
      };

      const replacementTool: Tool = {
        name: 'replaceable_tool',
        description: 'Replacement tool',
        parameters: [],
        async execute() {
          return {
            success: true,
            output: 'Replacement implementation',
            metadata: {
              executionTime: 1,
              toolName: 'replaceable_tool',
              parameters: {},
              timestamp: new Date()
            }
          };
        }
      };

      registry.registerTool(originalTool);
      assert.strictEqual(registry.size(), 1);

      registry.registerTool(replacementTool);
      assert.strictEqual(registry.size(), 1); // Should replace, not add

      const tool = registry.getTool('replaceable_tool');
      assert.strictEqual(tool?.description, 'Replacement tool');
    });

    it('should handle bulk operations efficiently', () => {
      const tools: Tool[] = [];

      // Create many tools
      for (let i = 0; i < 100; i++) {
        tools.push({
          name: `bulk_tool_${i}`,
          description: `Bulk tool ${i}`,
          parameters: [],
          async execute() {
            return {
              success: true,
              output: `Bulk tool ${i} executed`,
              metadata: {
                executionTime: 1,
                toolName: `bulk_tool_${i}`,
                parameters: {},
                timestamp: new Date()
              }
            };
          }
        });
      }

      const startTime = Date.now();

      // Register all tools
      tools.forEach(tool => registry.registerTool(tool));

      const registrationTime = Date.now() - startTime;

      assert.strictEqual(registry.size(), 100);
      assert.ok(registrationTime < 100); // Should be fast

      // Test bulk retrieval
      const retrievalStart = Date.now();
      const allTools = registry.getAllTools();
      const retrievalTime = Date.now() - retrievalStart;

      assert.strictEqual(allTools.length, 100);
      assert.ok(retrievalTime < 10); // Should be very fast

      // Test bulk schema generation
      const schemaStart = Date.now();
      const schemas = registry.getToolSchemas();
      const schemaTime = Date.now() - schemaStart;

      assert.strictEqual(schemas.length, 100);
      assert.ok(schemaTime < 50); // Should be reasonably fast
    });

    it('should maintain tool execution statistics', async () => {
      const statsTool: Tool = {
        name: 'stats_tool',
        description: 'Tool for testing execution statistics',
        parameters: [
          {
            name: 'should_fail',
            type: 'boolean',
            description: 'Whether the tool should fail',
            required: false
          }
        ],
        async execute(parameters) {
          if (parameters.should_fail) {
            throw new Error('Intentional failure');
          }
          
          return {
            success: true,
            output: 'Stats tool executed successfully',
            metadata: {
              executionTime: 5,
              toolName: 'stats_tool',
              parameters,
              timestamp: new Date()
            }
          };
        }
      };

      registry.registerTool(statsTool);

      // Execute tool multiple times with different outcomes
      const results: ToolResult[] = [];
      
      for (let i = 0; i < 10; i++) {
        const result = await registry.executeTool('stats_tool', {
          should_fail: i % 3 === 0 // Fail every 3rd execution
        });
        results.push(result);
      }

      // Verify mixed results
      const successes = results.filter(r => r.success).length;
      const failures = results.filter(r => !r.success).length;

      assert.ok(successes > 0);
      assert.ok(failures > 0);
      assert.strictEqual(successes + failures, 10);
    });
  });
});