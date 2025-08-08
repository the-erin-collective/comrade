/**
 * Tests for ContextRunner
 */

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { ContextRunner } from '../runners/context';
// Mocha globals are provided by the test environment
import { SessionState } from '../core/session';

// Define a minimal Session interface for testing
interface Session {
  id: string;
  workspaceUri: vscode.Uri;
  state: SessionState;
  isCancelled(): boolean;
  // Add other required properties here
}
import { IAgent } from '../core/agent';
import { WorkspaceContext } from '../core/workspace';

describe('ContextRunner Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockSession: Session;
  let mockAgent: IAgent;
  let contextRunner: ContextRunner;
  let mockWorkspaceUri: vscode.Uri;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Create mock workspace URI
    mockWorkspaceUri = vscode.Uri.file('/test/workspace');
    
    // Create mock session
    mockSession = {
      id: 'test-session',
      workspaceUri: mockWorkspaceUri,
      state: SessionState.CONTEXT_GENERATION,
      reportProgress: sandbox.stub(),
      isCancelled: sandbox.stub().returns(false),
      error: sandbox.stub(),
      metadata: {}
    } as any;
    
    // Create mock agent
    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      isAvailable: sandbox.stub().resolves(true)
    } as any;
    
    // Create ContextRunner instance
    contextRunner = new ContextRunner(mockSession, mockAgent, 'test personality');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should validate inputs correctly', async () => {
    // Test with valid session
    const result = (contextRunner as any).validateInputs();
    assert.strictEqual(result, true);
    
    // Test with invalid session (no workspace URI)
    const invalidSession = { ...mockSession, workspaceUri: undefined };
    const invalidRunner = new ContextRunner(invalidSession as any, mockAgent, 'test');
    const invalidResult = (invalidRunner as any).validateInputs();
    assert.strictEqual(invalidResult, false);
  });

  it('should detect programming languages correctly', () => {
    const detectLanguage = (contextRunner as any).detectLanguage.bind(contextRunner);
    
    assert.strictEqual(detectLanguage('test.js'), 'javascript');
    assert.strictEqual(detectLanguage('test.ts'), 'typescript');
    assert.strictEqual(detectLanguage('test.py'), 'python');
    assert.strictEqual(detectLanguage('test.java'), 'java');
    assert.strictEqual(detectLanguage('test.json'), 'json');
    assert.strictEqual(detectLanguage('test.md'), 'markdown');
    assert.strictEqual(detectLanguage('test.unknown'), undefined);
  });

  it('should estimate token count correctly', () => {
    const estimateTokenCount = (contextRunner as any).estimateTokenCount.bind(contextRunner);
    
    const shortText = 'hello world';
    const longText = 'a'.repeat(1000);
    
    assert.strictEqual(estimateTokenCount(shortText), Math.ceil(shortText.length / 4));
    assert.strictEqual(estimateTokenCount(longText), Math.ceil(longText.length / 4));
    assert.strictEqual(estimateTokenCount(''), 0);
  });

  it('should assess file importance correctly', () => {
    const assessFileImportance = (contextRunner as any).assessFileImportance.bind(contextRunner);
    
    // Important files
    assert.strictEqual(assessFileImportance('package.json', '{}', 'json'), true);
    assert.strictEqual(assessFileImportance('README.md', '# Test', 'markdown'), true);
    assert.strictEqual(assessFileImportance('src/index.js', 'code', 'javascript'), true);
    assert.strictEqual(assessFileImportance('tsconfig.json', '{}', 'json'), true);
    
    // Less important files
    assert.strictEqual(assessFileImportance('test/random.test.js', 'test code', 'javascript'), false);
    assert.strictEqual(assessFileImportance('docs/guide.md', 'documentation', 'markdown'), false);
  });

  it('should generate file summary correctly', () => {
    const generateFileSummary = (contextRunner as any).generateFileSummary.bind(contextRunner);
    
    // JavaScript/TypeScript content
    const jsContent = `
      export function  it() {}
      export class MyClass {}
      const arrow = () => {};
    `;
    const jsSummary = generateFileSummary(jsContent, 'javascript');
    assert.ok(jsSummary.includes('exports'));
    assert.ok(jsSummary.includes('functions'));
    assert.ok(jsSummary.includes('classes'));
    
    // JSON content
    const jsonContent = '{"name": "test-package", "dependencies": {"lodash": "^4.0.0"}}';
    const jsonSummary = generateFileSummary(jsonContent, 'json');
    assert.ok(jsonSummary.includes('Package: test-package'));
    assert.ok(jsonSummary.includes('1 dependencies'));
    
    // Empty content
    const emptySummary = generateFileSummary('', 'javascript');
    assert.strictEqual(emptySummary, 'Empty file');
  });

  it('should calculate file score correctly', () => {
    const calculateFileScore = (contextRunner as any).calculateFileScore.bind(contextRunner);
    
    const importantFile = {
      path: 'package.json',
      tokenCount: 100,
      isImportant: true,
      language: 'json'
    };
    
    const regularFile = {
      path: 'src/utils/helper.js',
      tokenCount: 500,
      isImportant: false,
      language: 'javascript'
    };
    
    const importantScore = calculateFileScore(importantFile);
    const regularScore = calculateFileScore(regularFile);
    
    // Important file should have higher score
    assert.ok(importantScore > regularScore);
  });

  it('should detect frameworks correctly', () => {
    const detectFrameworks = (contextRunner as any).detectFrameworks.bind(contextRunner);
    
    const analyses = [
      {
        path: 'package.json',
        summary: 'Package with react dependencies'
      },
      {
        path: 'angular.json',
        summary: 'Angular configuration'
      },
      {
        path: 'next.config.js',
        summary: 'Next.js configuration'
      }
    ];
    
    const frameworks = detectFrameworks(analyses);
    assert.ok(frameworks.includes('React'));
    assert.ok(frameworks.includes('Angular'));
    assert.ok(frameworks.includes('Next.js'));
  });

  describe('gitignore pattern loading', () => {
    let originalIgnorePatterns: string[];
    let readWorkspaceFileStub: sinon.SinonStub;
    let consoleWarnStub: sinon.SinonStub;
    let consoleErrorStub: sinon.SinonStub;

    beforeEach(() => {
      // Save original ignore patterns
      originalIgnorePatterns = [...(contextRunner as any).ignorePatterns];
      
      // Stub readWorkspaceFile to return an empty string by default
      readWorkspaceFileStub = sandbox.stub(contextRunner as any, 'readWorkspaceFile').resolves('');
      
      // Mock console methods
      consoleWarnStub = sandbox.stub(console, 'warn');
      consoleErrorStub = sandbox.stub(console, 'error');
    });

    afterEach(() => {
      // Restore original ignore patterns
      (contextRunner as any).ignorePatterns = [...originalIgnorePatterns];
    });

    it('should load and convert basic gitignore patterns', async () => {
      const gitignoreContent = `
        node_modules/
        *.log
        # Comment line
        dist/
        .env
        /build
        src/**/test
      `;
      
      // Override the default stub for this specific test case
      readWorkspaceFileStub.withArgs('.gitignore').resolves(gitignoreContent);
      
      await (contextRunner as any).loadGitignorePatterns();
      
      const ignorePatterns = (contextRunner as any).ignorePatterns;
      
      // Verify patterns were converted correctly
      assert.ok(ignorePatterns.includes('node_modules/**'));
      assert.ok(ignorePatterns.includes('**/*.log'));
      assert.ok(ignorePatterns.includes('dist/**'));
      assert.ok(ignorePatterns.includes('**/.env'));
      assert.ok(ignorePatterns.includes('build/**'));
      assert.ok(ignorePatterns.includes('src/**/test'));
      
      // Verify comments and empty lines are filtered out
      assert.ok(!ignorePatterns.some((p: string) => p.includes('#')));
      assert.ok(!ignorePatterns.some((p: string) => p.trim() === ''));
      
      // Verify the stub was called with the correct arguments
      assert.ok(readWorkspaceFileStub.calledOnceWith('.gitignore'));
    });

    it('should handle malformed gitignore patterns', async () => {
      const gitignoreContent = `
        # Invalid patterns that should be skipped
        **
        *
        # Valid patterns
        .DS_Store
        # Comment with special chars: [ ] ( ) { } ? * !
        node_modules/
        # Empty line follows
        
        # More valid patterns
        *.tmp
      `;
      
      // Override the default stub for this specific test case
      readWorkspaceFileStub.withArgs('.gitignore').resolves(gitignoreContent);
      
      await (contextRunner as any).loadGitignorePatterns();
      
      const ignorePatterns = (contextRunner as any).ignorePatterns;
      
      // Verify only valid patterns are included
      assert.ok(ignorePatterns.includes('**/.DS_Store'));
      assert.ok(ignorePatterns.includes('node_modules/**'));
      assert.ok(ignorePatterns.includes('**/*.tmp'));
      
      // Verify invalid patterns are filtered out
      assert.ok(!ignorePatterns.includes('**'));
      assert.ok(!ignorePatterns.includes('*'));
      
      // Verify the stub was called with the correct arguments
      assert.ok(readWorkspaceFileStub.calledOnceWith('.gitignore'));
    });

    it('should handle special characters in patterns', async () => {
      const gitignoreContent = `
        # Patterns with special characters
        file[0-9].txt
        test?.js
        dir[abc]/
        !important.txt
        path/with spaces/
        path/with#hash/
      `;
      
      // Override the default stub for this specific test case
      readWorkspaceFileStub.withArgs('.gitignore').resolves(gitignoreContent);
      
      await (contextRunner as any).loadGitignorePatterns();
      
      const ignorePatterns = (contextRunner as any).ignorePatterns;
      
      // Verify special characters are properly escaped
      assert.ok(ignorePatterns.some((p: string) => p.includes('file\[0-9\].txt')), 'Should escape square brackets');
      assert.ok(ignorePatterns.some((p: string) => p.includes('test\?.js')), 'Should escape question mark');
      assert.ok(ignorePatterns.some((p: string) => p.includes('dir\[abc\]/')), 'Should escape square brackets in directory names');
      assert.ok(ignorePatterns.some((p: string) => p.includes('path/with spaces/')), 'Should preserve spaces in paths');
      assert.ok(ignorePatterns.some((p: string) => p.includes('path/with\#hash/')), 'Should escape hash character');
      
      // Negation patterns are not supported in glob, so '!important.txt' should be escaped
      assert.ok(ignorePatterns.some((p: string) => p.includes('\!important.txt')), 'Should escape negation pattern');
      
      // Verify the stub was called with the correct arguments
      assert.ok(readWorkspaceFileStub.calledOnceWith('.gitignore'));
    });

    it('should handle missing .gitignore file', async () => {
      const error = new Error('File not found') as any;
      error.code = 'FileNotFound';
      
      // Stub the readWorkspaceFile method to reject with file not found error
      readWorkspaceFileStub.withArgs('.gitignore').rejects(error);
      
      // Store original patterns count
      const originalPatternsCount = (contextRunner as any).ignorePatterns.length;
      
      // Should not throw
      await (contextRunner as any).loadGitignorePatterns();
      
      // Verify default patterns are still present
      const ignorePatterns = (contextRunner as any).ignorePatterns;
      assert.ok(ignorePatterns.length >= originalPatternsCount, 
        'Should still have at least the original ignore patterns after error');
      
      // Verify the stub was called with the correct arguments
      assert.ok(readWorkspaceFileStub.calledOnceWith('.gitignore'));
    });

    it('should handle read errors gracefully', async function() {
      this.timeout(5000);
      
      // Reset stubs before our test
      readWorkspaceFileStub.reset();
      consoleWarnStub.reset();
      consoleErrorStub.reset();
      
      // Create a permission denied error that matches VS Code's FileSystemError
      const permissionError = vscode.FileSystemError.FileNotFound('Permission denied');
      (permissionError as any).code = 'NoPermissions';
      
      // Configure the stub to throw our error
      readWorkspaceFileStub.rejects(permissionError);
      
      // Store original patterns
      const originalPatterns = [...contextRunner['ignorePatterns']];
      
      // This should not throw - the error should be caught and logged
      await contextRunner['loadGitignorePatterns']();
      
      // Get the current patterns after the call
      const currentPatterns = contextRunner['ignorePatterns'];
      
      // Verify patterns are unchanged
      assert.deepStrictEqual(
        currentPatterns,
        originalPatterns,
        'Patterns array should be unchanged after error');
      
      // The main assertion is that we got here without throwing an error
      // and the patterns remain unchanged
      assert.deepStrictEqual(
        currentPatterns,
        originalPatterns,
        'Patterns array should be unchanged after error'
      );
      
      // Additional check that we didn't log any errors
      assert.strictEqual(
        consoleErrorStub.callCount,
        0,
        'No errors should be logged to console.error for permission denied errors'
      );
    });

    it('should not add duplicate patterns', async () => {
      const gitignoreContent = `
        node_modules/
        dist/
        *.log
        node_modules/  # Duplicate
        dist/         # Duplicate with comment
      `;
      
      // Override the default stub for this specific test case
      readWorkspaceFileStub.withArgs('.gitignore').resolves(gitignoreContent);
      
      // Add some patterns that will be duplicates
      (contextRunner as any).ignorePatterns = [
        'node_modules/**',
        'dist/**',
        '**/*.log'
      ];
      
      const originalPatterns = [...(contextRunner as any).ignorePatterns];
      
      await (contextRunner as any).loadGitignorePatterns();
      
      const ignorePatterns = (contextRunner as any).ignorePatterns;
      
      // Verify no duplicates were added
      assert.strictEqual(ignorePatterns.length, originalPatterns.length);
      assert.deepStrictEqual(ignorePatterns, originalPatterns);
      
      // Verify the stub was called with the correct arguments
      assert.ok(readWorkspaceFileStub.calledOnceWith('.gitignore'));
    });
  }); // End of describe('gitignore pattern loading')

  it('should select important files within token limits', () => {
    const selectImportantFiles = (contextRunner as any).selectImportantFiles.bind(contextRunner);
    
    const analyses = [
      {
        path: 'package.json',
        tokenCount: 50,
        isImportant: true,
        language: 'json'
      },
      {
        path: 'src/index.js',
        tokenCount: 200,
        isImportant: true,
        language: 'javascript'
      },
      {
        path: 'src/utils.js',
        tokenCount: 300,
        isImportant: false,
        language: 'javascript'
      },
      {
        path: 'test/test.js',
        tokenCount: 1000,
        isImportant: false,
        language: 'javascript'
      }
    ];
    
    // Set low token limit to test selection
    (contextRunner as any).maxTokens = 400;
    
    const selected = selectImportantFiles(analyses);
    
    // Should select important files first
    assert.ok(selected.some((f: any) => f.path === 'package.json'));
    assert.ok(selected.some((f: any) => f.path === 'src/index.js'));
    
    // Should respect token limits
    const totalTokens = selected.reduce((sum: number, f: any) => sum + f.tokenCount, 0);
    assert.ok(totalTokens <= 500); // Allows slight overage for important files
  });

  it('should generate context summary correctly', () => {
    const generateContextSummary = (contextRunner as any).generateContextSummary.bind(contextRunner);
    
    const stats = {
      totalFiles: 10,
      languageDistribution: new Map([
        ['javascript', 5],
        ['typescript', 3],
        ['json', 2]
      ]),
      frameworks: ['React', 'Express.js'],
      dependencies: [
        { name: 'react', version: '18.0.0', type: 'npm', isDev: false },
        { name: 'jest', version: '29.0.0', type: 'npm', isDev: true }
      ]
    };
    
    const analyses = [
      { tokenCount: 100 },
      { tokenCount: 200 },
      { tokenCount: 150 }
    ];
    
    const summary = generateContextSummary(stats, analyses as any);
    
    assert.strictEqual(summary.totalFiles, 10);
    assert.ok(summary.totalLines > 0);
    assert.deepStrictEqual(summary.primaryLanguages, ['javascript', 'typescript', 'json']);
    assert.deepStrictEqual(summary.frameworks, ['React', 'Express.js']);
    assert.ok(summary.description.includes('javascript project'));
    assert.ok(summary.description.includes('React'));
  });

  it('should handle errors gracefully', async () => {
    // Mock file operations to throw errors
    sandbox.stub(vscode.workspace, 'findFiles').rejects(new Error('File system error'));
    
    const result = await contextRunner.run();
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('Context generation failed'));
  });

  it('should respect cancellation', async () => {
    // Mock session as cancelled
    (mockSession.isCancelled as sinon.SinonStub).returns(true);
    
    const result = await contextRunner.run();
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('cancelled'));
  });

  it('should save context to workspace', async () => {
    const writeWorkspaceFile = sandbox.stub(contextRunner as any, 'writeWorkspaceFile');
    const createWorkspaceDirectory = sandbox.stub(contextRunner as any, 'createWorkspaceDirectory');
    
    const context: WorkspaceContext = {
      timestamp: '2024-01-01T00:00:00.000Z',
      workspaceRoot: '/test/workspace',
      fileStructure: [],
      dependencies: [],
      summary: {
        totalFiles: 0,
        totalLines: 0,
        primaryLanguages: [],
        frameworks: [],
        description: 'Empty project'
      },
      tokenCount: 0
    };
    
    await (contextRunner as any).saveContext(context);
    
    assert.ok(createWorkspaceDirectory.calledWith('.comrade'));
    assert.ok(writeWorkspaceFile.calledWith('.comrade/context.json'));
    
    const savedContent = writeWorkspaceFile.getCall(0).args[1];
    const parsedContext = JSON.parse(savedContent);
    assert.deepStrictEqual(parsedContext, context);
  });
});

