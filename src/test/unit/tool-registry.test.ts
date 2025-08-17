import * as assert from 'assert';
import { ToolRegistry } from '../../core/tool-registry';
import { Tool, ToolResult, ToolParameter, BaseTool } from '../../core/types';

// Mock tool for testing
class MockTool extends BaseTool {
  name = 'mock_tool';
  description = 'A mock tool for testing';
  parameters: ToolParameter[] = [
    {
      name: 'required_param',
      type: 'string',
      description: 'A required string parameter',
      required: true
    },
    {
      name: 'optional_param',
      type: 'number',
      description: 'An optional number parameter',
      required: false
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const validation = this.validateParameters(parameters);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
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
      output: `Mock tool executed with: ${JSON.stringify(parameters)}`,
      metadata: {
        executionTime: 10,
        toolName: this.name,
        parameters,
        timestamp: new Date()
      }
    };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockTool: MockTool;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockTool = new MockTool();
  });

  describe('Tool Registration', () => {
    it('should register a tool successfully', () => {
      registry.registerTool(mockTool);
      assert.strictEqual(registry.size(), 1);
      assert.strictEqual(registry.getTool('mock_tool'), mockTool);
    });

    it('should throw error for tool without name', () => {
      const invalidTool = { ...mockTool, name: '' };
      assert.throws(() => registry.registerTool(invalidTool as Tool), /Tool name is required/);
    });

    it('should throw error for tool without description', () => {
      const invalidTool = { ...mockTool, description: '' };
      assert.throws(() => registry.registerTool(invalidTool as Tool), /Tool description is required/);
    });

    it('should throw error for tool without execute function', () => {
      const invalidTool = { ...mockTool, execute: undefined };
      assert.throws(() => registry.registerTool(invalidTool as any), /Tool execute function is required/);
    });
  });

  describe('Tool Execution', () => {
    beforeEach(() => {
      registry.registerTool(mockTool);
    });

    it('should execute tool with valid parameters', async () => {
      const result = await registry.executeTool('mock_tool', {
        required_param: 'test_value'
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('test_value'));
      assert.strictEqual(result.metadata.toolName, 'mock_tool');
      assert.ok(result.metadata.executionTime > 0);
    });

    it('should fail when tool not found', async () => {
      const result = await registry.executeTool('non_existent', {});

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Tool 'non_existent' not found");
      assert.strictEqual(result.metadata.toolName, 'non_existent');
    });

    it('should fail when required parameter missing', async () => {
      const result = await registry.executeTool('mock_tool', {});

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Required parameter 'required_param' is missing"));
    });

    it('should fail when parameter has wrong type', async () => {
      const result = await registry.executeTool('mock_tool', {
        required_param: 'test_value',
        optional_param: 'not_a_number'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Parameter 'optional_param' must be of type number"));
    });
  });

  describe('Tool Schema Generation', () => {
    beforeEach(() => {
      registry.registerTool(mockTool);
    });

    it('should generate tool schemas for AI consumption', () => {
      const schemas = registry.getToolSchemas();

      assert.strictEqual(schemas.length, 1);
      assert.strictEqual(schemas[0].name, 'mock_tool');
      assert.strictEqual(schemas[0].description, 'A mock tool for testing');
      assert.ok(schemas[0].parameters);
      assert.ok(schemas[0].parameters.properties);
      assert.ok(schemas[0].parameters.required);
    });

    it('should return empty array when no tools registered', () => {
      const emptyRegistry = new ToolRegistry();
      const schemas = emptyRegistry.getToolSchemas();
      assert.strictEqual(schemas.length, 0);
    });
  });

  describe('Registry Management', () => {
    beforeEach(() => {
      registry.registerTool(mockTool);
    });

    it('should clear all tools', () => {
      assert.strictEqual(registry.size(), 1);
      registry.clear();
      assert.strictEqual(registry.size(), 0);
      assert.strictEqual(registry.getAllTools().length, 0);
    });

    it('should return correct size', () => {
      assert.strictEqual(registry.size(), 1);
      registry.registerTool(mockTool); // Re-register same tool
      assert.strictEqual(registry.size(), 1); // Should not increase
    });
  });
});