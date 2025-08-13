import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ToolRegistry } from '../../core/tool-registry';
import { registerBuiltInTools, getBuiltInTools } from '../../core/tools/index';

describe('Built-in Tools Integration', () => {
  let registry: ToolRegistry;
  const testDir = path.join(process.cwd(), 'test-temp-integration');

  beforeEach(async () => {
    registry = new ToolRegistry();
    registerBuiltInTools(registry);

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

  it('should register all built-in tools', () => {
    const tools = registry.getAllTools();
    const toolNames = tools.map(t => t.name);

    // File operations
    assert.ok(toolNames.includes('read_file'));
    assert.ok(toolNames.includes('write_file'));
    assert.ok(toolNames.includes('create_file'));
    assert.ok(toolNames.includes('delete_file'));
    assert.ok(toolNames.includes('list_directory'));

    // Command execution
    assert.ok(toolNames.includes('execute_command'));

    // Workspace navigation
    assert.ok(toolNames.includes('get_working_directory'));
    assert.ok(toolNames.includes('find_files'));
    assert.ok(toolNames.includes('get_file_info'));
    assert.ok(toolNames.includes('create_directory'));

    assert.strictEqual(tools.length, 10);
  });

  it('should provide tool schemas for AI consumption', () => {
    const schemas = registry.getToolSchemas();
    
    assert.strictEqual(schemas.length, 10);
    
    const readFileSchema = schemas.find(s => s.name === 'read_file');
    assert.ok(readFileSchema);
    assert.ok(readFileSchema.description);
    assert.ok(readFileSchema.parameters);
    assert.ok(readFileSchema.parameters.properties);
    assert.ok(readFileSchema.parameters.required);
  });

  it('should execute complete file workflow', async () => {
    const testFile = path.join(testDir, 'workflow-test.txt');
    const testContent = 'This is a test file for workflow testing.';

    // 1. Create directory
    let result = await registry.executeTool('create_directory', { path: testDir });
    assert.strictEqual(result.success, true);

    // 2. Create file
    result = await registry.executeTool('create_file', { 
      path: testFile, 
      content: testContent 
    });
    assert.strictEqual(result.success, true);

    // 3. Read file
    result = await registry.executeTool('read_file', { path: testFile });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, testContent);

    // 4. Get file info
    result = await registry.executeTool('get_file_info', { path: testFile });
    assert.strictEqual(result.success, true);
    const info = JSON.parse(result.output!);
    assert.strictEqual(info.type, 'file');
    assert.strictEqual(info.size, testContent.length);

    // 5. List directory
    result = await registry.executeTool('list_directory', { path: testDir });
    assert.strictEqual(result.success, true);
    const contents = JSON.parse(result.output!);
    assert.ok(contents.some((item: any) => item.name === 'workflow-test.txt'));

    // 6. Write to file (modify)
    const newContent = 'Modified content';
    result = await registry.executeTool('write_file', { 
      path: testFile, 
      content: newContent 
    });
    assert.strictEqual(result.success, true);

    // 7. Read modified file
    result = await registry.executeTool('read_file', { path: testFile });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, newContent);

    // 8. Delete file
    result = await registry.executeTool('delete_file', { path: testFile });
    assert.strictEqual(result.success, true);

    // 9. Verify file is deleted
    result = await registry.executeTool('read_file', { path: testFile });
    assert.strictEqual(result.success, false);
  });

  it('should execute workspace navigation workflow', async () => {
    // Create test structure
    await fs.promises.mkdir(path.join(testDir, 'src'), { recursive: true });
    await fs.promises.writeFile(path.join(testDir, 'package.json'), '{}');
    await fs.promises.writeFile(path.join(testDir, 'src', 'index.js'), 'console.log("hello");');
    await fs.promises.writeFile(path.join(testDir, 'src', 'utils.ts'), 'export const util = 1;');

    // 1. Get working directory
    let result = await registry.executeTool('get_working_directory', {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, process.cwd());

    // 2. Find JavaScript files
    result = await registry.executeTool('find_files', { 
      pattern: '*.js',
      directory: testDir
    });
    assert.strictEqual(result.success, true);
    const jsFiles = JSON.parse(result.output!);
    assert.ok(jsFiles.some((f: any) => f.name === 'index.js'));

    // 3. Find TypeScript files
    result = await registry.executeTool('find_files', { 
      pattern: '*.ts',
      directory: testDir
    });
    assert.strictEqual(result.success, true);
    const tsFiles = JSON.parse(result.output!);
    assert.ok(tsFiles.some((f: any) => f.name === 'utils.ts'));

    // 4. List directory recursively
    result = await registry.executeTool('list_directory', { 
      path: testDir,
      recursive: true
    });
    assert.strictEqual(result.success, true);
    const allFiles = JSON.parse(result.output!);
    assert.ok(allFiles.some((f: any) => f.name === 'package.json'));
    assert.ok(allFiles.some((f: any) => f.name === 'index.js'));
    assert.ok(allFiles.some((f: any) => f.name === 'utils.ts'));
  });

  it('should execute safe commands', async () => {
    const safeCommand = process.platform === 'win32' ? 'echo Hello' : 'echo "Hello"';
    
    const result = await registry.executeTool('execute_command', { 
      command: safeCommand
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.output?.includes('Hello'));
  });

  it('should block unsafe commands', async () => {
    const result = await registry.executeTool('execute_command', { 
      command: 'rm -rf /'
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Command blocked for safety'));
  });

  it('should handle tool execution errors gracefully', async () => {
    // Try to read non-existent file
    const result = await registry.executeTool('read_file', { 
      path: 'non-existent-file.txt'
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.metadata);
    assert.strictEqual(result.metadata.toolName, 'read_file');
    assert.ok(result.metadata.executionTime >= 0);
  });

  it('should validate tool parameters', async () => {
    // Missing required parameter
    const result = await registry.executeTool('read_file', {});

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Required parameter 'path' is missing"));
  });

  it('should provide consistent metadata across all tools', async () => {
    const testFile = path.join(testDir, 'metadata-test.txt');
    
    // Create file first
    await registry.executeTool('create_file', { 
      path: testFile, 
      content: 'test' 
    });

    const tools = ['read_file', 'write_file', 'get_file_info', 'delete_file'];
    
    for (const toolName of tools) {
      let params: any = { path: testFile };
      if (toolName === 'write_file') {
        params.content = 'new content';
      }

      const result = await registry.executeTool(toolName, params);
      
      // All tools should provide consistent metadata
      assert.ok(result.metadata);
      assert.strictEqual(result.metadata.toolName, toolName);
      assert.ok(typeof result.metadata.executionTime === 'number');
      assert.ok(result.metadata.timestamp instanceof Date);
      assert.deepStrictEqual(result.metadata.parameters, params);

      // Recreate file for next iteration if it was deleted
      if (toolName === 'delete_file') {
        await registry.executeTool('create_file', { 
          path: testFile, 
          content: 'test' 
        });
      }
    }
  });

  it('should get all built-in tools without registry', () => {
    const tools = getBuiltInTools();
    
    assert.strictEqual(tools.length, 10);
    
    const toolNames = tools.map(t => t.name);
    assert.ok(toolNames.includes('read_file'));
    assert.ok(toolNames.includes('execute_command'));
    assert.ok(toolNames.includes('find_files'));
  });
});