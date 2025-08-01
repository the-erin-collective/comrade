/**
 * Tests for the Tool Definition Framework
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  ToolRegistry,
  ParameterValidator,
  SecurityValidator,
  ToolDefinition,
  ExecutionContext,
  SecurityLevel,
  JSONSchema
} from '../../core/tools';
import {
  ToolManager,
  ToolExecutionError,
  BuiltInTools
} from '../../core/tool-manager';

suite('Tool Definition Framework Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let toolRegistry: ToolRegistry;
  let toolManager: ToolManager;

  setup(() => {
    sandbox = sinon.createSandbox();
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
    toolRegistry = ToolRegistry.getInstance();
    toolManager = ToolManager.getInstance();
  });

  teardown(() => {
    sandbox.restore();
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
  });

  suite('ToolRegistry', () => {
    test('should register and retrieve tools', () => {
      const testTool: ToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: ['input']
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low'
        },
        executor: async () => ({ success: true })
      };

      toolRegistry.registerTool(testTool);
      const retrieved = toolRegistry.getTool('test_tool');
      
      assert.strictEqual(retrieved?.name, 'test_tool');
      assert.strictEqual(retrieved?.description, 'A test tool');
    });

    test('should prevent duplicate tool registration', () => {
      const testTool: ToolDefinition = {
        name: 'duplicate_tool',
        description: 'A duplicate tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      toolRegistry.registerTool(testTool);
      
      assert.throws(() => {
        toolRegistry.registerTool(testTool);
      }, /already registered/);
    });

    test('should filter tools by security context', () => {
      const lowRiskTool: ToolDefinition = {
        name: 'low_risk',
        description: 'Low risk tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const highRiskTool: ToolDefinition = {
        name: 'high_risk',
        description: 'High risk tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: false, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      toolRegistry.registerTool(lowRiskTool);
      toolRegistry.registerTool(highRiskTool);

      const normalContext: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const availableTools = toolRegistry.getAvailableTools(normalContext);
      
      assert.strictEqual(availableTools.length, 1);
      assert.strictEqual(availableTools[0].name, 'low_risk');
    });

    test('should filter tools by web environment', () => {
      // Mock window object to simulate web environment
      (global as any).window = {};

      const webTool: ToolDefinition = {
        name: 'web_tool',
        description: 'Web compatible tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const desktopTool: ToolDefinition = {
        name: 'desktop_tool',
        description: 'Desktop only tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: false, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      toolRegistry.registerTool(webTool);
      toolRegistry.registerTool(desktopTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const availableTools = toolRegistry.getAvailableTools(context);
      
      assert.strictEqual(availableTools.length, 1);
      assert.strictEqual(availableTools[0].name, 'web_tool');

      // Clean up
      delete (global as any).window;
    });

    test('should get tools by category', () => {
      const fsTool: ToolDefinition = {
        name: 'fs_tool',
        description: 'File system tool',
        category: 'filesystem',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const vsTool: ToolDefinition = {
        name: 'vs_tool',
        description: 'VS Code tool',
        category: 'vscode',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      toolRegistry.registerTool(fsTool);
      toolRegistry.registerTool(vsTool);

      const fsTools = toolRegistry.getToolsByCategory('filesystem');
      const vsTools = toolRegistry.getToolsByCategory('vscode');

      assert.strictEqual(fsTools.length, 1);
      assert.strictEqual(fsTools[0].name, 'fs_tool');
      assert.strictEqual(vsTools.length, 1);
      assert.strictEqual(vsTools[0].name, 'vs_tool');
    });
  });

  suite('ParameterValidator', () => {
    test('should validate required parameters', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name']
      };

      const validParams = { name: 'John', age: 30 };
      const invalidParams = { age: 30 };

      const validResult = ParameterValidator.validate(validParams, schema);
      const invalidResult = ParameterValidator.validate(invalidParams, schema);

      assert.strictEqual(validResult.valid, true);
      assert.strictEqual(invalidResult.valid, false);
      assert.ok(invalidResult.errors.some(error => error.includes('Missing required property')));
    });

    test('should validate parameter types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' }
        }
      };

      const validParams = { name: 'John', age: 30, active: true };
      const invalidParams = { name: 123, age: 'thirty', active: 'yes' };

      const validResult = ParameterValidator.validate(validParams, schema);
      const invalidResult = ParameterValidator.validate(invalidParams, schema);

      assert.strictEqual(validResult.valid, true);
      assert.strictEqual(invalidResult.valid, false);
      assert.strictEqual(invalidResult.errors.length, 3);
    });

    test('should validate string constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          shortString: { type: 'string', minLength: 3, maxLength: 10 },
          enumString: { type: 'string', enum: ['red', 'green', 'blue'] }
        }
      };

      const validParams = { shortString: 'hello', enumString: 'red' };
      const invalidParams = { shortString: 'hi', enumString: 'yellow' };

      const validResult = ParameterValidator.validate(validParams, schema);
      const invalidResult = ParameterValidator.validate(invalidParams, schema);

      assert.strictEqual(validResult.valid, true);
      assert.strictEqual(invalidResult.valid, false);
      assert.ok(invalidResult.errors.some(error => error.includes('too short')));
      assert.ok(invalidResult.errors.some(error => error.includes('must be one of')));
    });

    test('should validate array parameters', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      };

      const validParams = { tags: ['tag1', 'tag2'] };
      const invalidParams = { tags: ['tag1', 123] };

      const validResult = ParameterValidator.validate(validParams, schema);
      const invalidResult = ParameterValidator.validate(invalidParams, schema);

      assert.strictEqual(validResult.valid, true);
      assert.strictEqual(invalidResult.valid, false);
    });

    test('should validate number constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          count: { type: 'number', minimum: 1, maximum: 100 }
        }
      };

      const validParams = { count: 50 };
      const tooSmallParams = { count: 0 };
      const tooLargeParams = { count: 101 };

      const validResult = ParameterValidator.validate(validParams, schema);
      const tooSmallResult = ParameterValidator.validate(tooSmallParams, schema);
      const tooLargeResult = ParameterValidator.validate(tooLargeParams, schema);

      assert.strictEqual(validResult.valid, true);
      assert.strictEqual(tooSmallResult.valid, false);
      assert.strictEqual(tooLargeResult.valid, false);
      assert.ok(tooSmallResult.errors.some(error => error.includes('too small')));
      assert.ok(tooLargeResult.errors.some(error => error.includes('too large')));
    });
  });

  suite('SecurityValidator', () => {
    test('should validate security levels', async () => {
      const highRiskTool: ToolDefinition = {
        name: 'high_risk_tool',
        description: 'High risk tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: false, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      const normalContext: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const elevatedContext: ExecutionContext = {
        ...normalContext,
        security: { level: SecurityLevel.ELEVATED, allowDangerous: true }
      };

      const normalResult = await SecurityValidator.validateExecution(highRiskTool, {}, normalContext);
      const elevatedResult = await SecurityValidator.validateExecution(highRiskTool, {}, elevatedContext);

      assert.strictEqual(normalResult.valid, false);
      assert.strictEqual(elevatedResult.valid, true);
    });

    test('should validate permissions', async () => {
      const permissionTool: ToolDefinition = {
        name: 'permission_tool',
        description: 'Tool requiring permissions',
        parameters: { type: 'object', properties: {} },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low',
          permissions: ['filesystem.write', 'vscode.commands']
        },
        executor: async () => ({ success: true })
      };

      const noPermissionsContext: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const withPermissionsContext: ExecutionContext = {
        ...noPermissionsContext,
        user: { id: 'test-user', permissions: ['filesystem.write', 'vscode.commands'] }
      };

      const noPermResult = await SecurityValidator.validateExecution(permissionTool, {}, noPermissionsContext);
      const withPermResult = await SecurityValidator.validateExecution(permissionTool, {}, withPermissionsContext);

      assert.strictEqual(noPermResult.valid, false);
      assert.ok(noPermResult.errors.some(error => error.includes('Missing permissions')));
      assert.strictEqual(withPermResult.valid, true);
    });

    test('should detect dangerous patterns', async () => {
      const safeTool: ToolDefinition = {
        name: 'safe_tool',
        description: 'Safe tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.ELEVATED, allowDangerous: true }
      };

      const safeParams = { command: 'ls -la' };
      const dangerousParams = { command: 'rm -rf /' };

      const safeResult = await SecurityValidator.validateExecution(safeTool, safeParams, context);
      const dangerousResult = await SecurityValidator.validateExecution(safeTool, dangerousParams, context);

      assert.strictEqual(safeResult.valid, true);
      assert.strictEqual(dangerousResult.valid, true); // Still valid but should have warnings
      assert.ok(dangerousResult.warnings && dangerousResult.warnings.length > 0);
    });

    test('should validate web environment restrictions', async () => {
      // Mock window object to simulate web environment
      (global as any).window = {};

      const desktopOnlyTool: ToolDefinition = {
        name: 'desktop_only',
        description: 'Desktop only tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: false, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const result = await SecurityValidator.validateExecution(desktopOnlyTool, {}, context);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(error => error.includes('not allowed in web environment')));

      // Clean up
      delete (global as any).window;
    });
  });

  suite('ToolManager', () => {
    test('should execute tools with validation', async () => {
      const testTool: ToolDefinition = {
        name: 'test_execution',
        description: 'Test execution tool',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async (params) => ({
          success: true,
          data: { echo: params.message }
        })
      };

      toolManager.registerTool(testTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const result = await toolManager.executeTool('test_execution', { message: 'hello' }, context);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.echo, 'hello');
    });

    test('should handle parameter validation errors', async () => {
      const testTool: ToolDefinition = {
        name: 'validation_test',
        description: 'Validation test tool',
        parameters: {
          type: 'object',
          properties: {
            required_param: { type: 'string' }
          },
          required: ['required_param']
        },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(testTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      try {
        await toolManager.executeTool('validation_test', {}, context);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error instanceof ToolExecutionError);
        assert.strictEqual(error.code, 'INVALID_PARAMETERS');
      }
    });

    test('should handle security validation errors', async () => {
      const highRiskTool: ToolDefinition = {
        name: 'security_test',
        description: 'Security test tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(highRiskTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      try {
        await toolManager.executeTool('security_test', {}, context);
        assert.fail('Should have thrown security error');
      } catch (error) {
        assert.ok(error instanceof ToolExecutionError);
        assert.strictEqual(error.code, 'SECURITY_VIOLATION');
      }
    });

    test('should handle tool not found errors', async () => {
      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      try {
        await toolManager.executeTool('nonexistent_tool', {}, context);
        assert.fail('Should have thrown tool not found error');
      } catch (error) {
        assert.ok(error instanceof ToolExecutionError);
        assert.strictEqual(error.code, 'TOOL_NOT_FOUND');
      }
    });

    test('should track execution statistics', async () => {
      const testTool: ToolDefinition = {
        name: 'stats_test',
        description: 'Statistics test tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(testTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // Clear stats first
      toolManager.clearStats();
      
      await toolManager.executeTool('stats_test', {}, context);
      await toolManager.executeTool('stats_test', {}, context);

      const stats = toolManager.getExecutionStats();
      
      assert.strictEqual(stats.totalExecutions, 2);
      assert.strictEqual(stats.successfulExecutions, 2);
      assert.strictEqual(stats.toolUsage['stats_test'], 2);
    });

    test('should handle user approval for dangerous tools', async () => {
      const dangerousTool: ToolDefinition = {
        name: 'dangerous_tool',
        description: 'Dangerous tool requiring approval',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'medium' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(dangerousTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // Mock VS Code window.showWarningMessage to return 'Deny'
      const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);

      try {
        await toolManager.executeTool('dangerous_tool', {}, context);
        assert.fail('Should have thrown user denied error');
      } catch (error) {
        assert.ok(error instanceof ToolExecutionError);
        assert.strictEqual(error.code, 'USER_DENIED');
      }

      assert.ok(showWarningMessageStub.calledOnce);
    });
  });

  suite('BuiltInTools', () => {
    test('should register all built-in tools', () => {
      BuiltInTools.registerAll();
      
      const allTools = toolRegistry.getAllTools();
      const toolNames = allTools.map(tool => tool.name);
      
      assert.ok(toolNames.includes('read_file'));
      assert.ok(toolNames.includes('write_file'));
      assert.ok(toolNames.includes('list_files'));
      assert.ok(toolNames.includes('show_message'));
    });

    test('should categorize tools correctly', () => {
      BuiltInTools.registerAll();
      
      const filesystemTools = toolRegistry.getToolsByCategory('filesystem');
      const vscodeTools = toolRegistry.getToolsByCategory('vscode');
      
      assert.ok(filesystemTools.length >= 3); // read_file, write_file, list_files
      assert.ok(vscodeTools.length >= 1); // show_message
    });

    test('read_file tool should have correct security settings', () => {
      BuiltInTools.registerAll();
      
      const readFileTool = toolRegistry.getTool('read_file');
      assert.ok(readFileTool);
      assert.strictEqual(readFileTool.security.riskLevel, 'low');
      assert.strictEqual(readFileTool.security.requiresApproval, false);
      assert.strictEqual(readFileTool.security.allowedInWeb, true);
      assert.ok(readFileTool.security.permissions?.includes('filesystem.read'));
    });

    test('write_file tool should have correct security settings', () => {
      BuiltInTools.registerAll();
      
      const writeFileTool = toolRegistry.getTool('write_file');
      assert.ok(writeFileTool);
      assert.strictEqual(writeFileTool.security.riskLevel, 'medium');
      assert.strictEqual(writeFileTool.security.requiresApproval, true);
      assert.strictEqual(writeFileTool.security.allowedInWeb, false);
      assert.ok(writeFileTool.security.permissions?.includes('filesystem.write'));
    });
  });
});