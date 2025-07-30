/**
 * Tests for ContextRunner
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ContextRunner } from '../runners/context';
import { Session, SessionState } from '../core/session';
import { IAgent, PhaseType } from '../core/agent';
import { WorkspaceContext } from '../core/workspace';

suite('ContextRunner Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockSession: Session;
  let mockAgent: IAgent;
  let contextRunner: ContextRunner;
  let mockWorkspaceUri: vscode.Uri;

  setup(() => {
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

  teardown(() => {
    sandbox.restore();
  });

  test('should validate inputs correctly', async () => {
    // Test with valid session
    const result = (contextRunner as any).validateInputs();
    assert.strictEqual(result, true);
    
    // Test with invalid session (no workspace URI)
    const invalidSession = { ...mockSession, workspaceUri: undefined };
    const invalidRunner = new ContextRunner(invalidSession as any, mockAgent, 'test');
    const invalidResult = (invalidRunner as any).validateInputs();
    assert.strictEqual(invalidResult, false);
  });

  test('should detect programming languages correctly', () => {
    const detectLanguage = (contextRunner as any).detectLanguage.bind(contextRunner);
    
    assert.strictEqual(detectLanguage('test.js'), 'javascript');
    assert.strictEqual(detectLanguage('test.ts'), 'typescript');
    assert.strictEqual(detectLanguage('test.py'), 'python');
    assert.strictEqual(detectLanguage('test.java'), 'java');
    assert.strictEqual(detectLanguage('test.json'), 'json');
    assert.strictEqual(detectLanguage('test.md'), 'markdown');
    assert.strictEqual(detectLanguage('test.unknown'), undefined);
  });

  test('should estimate token count correctly', () => {
    const estimateTokenCount = (contextRunner as any).estimateTokenCount.bind(contextRunner);
    
    const shortText = 'hello world';
    const longText = 'a'.repeat(1000);
    
    assert.strictEqual(estimateTokenCount(shortText), Math.ceil(shortText.length / 4));
    assert.strictEqual(estimateTokenCount(longText), Math.ceil(longText.length / 4));
    assert.strictEqual(estimateTokenCount(''), 0);
  });

  test('should assess file importance correctly', () => {
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

  test('should generate file summary correctly', () => {
    const generateFileSummary = (contextRunner as any).generateFileSummary.bind(contextRunner);
    
    // JavaScript/TypeScript content
    const jsContent = `
      export function test() {}
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

  test('should calculate file score correctly', () => {
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

  test('should detect frameworks correctly', () => {
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

  test('should load gitignore patterns', async () => {
    // Mock file reading
    const readWorkspaceFile = sandbox.stub(contextRunner as any, 'readWorkspaceFile');
    readWorkspaceFile.resolves(`
      node_modules/
      *.log
      # Comment line
      dist/
      .env
    `);
    
    await (contextRunner as any).loadGitignorePatterns();
    
    const ignorePatterns = (contextRunner as any).ignorePatterns;
    assert.ok(ignorePatterns.includes('node_modules/**'));
    assert.ok(ignorePatterns.includes('**/*.log'));
    assert.ok(ignorePatterns.includes('dist/**'));
    assert.ok(ignorePatterns.includes('**/.env'));
    assert.ok(!ignorePatterns.some((p: string) => p.includes('#')));
  });

  test('should select important files within token limits', () => {
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

  test('should generate context summary correctly', () => {
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

  test('should handle errors gracefully', async () => {
    // Mock file operations to throw errors
    sandbox.stub(vscode.workspace, 'findFiles').rejects(new Error('File system error'));
    
    const result = await contextRunner.run();
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('Context generation failed'));
  });

  test('should respect cancellation', async () => {
    // Mock session as cancelled
    (mockSession.isCancelled as sinon.SinonStub).returns(true);
    
    const result = await contextRunner.run();
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('cancelled'));
  });

  test('should save context to workspace', async () => {
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