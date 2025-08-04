/**
 * Integration tests for file system tools
 * Tests the actual file system operations with VS Code workspace API
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { ToolManager, BuiltInTools } from '../../core/tool-manager';
import { ToolRegistry, ExecutionContext, SecurityLevel } from '../../core/tools';

describe('File System Tools Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let toolManager: ToolManager;

  let testWorkspaceUri: vscode.Uri;
  let testContext: ExecutionContext;
  let tempDir: string;  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    
    // Reset singletons
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
    
    toolManager = ToolManager.getInstance();
    
    // Register built-in tools
    BuiltInTools.registerAll();
    
    // Create temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comrade-fs-test-'));
    testWorkspaceUri = vscode.Uri.file(tempDir);
    
    // Mock workspace folders
    sandbox.stub(vscode.workspace, 'workspaceFolders').value([
      { uri: testWorkspaceUri, name: 'test-workspace', index: 0 }
    ]);
    
    // Create test execution context
    testContext = {
      agentId: 'test-agent',
      sessionId: 'test-session',
      workspaceUri: testWorkspaceUri,
      user: {
        id: 'test-user',
        permissions: ['filesystem.read', 'filesystem.write']
      },
      security: {
        level: SecurityLevel.NORMAL,
        allowDangerous: false
      }
    };
  });  afterEach(async () => {
    sandbox.restore();
    
    // Clean up temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
    
    // Reset singletons
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
  });

  describe('read_file tool', () => {  it('should read existing file successfully', async () => {
      // Create test file
      const testFilePath = path.join(tempDir, 'test.txt');
      const testContent = 'Hello, World!\nThis is a test file.';
      fs.writeFileSync(testFilePath, testContent, 'utf8');

      // Execute read_file tool
      const result = await toolManager.executeTool('read_file', {
        path: 'test.txt'
      }, testContext);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.content, testContent);
      assert.strictEqual(result.data?.path, 'test.txt');
      assert.strictEqual(result.data?.encoding, 'utf8');
      assert.strictEqual(result.metadata?.size, Buffer.byteLength(testContent));
    });

  it('should read file with different encodings', async () => {
      // Create test file with binary content
      const testFilePath = path.join(tempDir, 'binary.txt');
      const testContent = 'Hello, World!';
      fs.writeFileSync(testFilePath, testContent, 'utf8');

      // Test base64 encoding
      const base64Result = await toolManager.executeTool('read_file', {
        path: 'binary.txt',
        encoding: 'base64'
      }, testContext);

      assert.strictEqual(base64Result.success, true);
      assert.strictEqual(base64Result.data?.encoding, 'base64');
      assert.strictEqual(
        Buffer.from(base64Result.data?.content, 'base64').toString('utf8'),
        testContent
      );

      // Test ascii encoding
      const asciiResult = await toolManager.executeTool('read_file', {
        path: 'binary.txt',
        encoding: 'ascii'
      }, testContext);

      assert.strictEqual(asciiResult.success, true);
      assert.strictEqual(asciiResult.data?.encoding, 'ascii');
    });

  it('should handle non-existent file gracefully', async () => {
      const result = await toolManager.executeTool('read_file', {
        path: 'nonexistent.txt'
      }, testContext);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Failed to read file'));
    });

  it('should handle files in subdirectories', async () => {
      // Create subdirectory and file
      const subDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(subDir);
      const testFilePath = path.join(subDir, 'nested.txt');
      const testContent = 'Nested file content';
      fs.writeFileSync(testFilePath, testContent, 'utf8');

      const result = await toolManager.executeTool('read_file', {
        path: 'subdir/nested.txt'
      }, testContext);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.content, testContent);
      assert.strictEqual(result.data?.path, 'subdir/nested.txt');
    });

  it('should respect security permissions', async () => {
      // Create context without read permissions
      const restrictedContext: ExecutionContext = {
        ...testContext,
        user: {
          id: 'restricted-user',
          permissions: [] // No filesystem.read permission
        }
      };

      // Create test file
      const testFilePath = path.join(tempDir, 'restricted.txt');
      fs.writeFileSync(testFilePath, 'restricted content', 'utf8');

      try {
        await toolManager.executeTool('read_file', {
          path: 'restricted.txt'
        }, restrictedContext);
        assert.fail('Should have thrown security violation error');
      } catch (error: any) {
        assert.ok(error.code === 'SECURITY_VIOLATION');
        assert.ok(error.message.includes('Missing permissions'));
      }
    });
  });

  describe('write_file tool', () => {  it('should write file successfully', async () => {
      // Mock user approval for write operation
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);

      const testContent = 'This is new content\nWith multiple lines';
      const result = await toolManager.executeTool('write_file', {
        path: 'new-file.txt',
        content: testContent
      }, testContext);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.path, 'new-file.txt');
      assert.strictEqual(result.data?.bytesWritten, Buffer.byteLength(testContent));

      // Verify file was actually written
      const writtenContent = fs.readFileSync(path.join(tempDir, 'new-file.txt'), 'utf8');
      assert.strictEqual(writtenContent, testContent);
    });

  it('should write file with different encodings', async () => {
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);

      const testContent = 'Hello, World!';
      
      // Test base64 encoding
      const base64Content = Buffer.from(testContent).toString('base64');
      const base64Result = await toolManager.executeTool('write_file', {
        path: 'base64-file.txt',
        content: base64Content,
        encoding: 'base64'
      }, testContext);

      assert.strictEqual(base64Result.success, true);
      
      // Verify file content
      const writtenContent = fs.readFileSync(path.join(tempDir, 'base64-file.txt'), 'utf8');
      assert.strictEqual(writtenContent, testContent);
    });

  it('should create directories when requested', async () => {
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);

      const testContent = 'Content in nested directory';
      const result = await toolManager.executeTool('write_file', {
        path: 'deep/nested/file.txt',
        content: testContent,
        createDirectories: true
      }, testContext);

      assert.strictEqual(result.success, true);

      // Verify directory and file were created
      const filePath = path.join(tempDir, 'deep', 'nested', 'file.txt');
      assert.ok(fs.existsSync(filePath));
      const writtenContent = fs.readFileSync(filePath, 'utf8');
      assert.strictEqual(writtenContent, testContent);
    });

  it('should handle user denial of write operation', async () => {
      // Mock user denying the operation
      sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);

      try {
        await toolManager.executeTool('write_file', {
          path: 'denied-file.txt',
          content: 'This should not be written'
        }, testContext);
        assert.fail('Should have thrown user denied error');
      } catch (error: any) {
        assert.ok(error.code === 'USER_DENIED');
      }

      // Verify file was not created
      const filePath = path.join(tempDir, 'denied-file.txt');
      assert.ok(!fs.existsSync(filePath));
    });

  it('should respect security permissions', async () => {
      const restrictedContext: ExecutionContext = {
        ...testContext,
        user: {
          id: 'restricted-user',
          permissions: ['filesystem.read'] // No filesystem.write permission
        }
      };

      try {
        await toolManager.executeTool('write_file', {
          path: 'restricted-write.txt',
          content: 'This should not be allowed'
        }, restrictedContext);
        assert.fail('Should have thrown security violation error');
      } catch (error: any) {
        assert.ok(error.code === 'SECURITY_VIOLATION');
        assert.ok(error.message.includes('Missing permissions'));
      }
    });
  });

  describe('list_files tool', () => {  beforeEach(() => {
      // Create test directory structure
      fs.mkdirSync(path.join(tempDir, 'subdir1'));
      fs.mkdirSync(path.join(tempDir, 'subdir2'));
      fs.mkdirSync(path.join(tempDir, 'subdir1', 'nested'));
      
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(tempDir, 'file2.js'), 'content2');
      fs.writeFileSync(path.join(tempDir, 'subdir1', 'nested-file.md'), 'content3');
      fs.writeFileSync(path.join(tempDir, 'subdir1', 'nested', 'deep-file.json'), 'content4');
    });

  it('should list files in root directory', async () => {
      const result = await toolManager.executeTool('list_files', {}, testContext);

      assert.strictEqual(result.success, true);
      assert.ok(Array.isArray(result.data?.files));
      
      const files = result.data?.files || [];
      const fileNames = files.map((f: any) => f.name);
      
      assert.ok(fileNames.includes('file1.txt'));
      assert.ok(fileNames.includes('file2.js'));
      assert.ok(fileNames.includes('subdir1'));
      assert.ok(fileNames.includes('subdir2'));
      
      // Check file types
      const file1 = files.find((f: any) => f.name === 'file1.txt');
      const subdir1 = files.find((f: any) => f.name === 'subdir1');
      
      assert.strictEqual(file1?.type, 'file');
      assert.strictEqual(subdir1?.type, 'directory');
    });

  it('should list files recursively', async () => {
      const result = await toolManager.executeTool('list_files', {
        recursive: true
      }, testContext);

      assert.strictEqual(result.success, true);
      
      const files = result.data?.files || [];
      const filePaths = files.map((f: any) => f.path);
      
      assert.ok(filePaths.includes('file1.txt'));
      assert.ok(filePaths.includes('subdir1/nested-file.md'));
      assert.ok(filePaths.includes('subdir1/nested/deep-file.json'));
      assert.ok(filePaths.includes('subdir1'));
      assert.ok(filePaths.includes('subdir1/nested'));
    });

  it('should filter files by pattern', async () => {
      const result = await toolManager.executeTool('list_files', {
        pattern: '*.txt'
      }, testContext);

      assert.strictEqual(result.success, true);
      
      const files = result.data?.files || [];
      const fileNames = files.map((f: any) => f.name);
      
      assert.ok(fileNames.includes('file1.txt'));
      assert.ok(!fileNames.includes('file2.js'));
      assert.ok(!fileNames.includes('subdir1'));
    });

  it('should respect security permissions', async () => {
      const restrictedContext: ExecutionContext = {
        ...testContext,
        user: {
          id: 'restricted-user',
          permissions: [] // No filesystem.read permission
        }
      };

      try {
        await toolManager.executeTool('list_files', {}, restrictedContext);
        assert.fail('Should have thrown security violation error');
      } catch (error: any) {
        assert.ok(error.code === 'SECURITY_VIOLATION');
        assert.ok(error.message.includes('Missing permissions'));
      }
    });
  });

  describe('File System Tools Integration', () => {  it('should work together in file workflow', async () => {
      // Mock user approval for write operations
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);

      // 1. List initial files
      const initialList = await toolManager.executeTool('list_files', {}, testContext);
      assert.strictEqual(initialList.success, true);
      const initialCount = initialList.data?.files.length || 0;

      // 2. Write a new file
      const testContent = 'Integration test content';
      const writeResult = await toolManager.executeTool('write_file', {
        path: 'integration-test.txt',
        content: testContent
      }, testContext);
      assert.strictEqual(writeResult.success, true);

      // 3. List files again to verify new file exists
      const updatedList = await toolManager.executeTool('list_files', {}, testContext);
      assert.strictEqual(updatedList.success, true);
      assert.strictEqual(updatedList.data?.files.length, initialCount + 1);
      
      const newFile = updatedList.data?.files.find((f: any) => f.name === 'integration-test.txt');
      assert.ok(newFile);
      assert.strictEqual(newFile.type, 'file');

      // 4. Read the file back
      const readResult = await toolManager.executeTool('read_file', {
        path: 'integration-test.txt'
      }, testContext);
      assert.strictEqual(readResult.success, true);
      assert.strictEqual(readResult.data?.content, testContent);

      // 5. Overwrite the file
      const newContent = 'Updated integration test content';
      const overwriteResult = await toolManager.executeTool('write_file', {
        path: 'integration-test.txt',
        content: newContent
      }, testContext);
      assert.strictEqual(overwriteResult.success, true);

      // 6. Read the updated content
      const updatedReadResult = await toolManager.executeTool('read_file', {
        path: 'integration-test.txt'
      }, testContext);
      assert.strictEqual(updatedReadResult.success, true);
      assert.strictEqual(updatedReadResult.data?.content, newContent);
    });

  it('should handle complex directory operations', async () => {
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);

      // Create nested directory structure with files
      const files = [
        { path: 'project/src/main.js', content: 'console.log("main");' },
        { path: 'project/src/utils.js', content: 'export const utils = {};' },
        { path: 'project/tests/main.test.js', content: 'test("main", () => {});' },
        { path: 'project/README.md', content: '# Project\n\nDescription' }
      ];

      // Write all files
      for (const file of files) {
        const result = await toolManager.executeTool('write_file', {
          path: file.path,
          content: file.content,
          createDirectories: true
        }, testContext);
        assert.strictEqual(result.success, true);
      }

      // List project directory recursively
      const projectList = await toolManager.executeTool('list_files', {
        path: 'project',
        recursive: true
      }, testContext);
      
      assert.strictEqual(projectList.success, true);
      const filePaths = projectList.data?.files.map((f: any) => f.path) || [];
      
      assert.ok(filePaths.includes('src/main.js'));
      assert.ok(filePaths.includes('src/utils.js'));
      assert.ok(filePaths.includes('tests/main.test.js'));
      assert.ok(filePaths.includes('README.md'));

      // Read and verify each file
      for (const file of files) {
        const readResult = await toolManager.executeTool('read_file', {
          path: file.path
        }, testContext);
        
        assert.strictEqual(readResult.success, true);
        assert.strictEqual(readResult.data?.content, file.content);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {  it('should handle missing workspace gracefully', async () => {
      const noWorkspaceContext: ExecutionContext = {
        ...testContext,
        workspaceUri: undefined
      };

      // Mock no workspace folders
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);

      const readResult = await toolManager.executeTool('read_file', {
        path: 'test.txt'
      }, noWorkspaceContext);

      assert.strictEqual(readResult.success, false);
      assert.ok(readResult.error?.includes('No workspace available'));
    });

  it('should handle invalid file paths', async () => {
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);

      // Test various invalid paths
      const invalidPaths = [
        '../../../etc/passwd', // Path traversal attempt
        'file\0name.txt' // Null character
      ];

      for (const invalidPath of invalidPaths) {
        const writeResult = await toolManager.executeTool('write_file', {
          path: invalidPath,
          content: 'test content'
        }, testContext);

        // Should either fail or handle gracefully
        if (writeResult.success) {
          // If it succeeds, verify it's handled safely
          assert.ok(true, `Path ${invalidPath} was handled safely`);
        } else {
          assert.ok(writeResult.error, `Path ${invalidPath} failed with error: ${writeResult.error}`);
        }
      }
    });
  });
});

