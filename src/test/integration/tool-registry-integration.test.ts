import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ToolRegistry } from '../../core/tool-registry';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '../../core/tools/file-operations';

describe('Tool Registry Integration', () => {
  let registry: ToolRegistry;
  const testDir = path.join(process.cwd(), 'test-integration-temp');
  const testFile = path.join(testDir, 'integration-test.txt');
  const testContent = 'Integration test content';

  beforeEach(async () => {
    registry = new ToolRegistry();
    
    // Register built-in tools
    registry.registerTool(new ReadFileTool());
    registry.registerTool(new WriteFileTool());
    registry.registerTool(new ListDirectoryTool());
    
    // Create test directory
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should register and execute file operation tools', async () => {
    // Verify tools are registered
    assert.strictEqual(registry.size(), 3);
    assert.ok(registry.getTool('read_file'));
    assert.ok(registry.getTool('write_file'));
    assert.ok(registry.getTool('list_directory'));
  });

  it('should execute complete file workflow', async () => {
    // 1. Write a file
    const writeResult = await registry.executeTool('write_file', {
      path: testFile,
      content: testContent
    });
    
    assert.strictEqual(writeResult.success, true);
    assert.ok(writeResult.output?.includes('Successfully wrote'));
    
    // 2. Read the file back
    const readResult = await registry.executeTool('read_file', {
      path: testFile
    });
    
    assert.strictEqual(readResult.success, true);
    assert.strictEqual(readResult.output, testContent);
    
    // 3. List directory contents
    const listResult = await registry.executeTool('list_directory', {
      path: testDir
    });
    
    assert.strictEqual(listResult.success, true);
    const contents = JSON.parse(listResult.output!);
    assert.ok(contents.some((item: any) => item.name === 'integration-test.txt'));
  });

  it('should generate proper tool schemas for AI consumption', () => {
    const schemas = registry.getToolSchemas();
    
    assert.strictEqual(schemas.length, 3);
    
    // Check read_file schema
    const readSchema = schemas.find(s => s.name === 'read_file');
    assert.ok(readSchema);
    assert.strictEqual(readSchema.description, 'Read the contents of a file');
    assert.ok(readSchema.parameters.properties.path);
    assert.ok(readSchema.parameters.required.includes('path'));
    
    // Check write_file schema
    const writeSchema = schemas.find(s => s.name === 'write_file');
    assert.ok(writeSchema);
    assert.strictEqual(writeSchema.description, 'Write content to a file');
    assert.ok(writeSchema.parameters.properties.path);
    assert.ok(writeSchema.parameters.properties.content);
    assert.ok(writeSchema.parameters.required.includes('path'));
    assert.ok(writeSchema.parameters.required.includes('content'));
    
    // Check list_directory schema
    const listSchema = schemas.find(s => s.name === 'list_directory');
    assert.ok(listSchema);
    assert.strictEqual(listSchema.description, 'List the contents of a directory');
    assert.ok(listSchema.parameters.properties.path);
    assert.ok(listSchema.parameters.required.includes('path'));
  });

  it('should handle tool call format from AI responses', async () => {
    // Simulate tool call from AI response
    const toolCall = {
      id: 'call_123',
      name: 'write_file',
      parameters: {
        path: testFile,
        content: 'AI generated content'
      }
    };
    
    const result = await registry.executeToolCall(toolCall);
    
    assert.strictEqual(result.success, true);
    assert.ok(result.output?.includes('Successfully wrote'));
    assert.strictEqual(result.metadata.toolName, 'write_file');
    
    // Verify file was actually written
    const fileContent = await fs.promises.readFile(testFile, 'utf-8');
    assert.strictEqual(fileContent, 'AI generated content');
  });

  it('should handle errors gracefully in tool execution', async () => {
    // Try to read non-existent file
    const result = await registry.executeTool('read_file', {
      path: 'non-existent-file.txt'
    });
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.metadata.executionTime > 0);
    assert.strictEqual(result.metadata.toolName, 'read_file');
  });
});