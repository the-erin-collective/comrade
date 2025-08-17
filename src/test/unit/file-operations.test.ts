import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { 
  ReadFileTool, 
  WriteFileTool, 
  CreateFileTool,
  DeleteFileTool,
  ListDirectoryTool 
} from '../../core/tools/file-operations';

describe('File Operations Tools', () => {
  const testDir = path.join(process.cwd(), `test-temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const testFile = path.join(testDir, 'test.txt');
  const testContent = 'Hello, World!';

  beforeEach(async () => {
    // Create test directory
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
      // Small delay to ensure cleanup completes
      await new Promise(resolve => setTimeout(resolve, 10));
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('ReadFileTool', () => {
    let readTool: ReadFileTool;

    beforeEach(() => {
      readTool = new ReadFileTool();
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(readTool.name, 'read_file');
      assert.strictEqual(readTool.description, 'Read the contents of a file');
      assert.strictEqual(readTool.parameters.length, 1);
      assert.strictEqual(readTool.parameters[0].name, 'path');
      assert.strictEqual(readTool.parameters[0].required, true);
    });

    it('should read file successfully', async () => {
      // Create test file
      await fs.promises.writeFile(testFile, testContent);

      const result = await readTool.execute({ path: testFile });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, testContent);
      assert.strictEqual(result.metadata.toolName, 'read_file');
      assert.ok(result.metadata.executionTime > 0);
    });

    it('should fail when file does not exist', async () => {
      const result = await readTool.execute({ path: 'non-existent.txt' });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('ENOENT'));
    });

    it('should fail when path parameter is missing', async () => {
      const result = await readTool.execute({});

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Required parameter 'path' is missing"));
    });

    it('should prevent reading outside workspace', async () => {
      const outsidePath = path.join('/', 'etc', 'passwd');
      const result = await readTool.execute({ path: outsidePath });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Access denied: Cannot read files outside workspace'));
    });
  });

  describe('WriteFileTool', () => {
    let writeTool: WriteFileTool;

    beforeEach(() => {
      writeTool = new WriteFileTool();
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(writeTool.name, 'write_file');
      assert.strictEqual(writeTool.description, 'Write content to a file');
      assert.strictEqual(writeTool.parameters.length, 2);
      assert.strictEqual(writeTool.parameters[0].name, 'path');
      assert.strictEqual(writeTool.parameters[1].name, 'content');
      assert.strictEqual(writeTool.parameters[0].required, true);
      assert.strictEqual(writeTool.parameters[1].required, true);
    });

    it('should write file successfully', async () => {
      const result = await writeTool.execute({ 
        path: testFile, 
        content: testContent 
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('Successfully wrote'));
      assert.ok(result.output?.includes(testContent.length.toString()));

      // Verify file was written
      const fileContent = await fs.promises.readFile(testFile, 'utf-8');
      assert.strictEqual(fileContent, testContent);
    });

    it('should fail when path parameter is missing', async () => {
      const result = await writeTool.execute({ content: testContent });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Required parameter 'path' is missing"));
    });

    it('should fail when content parameter is missing', async () => {
      const result = await writeTool.execute({ path: testFile });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("Required parameter 'content' is missing"));
    });

    it('should prevent writing outside workspace', async () => {
      const outsidePath = path.join('/', 'tmp', 'test.txt');
      const result = await writeTool.execute({ 
        path: outsidePath, 
        content: testContent 
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Access denied: Cannot write files outside workspace'));
    });
  });

  describe('ListDirectoryTool', () => {
    let listTool: ListDirectoryTool;

    beforeEach(async () => {
      listTool = new ListDirectoryTool();
      
      // Create test files and directories
      await fs.promises.writeFile(testFile, testContent);
      await fs.promises.mkdir(path.join(testDir, 'subdir'));
      await fs.promises.writeFile(path.join(testDir, 'another.txt'), 'content');
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(listTool.name, 'list_directory');
      assert.strictEqual(listTool.description, 'List the contents of a directory');
      assert.strictEqual(listTool.parameters.length, 2);
      assert.strictEqual(listTool.parameters[0].name, 'path');
      assert.strictEqual(listTool.parameters[1].name, 'recursive');
      assert.strictEqual(listTool.parameters[0].required, true);
      assert.strictEqual(listTool.parameters[1].required, false);
    });

    it('should list directory contents successfully', async () => {
      const result = await listTool.execute({ path: testDir });

      assert.strictEqual(result.success, true);
      assert.ok(result.output);

      const contents = JSON.parse(result.output!);
      assert.strictEqual(contents.length, 3);
      
      const names = contents.map((item: any) => item.name);
      assert.ok(names.includes('test.txt'));
      assert.ok(names.includes('subdir'));
      assert.ok(names.includes('another.txt'));

      const subdirEntry = contents.find((item: any) => item.name === 'subdir');
      assert.strictEqual(subdirEntry.type, 'directory');

      const fileEntry = contents.find((item: any) => item.name === 'test.txt');
      assert.strictEqual(fileEntry.type, 'file');
    });

    it('should fail when directory does not exist', async () => {
      const result = await listTool.execute({ path: 'non-existent-dir' });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('ENOENT'));
    });

    it('should prevent listing outside workspace', async () => {
      const outsidePath = path.join('/', 'etc');
      const result = await listTool.execute({ path: outsidePath });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Access denied: Cannot list directories outside workspace'));
    });

    it('should support recursive listing', async () => {
      const result = await listTool.execute({ path: testDir, recursive: true });

      assert.strictEqual(result.success, true);
      assert.ok(result.output);

      const contents = JSON.parse(result.output!);
      assert.ok(contents.length >= 3);
      
      // Should include files from subdirectory
      const paths = contents.map((item: any) => item.path);
      assert.ok(paths.some((p: string) => p.includes('subdir')));
    });
  });

  describe('CreateFileTool', () => {
    let createTool: CreateFileTool;

    beforeEach(() => {
      createTool = new CreateFileTool();
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(createTool.name, 'create_file');
      assert.strictEqual(createTool.description, 'Create a new file with optional content');
      assert.strictEqual(createTool.parameters.length, 2);
      assert.strictEqual(createTool.parameters[0].name, 'path');
      assert.strictEqual(createTool.parameters[1].name, 'content');
      assert.strictEqual(createTool.parameters[0].required, true);
      assert.strictEqual(createTool.parameters[1].required, false);
    });

    it('should create file successfully', async () => {
      const newFile = path.join(testDir, 'new-file.txt');
      const result = await createTool.execute({ 
        path: newFile, 
        content: testContent 
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('Successfully created file'));

      // Verify file was created
      const fileContent = await fs.promises.readFile(newFile, 'utf-8');
      assert.strictEqual(fileContent, testContent);
    });

    it('should create file without content', async () => {
      const newFile = path.join(testDir, 'empty-file.txt');
      const result = await createTool.execute({ path: newFile });

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('Successfully created file'));

      // Verify file was created and is empty
      const fileContent = await fs.promises.readFile(newFile, 'utf-8');
      assert.strictEqual(fileContent, '');
    });

    it('should fail when file already exists', async () => {
      // Create file first
      await fs.promises.writeFile(testFile, testContent);

      const result = await createTool.execute({ 
        path: testFile, 
        content: 'new content' 
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('File already exists'));
    });

    it('should prevent creating outside workspace', async () => {
      const outsidePath = path.join('/', 'tmp', 'test.txt');
      const result = await createTool.execute({ 
        path: outsidePath, 
        content: testContent 
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Access denied: Cannot create files outside workspace'));
    });
  });

  describe('DeleteFileTool', () => {
    let deleteTool: DeleteFileTool;

    beforeEach(() => {
      deleteTool = new DeleteFileTool();
    });

    it('should have correct tool properties', () => {
      assert.strictEqual(deleteTool.name, 'delete_file');
      assert.strictEqual(deleteTool.description, 'Delete a file');
      assert.strictEqual(deleteTool.parameters.length, 1);
      assert.strictEqual(deleteTool.parameters[0].name, 'path');
      assert.strictEqual(deleteTool.parameters[0].required, true);
    });

    it('should delete file successfully', async () => {
      // Create file first
      await fs.promises.writeFile(testFile, testContent);

      const result = await deleteTool.execute({ path: testFile });

      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('Successfully deleted file'));

      // Verify file was deleted
      try {
        await fs.promises.access(testFile);
        assert.fail('File should have been deleted');
      } catch (error) {
        // Expected - file should not exist
      }
    });

    it('should fail when file does not exist', async () => {
      const result = await deleteTool.execute({ path: 'non-existent.txt' });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('ENOENT'));
    });

    it('should fail when trying to delete directory', async () => {
      const result = await deleteTool.execute({ path: testDir });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Path is not a file'));
    });

    it('should prevent deleting outside workspace', async () => {
      const outsidePath = path.join('/', 'tmp', 'test.txt');
      const result = await deleteTool.execute({ path: outsidePath });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Access denied: Cannot delete files outside workspace'));
    });
  });
});