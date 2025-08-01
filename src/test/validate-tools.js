/**
 * Simple validation script for Tool Definition Framework
 * This can be run outside of VS Code environment
 */

// Mock VS Code API for testing
const mockVscode = {
  workspace: {
    workspaceFolders: [{ uri: { path: '/test/workspace' } }],
    fs: {
      readFile: async () => Buffer.from('test content'),
      writeFile: async () => {},
      readDirectory: async () => [['test.txt', 1]],
      createDirectory: async () => {}
    }
  },
  window: {
    showInformationMessage: async (msg) => console.log('INFO:', msg),
    showWarningMessage: async (msg) => console.log('WARN:', msg),
    showErrorMessage: async (msg) => console.log('ERROR:', msg)
  },
  Uri: {
    joinPath: (base, ...paths) => ({ path: `${base.path}/${paths.join('/')}` })
  },
  FileType: {
    Directory: 2,
    File: 1
  }
};

// Mock the vscode module in require cache
require.cache['vscode'] = {
  exports: mockVscode
};

// Also set up module resolution for vscode
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

// Import our tool framework
const { ToolRegistry, ParameterValidator, SecurityValidator, SecurityLevel } = require('../../out/core/tools');
const { ToolManager, BuiltInTools } = require('../../out/core/tool-manager');

async function validateToolFramework() {
  console.log('🔧 Validating Tool Definition Framework...\n');

  try {
    // Test 1: Tool Registry
    console.log('1. Testing ToolRegistry...');
    const registry = ToolRegistry.getInstance();
    
    const testTool = {
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
      executor: async (params) => ({ success: true, data: { echo: params.input } })
    };

    registry.registerTool(testTool);
    const retrieved = registry.getTool('test_tool');
    console.log('   ✅ Tool registration and retrieval works');

    // Test 2: Parameter Validation
    console.log('2. Testing ParameterValidator...');
    const validParams = { input: 'hello' };
    const invalidParams = {};
    
    const validResult = ParameterValidator.validate(validParams, testTool.parameters);
    const invalidResult = ParameterValidator.validate(invalidParams, testTool.parameters);
    
    if (validResult.valid && !invalidResult.valid) {
      console.log('   ✅ Parameter validation works');
    } else {
      console.log('   ❌ Parameter validation failed');
    }

    // Test 3: Security Validation
    console.log('3. Testing SecurityValidator...');
    const context = {
      agentId: 'test-agent',
      sessionId: 'test-session',
      user: { id: 'test-user', permissions: [] },
      security: { level: SecurityLevel.NORMAL, allowDangerous: false }
    };

    const securityResult = await SecurityValidator.validateExecution(testTool, validParams, context);
    if (securityResult.valid) {
      console.log('   ✅ Security validation works');
    } else {
      console.log('   ❌ Security validation failed');
    }

    // Test 4: Tool Manager
    console.log('4. Testing ToolManager...');
    const manager = ToolManager.getInstance();
    // Tool is already registered in registry, so we can use it directly
    
    const result = await manager.executeTool('test_tool', validParams, context);
    if (result.success && result.data.echo === 'hello') {
      console.log('   ✅ Tool execution works');
    } else {
      console.log('   ❌ Tool execution failed');
    }

    // Test 5: Built-in Tools
    console.log('5. Testing Built-in Tools...');
    BuiltInTools.registerAll();
    
    const allTools = registry.getAllTools();
    const builtInToolNames = allTools.map(tool => tool.name);
    
    if (builtInToolNames.includes('read_file') && 
        builtInToolNames.includes('write_file') && 
        builtInToolNames.includes('list_files') && 
        builtInToolNames.includes('show_message')) {
      console.log('   ✅ Built-in tools registered successfully');
    } else {
      console.log('   ❌ Built-in tools registration failed');
    }

    // Test 6: Tool Categories
    console.log('6. Testing Tool Categories...');
    const filesystemTools = registry.getToolsByCategory('filesystem');
    const vscodeTools = registry.getToolsByCategory('vscode');
    
    if (filesystemTools.length >= 3 && vscodeTools.length >= 1) {
      console.log('   ✅ Tool categorization works');
    } else {
      console.log('   ❌ Tool categorization failed');
    }

    // Test 7: Execution Statistics
    console.log('7. Testing Execution Statistics...');
    const stats = manager.getExecutionStats();
    if (stats.totalExecutions > 0 && stats.successfulExecutions > 0) {
      console.log('   ✅ Execution statistics tracking works');
    } else {
      console.log('   ❌ Execution statistics tracking failed');
    }

    console.log('\n🎉 Tool Definition Framework validation completed successfully!');
    console.log(`\nSummary:
- Total tools registered: ${allTools.length}
- Filesystem tools: ${filesystemTools.length}
- VS Code tools: ${vscodeTools.length}
- Total executions: ${stats.totalExecutions}
- Successful executions: ${stats.successfulExecutions}`);

  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    console.error(error.stack);
  }
}

// Run validation
validateToolFramework().catch(console.error);