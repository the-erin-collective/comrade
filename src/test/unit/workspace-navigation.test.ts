import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { 
  GetWorkingDirectoryTool,
  FindFilesTool,
  GetFileInfoTool,
  CreateDirectoryTool
} from '../../core/tools/workspace-navigation';

describe('Workspace Navigation Tools', () => {
  const testDir = path.join(process.cwd(), 'test-temp-nav');
  const testFile = path.join(testDir, 'test.txt');
  const testContent = 'Hello, World!';

  beforeEach(async () => {
    // Create test directory structure
    await fs.promises.mkdir(testDir, { recursive: true });
    await fs.promises.mkdir(path.join(testDir, 'subdir'), { recursive: true });
    await fs.promises.writeFile(testFile, testContent);
    await fs.promises.writeFile(path.join(testDir, 'test.js'), 'console.log("test");');
    await fs.promises.writeFile(path.join(testDir, 'subdir', 'nested.ts'), 'const x = 1;');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('GetWorkingDirectoryTool', () => {
    let cwdTool: GetWorkingDirectoryTool;

    beforeEach(() => {
      cwdTool = new GetWorkingDirectoryTool();
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(cwdTool.name, 'get_working_directory');
      assert.strictEqual(cwdTool.description, 'Get the current working directory');
      assert.strictEqual(cwdTool.parameters.length, 0);
    });

    it('should return current working directory', async () => {
      const result = await cwdTool.execute({});

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, process.cwd());
      assert.strictEqual(result.metadata.toolName, 'get_working_directory');
      assert.ok(result.metadata.executionTime >= 0);
    });
  });

  describe('FindFilesTool', () => {
    let findTool: FindFilesTool;

    beforeEach(() => {
      findTool = new FindFilesTool();
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(findTool.name, 'find_files');
      assert.strictEqual(findTool.description, 'Find files matching a pattern in the workspace');
      assert.strictEqual(findTool.parameters.length, 3);
      assert.strictEqual(findTool.parameters[0].name, 'pattern');
      assert.strictEqual(findTool.parameters[1].name, 'directory');
      assert.strictEqual(findTool.parameters[2].name, 'maxResults');
      assert.strictEqual(findTool.parameters[0].required, true);
      assert.strictEqual(findTool.parameters[1].required, false);
      assert.strictEqual(findTool.parameters[2].required, false);
    });

    it('should find files by pattern', async () => {
      const result = await findTool.execute({ 
        pattern: '*.txt',
        directory: testDir
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.output);

      const files = JSON.parse(result.output!);
      assert.ok(files.length > 0);
      
      const txtFile = files.find((f: any) => f.name === 'test.txt');
      assert.ok(txtFile);
      assert.strictEqual(txtFile.type, 'file');
    });

    it('should find JavaScript files', async () => {
      const result = await findTool.execute({ 
        pattern: '*.js',
        directory: testDir
      });

      assert.strictEqual(result.success, true);
      const files = JSON.parse(result.output!);
      
      const jsFile = files.find((f: any) => f.name === 'test.js');
      assert.ok(jsFile);
    });

    it('should find TypeScript files recursively', async () => {
      const result = await findTool.execute({ 
        pattern: '*.ts',
        directory: testDir
      });

      assert.strictEqual(result.success, true);
      const files = JSON.parse(result.output!);
      
      const tsFile = files.find((f: any) => f.name === 'nested.ts');
      assert.ok(tsFile);
      assert.ok(tsFile.path.includes('subdir'));
    });

    it('should respect maxResults parameter', async () => {
      const result = await findTool.execute({ 
        pattern: '*',
        directory: testDir,
        maxResults: 1
      });

      assert.strictEqual(result.success, true);
      const files = JSON.parse(result.output!);
      assert.strictEqual(files.length, 1);
    });

    it('should prevent searching outside workspace', async () => {
      const result = await findTool.execute({ 
        pattern: '*',
        directory: '/etc'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Access denied: Cannot search outside workspace'));
    });

    it('should fail when pattern parameter is missing', async () => {
      const result = await findTool.execute({ directory: testDir });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Required parameter 'pattern' is missing"));
    });
  });

  describe('GetFileInfoTool', () => {
    let infoTool: GetFileInfoTool;

    beforeEach(() => {
      infoTool = new GetFileInfoTool();
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(infoTool.name, 'get_file_info');
      assert.strictEqual(infoTool.description, 'Get detailed information about a file or directory');
      assert.strictEqual(infoTool.parameters.length, 1);
      assert.strictEqual(infoTool.parameters[0].name, 'path');
      assert.strictEqual(infoTool.parameters[0].required, true);
    });

    it('should get file information', async () => {
      const result = await infoTool.execute({ path: testFile });

      assert.strictEqual(result.success, true);
      assert.ok(result.output);

      const info = JSON.parse(result.output!);
      assert.strictEqual(info.name, 'test.txt');
      assert.strictEqual(info.type, 'file');
      assert.strictEqual(info.size, testContent.length);
      assert.strictEqual(info.extension, '.txt');
      assert.strictEqual(info.basename, 'test');
      assert.ok(info.created);
      assert.ok(info.modified);
      assert.ok(info.permissions);
    });

    it('should get directory information', async () => {
      const result = await infoTool.execute({ path: testDir });

      assert.strictEqual(result.success, true);
      const info = JSON.parse(result.output!);
      assert.strictEqual(info.type, 'directory');
      assert.ok(info.permissions);
    });

    it('should fail when file does not exist', async () => {
      const result = await infoTool.execute({ path: 'non-existent.txt' });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('ENOENT'));
    });

    it('should prevent accessing outside workspace', async () => {
      const result = await infoTool.execute({ path: '/etc/passwd' });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Access denied: Cannot access files outside workspace'));
    });

    it('should fail when path parameter is missing', async () => {
      const result = await infoTool.execute({});

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Required parameter 'path' is missing"));
    });
  });

  describe('CreateDirectoryTool', () => {
    let createDirTool: CreateDirectoryTool;

    beforeEach(() => {
      createDirTool = new CreateDirectoryTool();
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(createDirTool.name, 'create_directory');
      assert.strictEqual(createDirTool.description, 'Create a new directory');
      assert.strictEqual(createDirTool.parameters.length, 2);
      assert.strictEqual(createDirTool.parameters[0].name, 'path');
      assert.strictEqual(createDirTool.parameters[1].name, 'recursive');
      assert.strictEqual(createDirTool.parameters[0].required, true);
      assert.strictEqual(createDirTool.parameters[1].required, false);
    });

    it('should create directory successfully', async () => {
      const newDir = path.join(testDir, 'new-directory');
      const result = await createDirTool.execute({ path: newDir });

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('Successfully created directory'));

      // Verify directory was created
      const stats = await fs.promises.stat(newDir);
      assert.ok(stats.isDirectory());
    });

    it('should create nested directories with recursive option', async () => {
      const nestedDir = path.join(testDir, 'level1', 'level2', 'level3');
      const result = await createDirTool.execute({ 
        path: nestedDir,
        recursive: true
      });

      assert.strictEqual(result.success, true);

      // Verify nested directory was created
      const stats = await fs.promises.stat(nestedDir);
      assert.ok(stats.isDirectory());
    });

    it('should fail when creating nested directories without recursive option', async () => {
      const nestedDir = path.join(testDir, 'nonexistent', 'level2');
      const result = await createDirTool.execute({ 
        path: nestedDir,
        recursive: false
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('ENOENT'));
    });

    it('should prevent creating directories outside workspace', async () => {
      const result = await createDirTool.execute({ path: '/tmp/test-dir' });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Access denied: Cannot create directories outside workspace'));
    });

    it('should fail when path parameter is missing', async () => {
      const result = await createDirTool.execute({});

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Required parameter 'path' is missing"));
    });

    it('should handle existing directory gracefully', async () => {
      // Try to create directory that already exists
      const result = await createDirTool.execute({ path: testDir });

      // Should succeed (mkdir with recursive handles existing directories)
      assert.strictEqual(result.success, true);
    });
  });
});