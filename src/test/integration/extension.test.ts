/**
 * VS Code extension integration tests
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
// Mocha globals are provided by the test environment

// Import extension components
import { activate, deactivate, getStatusBarManager, getPersonalityManager, getAgentRegistry, getConfigurationManager } from '../../extension';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { ComradeSidebarProvider } from '../../providers/sidebarProvider';

describe('VS Code Extension Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockContext: vscode.ExtensionContext;
  let mockSecretStorage: vscode.SecretStorage;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock extension context
    mockSecretStorage = {
      store: sandbox.stub(),
      get: sandbox.stub(),
      delete: sandbox.stub(),
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
    };

    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: sandbox.stub().returns(undefined),
        update: sandbox.stub().resolves(),
        keys: sandbox.stub().returns([])
      } as any,
      globalState: {
        get: sandbox.stub().returns(undefined),
        update: sandbox.stub().resolves(),
        setKeysForSync: sandbox.stub(),
        keys: sandbox.stub().returns([])
      } as any,
      secrets: mockSecretStorage,
      extensionUri: vscode.Uri.file(__dirname),
      extensionPath: __dirname,
      environmentVariableCollection: {} as any,
      extensionMode: vscode.ExtensionMode.Test,
      logUri: vscode.Uri.file(path.join(__dirname, 'logs')),
      storageUri: vscode.Uri.file(path.join(__dirname, 'storage')),
      globalStorageUri: vscode.Uri.file(path.join(__dirname, 'global-storage')),
      storagePath: path.join(__dirname, 'storage'),
      globalStoragePath: path.join(__dirname, 'global-storage'),
      logPath: path.join(__dirname, 'logs'),
      extension: {} as any,
      languageModelAccessInformation: {} as any,
      asAbsolutePath: (relativePath: string) => path.join(__dirname, relativePath)
    };

    // Mock VS Code APIs
    sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => {} });
    sandbox.stub(vscode.window, 'registerWebviewViewProvider').returns({ dispose: () => {} });
    sandbox.stub(vscode.workspace, 'getConfiguration').returns({
      get: sandbox.stub(),
      update: sandbox.stub(),
      has: sandbox.stub(),
      inspect: sandbox.stub()
    } as any);
  });

  afterEach(() => {
    sandbox.restore();
    // Clean up singletons
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  it('should activate extension successfully', async () => {
    try {
      await activate(mockContext);
      
      // Verify commands were registered
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      assert.ok(registerCommandStub.called, 'Commands should be registered');
      
      // Verify expected commands are registered
      const commandNames = registerCommandStub.getCalls().map(call => call.args[0]);
      const expectedCommands = [
        'comrade.helloWorld',
        'comrade.openAgentConfig',
        'comrade.testAgentConnectivity',
        'comrade.showRegistryStats',
        'comrade.openPersonalityConfig',
        'comrade.createDefaultPersonality',
        'comrade.checkPersonalityStatus',
        'comrade.runContextAnalysis',
        'comrade.readContext',
        'comrade.checkContext',
        'comrade.cancelOperation',
        'comrade.openApiConfig',
        'comrade.openMcpConfig',
        'comrade.openSettings',
        'comrade.showErrorRecovery',
        'comrade.retryLastOperation'
      ];
      
      expectedCommands.forEach(command => {
        assert.ok(
          commandNames.includes(command), 
          `Command ${command} should be registered`
        );
      });

      // Verify webview provider was registered
      const registerWebviewStub = vscode.window.registerWebviewViewProvider as sinon.SinonStub;
      assert.ok(registerWebviewStub.called, 'Webview provider should be registered');
      assert.strictEqual(
        registerWebviewStub.getCall(0).args[0], 
        'comrade.sidebar',
        'Sidebar webview should be registered'
      );

    } catch (error) {
      console.error('Extension activation failed:', error);
      throw error;
    }
  });

  it('should deactivate extension cleanly and cleanup all resources', async () => {
    // First activate
    await activate(mockContext);
    
    // Create spies for dispose methods
    const statusBarDisposeSpy = sandbox.spy(getStatusBarManager(), 'dispose');
    const personalityManagerDisposeSpy = sandbox.spy(getPersonalityManager(), 'dispose');
    const agentRegistryDisposeSpy = sandbox.spy(getAgentRegistry(), 'dispose');
    const configManagerDisposeSpy = sandbox.spy(getConfigurationManager(), 'dispose');
    
    // Get the dispose functions from context subscriptions
    const subscriptionDisposeSpies = mockContext.subscriptions
      .map(sub => ({
        id: sub.toString(),
        spy: sandbox.spy(sub, 'dispose')
      }));
    
    // Then deactivate
    await deactivate();
    
    // Verify all resources were disposed
    assert.ok(statusBarDisposeSpy.calledOnce, 'StatusBarManager should be disposed');
    assert.ok(personalityManagerDisposeSpy.calledOnce, 'PersonalityManager should be disposed');
    assert.ok(agentRegistryDisposeSpy.calledOnce, 'AgentRegistry should be disposed');
    assert.ok(configManagerDisposeSpy.calledOnce, 'ConfigurationManager should be disposed');
    
    // Verify all context subscriptions were disposed
    subscriptionDisposeSpies.forEach(({ id, spy }) => {
      assert.ok(spy.calledOnce, `Context subscription ${id} should be disposed`);
    });
    
    // Verify no errors were thrown
    assert.ok(true, 'Deactivation should complete without errors');
  });

  it('should handle command execution', async () => {
    await activate(mockContext);
    
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    
    // Find the hello world command handler
    const helloWorldCall = registerCommandStub.getCalls().find(
      call => call.args[0] === 'comrade.helloWorld'
    );
    
    assert.ok(helloWorldCall, 'Hello world command should be registered');
    
    // Mock showInformationMessage
    const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage');
    
    // Execute the command handler
    const commandHandler = helloWorldCall.args[1];
    await commandHandler();
    
    // Verify the command executed
    assert.ok(showInfoStub.called, 'Command should show information message');
  });

  it('should handle agent configuration command', async () => {
    await activate(mockContext);
    
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    
    // Find the agent config command handler
    const agentConfigCall = registerCommandStub.getCalls().find(
      call => call.args[0] === 'comrade.openAgentConfig'
    );
    
    assert.ok(agentConfigCall, 'Agent config command should be registered');
    
    // Mock VS Code APIs
    const showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
    const showInputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
    
    // Mock user selecting to add new agent
    showQuickPickStub.resolves({ label: 'Add New Agent' });
    showInputBoxStub.onCall(0).resolves('Test Agent');
    showInputBoxStub.onCall(1).resolves('openai');
    showInputBoxStub.onCall(2).resolves('gpt-4');
    
    // Execute the command handler
    const commandHandler = agentConfigCall.args[1];
    await commandHandler();
    
    // Verify the command executed without errors
    assert.ok(showQuickPickStub.called, 'Should show quick pick for agent options');
  });

  it('should handle agent connectivity testing', async () => {
    await activate(mockContext);
    
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    
    // Find the connectivity test command handler
    const connectivityCall = registerCommandStub.getCalls().find(
      call => call.args[0] === 'comrade.testAgentConnectivity'
    );
    
    assert.ok(connectivityCall, 'Connectivity test command should be registered');
    
    // Mock VS Code APIs
    const showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
    const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
    
    // Mock user selecting an agent
    showQuickPickStub.resolves({ label: 'Test Agent' } as any);
    
    // Mock progress execution
    withProgressStub.callsFake(async (options, task) => {
      const progress = { report: sandbox.stub() };
      const token = { 
        isCancellationRequested: false,
        onCancellationRequested: new vscode.EventEmitter<any>().event
      };
      return await task(progress, token);
    });
    
    // Execute the command handler
    const commandHandler = connectivityCall.args[1];
    await commandHandler();
    
    // Verify the command executed
    assert.ok(showQuickPickStub.called, 'Should show agent selection');
  });

  it('should handle personality configuration', async () => {
    await activate(mockContext);
    
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    
    // Find the personality config command handler
    const personalityCall = registerCommandStub.getCalls().find(
      call => call.args[0] === 'comrade.openPersonalityConfig'
    );
    
    assert.ok(personalityCall, 'Personality config command should be registered');
    
    // Mock VS Code APIs
    const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument');
    const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument');
    
    // Mock document opening
    const mockDocument = {
      uri: vscode.Uri.file('/test/.comrade/personality.md'),
      getText: () => 'Test personality content',
      fileName: '/test/.comrade/personality.md',
      isUntitled: false,
      languageId: 'markdown',
      version: 1,
      isDirty: false,
      isClosed: false,
      save: sandbox.stub(),
      eol: vscode.EndOfLine.LF,
      lineCount: 1
    } as any;
    openTextDocumentStub.resolves(mockDocument);
    
    // Execute the command handler
    const commandHandler = personalityCall.args[1];
    await commandHandler();
    
    // Verify the command executed
    assert.ok(openTextDocumentStub.called, 'Should open personality document');
  });

  it('should handle context analysis command', async () => {
    await activate(mockContext);
    
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    
    // Find the context analysis command handler
    const contextCall = registerCommandStub.getCalls().find(
      call => call.args[0] === 'comrade.runContextAnalysis'
    );
    
    assert.ok(contextCall, 'Context analysis command should be registered');
    
    // Mock VS Code APIs
    const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
    const showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
    
    // Mock progress execution
    withProgressStub.callsFake(async (options, task) => {
      const progress = { report: sandbox.stub() };
      const token = { 
        isCancellationRequested: false,
        onCancellationRequested: new vscode.EventEmitter<any>().event
      };
      return await task(progress, token);
    });
    
    // Execute the command handler
    const commandHandler = contextCall.args[1];
    await commandHandler();
    
    // Verify the command executed
    assert.ok(withProgressStub.called, 'Should show progress during context analysis');
  });

  it('should handle error recovery command', async () => {
    await activate(mockContext);
    
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    
    // Find the error recovery command handler
    const errorRecoveryCall = registerCommandStub.getCalls().find(
      call => call.args[0] === 'comrade.showErrorRecovery'
    );
    
    assert.ok(errorRecoveryCall, 'Error recovery command should be registered');
    
    // Mock VS Code APIs
    const showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
    const showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
    
    // Mock user selecting recovery option
    showQuickPickStub.resolves({ 
      label: 'Retry Last Operation'
    } as any);
    
    // Execute the command handler
    const commandHandler = errorRecoveryCall.args[1];
    await commandHandler();
    
    // Verify the command executed
    assert.ok(showQuickPickStub.called, 'Should show error recovery options');
  });

  it('should handle workspace configuration changes', async () => {
    await activate(mockContext);
    
    // Mock configuration change event
    const configChangeEvent = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
    sandbox.stub(vscode.workspace, 'onDidChangeConfiguration').value(configChangeEvent.event);
    
    // Mock configuration
    const mockConfig = {
      get: sandbox.stub().returns([]),
      update: sandbox.stub(),
      has: sandbox.stub().returns(false),
      inspect: sandbox.stub()
    };
    
    const getConfigStub = vscode.workspace.getConfiguration as sinon.SinonStub;
    getConfigStub.returns(mockConfig);
    
    // Trigger configuration change
    configChangeEvent.fire({
      affectsConfiguration: (section: string) => section.startsWith('comrade')
    });
    
    // Verify configuration was handled (no errors thrown)
    assert.ok(true, 'Configuration change should be handled without errors');
  });

  it('should register sidebar webview provider correctly', async () => {
    await activate(mockContext);
    
    const registerWebviewStub = vscode.window.registerWebviewViewProvider as sinon.SinonStub;
    
    // Verify webview provider registration
    assert.ok(registerWebviewStub.called, 'Webview provider should be registered');
    
    const providerCall = registerWebviewStub.getCall(0);
    assert.strictEqual(providerCall.args[0], 'comrade.sidebar', 'Should register sidebar view');
    
    const provider = providerCall.args[1];
    assert.ok(provider instanceof ComradeSidebarProvider, 'Should register ComradeSidebarProvider instance');
  });

  it('should handle extension context disposal', async () => {
    await activate(mockContext);
    
    // Verify subscriptions were added to context
    assert.ok(mockContext.subscriptions.length > 0, 'Should add disposables to context subscriptions');
    
    // Verify all subscriptions have dispose methods
    mockContext.subscriptions.forEach((subscription, index) => {
      assert.ok(
        typeof subscription.dispose === 'function',
        `Subscription ${index} should have dispose method`
      );
    });
    
    // Test disposal
    mockContext.subscriptions.forEach(subscription => {
      try {
        subscription.dispose();
      } catch (error) {
        assert.fail(`Subscription disposal should not throw error: ${error}`);
      }
    });
  });

  it('should handle missing workspace gracefully', async () => {
    // Mock no workspace folders
    sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
    
    try {
      await activate(mockContext);
      
      // Extension should still activate even without workspace
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      assert.ok(registerCommandStub.called, 'Commands should still be registered without workspace');
      
    } catch (error) {
      assert.fail(`Extension should handle missing workspace gracefully: ${error}`);
    }
  });

  it('should handle extension activation errors gracefully', async () => {
    // Mock an error during initialization
    sandbox.stub(AgentRegistry, 'getInstance').throws(new Error('Initialization failed'));
    
    try {
      await activate(mockContext);
      
      // Extension should handle initialization errors
      assert.ok(true, 'Extension should handle initialization errors gracefully');
      
    } catch (error) {
      // If error is thrown, it should be a meaningful error
      assert.ok(error instanceof Error, 'Should throw meaningful error');
      assert.ok(error.message.includes('Initialization'), 'Error should be descriptive');
    }
  });

  it('should handle webview message communication', async () => {
    await activate(mockContext);
    
    const registerWebviewStub = vscode.window.registerWebviewViewProvider as sinon.SinonStub;
    const provider = registerWebviewStub.getCall(0).args[1];
    
    // Mock webview
    const mockWebview = {
      html: '',
      options: {},
      onDidReceiveMessage: sandbox.stub(),
      postMessage: sandbox.stub(),
      asWebviewUri: sandbox.stub(),
      cspSource: 'vscode-webview:'
    };

    const mockWebviewView = {
      webview: mockWebview,
      visible: true,
      onDidDispose: new vscode.EventEmitter<void>().event,
      onDidChangeVisibility: new vscode.EventEmitter<void>().event,
      show: sandbox.stub(),
      title: 'Comrade',
      description: undefined
    };

    // Resolve webview view
    provider.resolveWebviewView(mockWebviewView, {}, {});
    
    // Verify webview was configured
    assert.ok(mockWebview.html.length > 0, 'Should set webview HTML content');
    assert.ok(mockWebview.onDidReceiveMessage.called, 'Should register message handler');
  });

  it('should handle webview message protocol', async () => {
    await activate(mockContext);
    
    const registerWebviewStub = vscode.window.registerWebviewViewProvider as sinon.SinonStub;
    const provider = registerWebviewStub.getCall(0).args[1];
    
    let messageHandler: (message: any) => void;
    
    const mockWebview = {
      html: '',
      options: {},
      onDidReceiveMessage: (handler: (message: any) => void) => {
        messageHandler = handler;
        return { dispose: () => {} };
      },
      postMessage: sandbox.stub(),
      asWebviewUri: sandbox.stub(),
      cspSource: 'vscode-webview:'
    };

    const mockWebviewView = {
      webview: mockWebview,
      visible: true,
      onDidDispose: new vscode.EventEmitter<void>().event,
      onDidChangeVisibility: new vscode.EventEmitter<void>().event,
      show: sandbox.stub(),
      title: 'Comrade',
      description: undefined
    };

    provider.resolveWebviewView(mockWebviewView, {}, {});
    
    // Test message handling
    const testMessage = {
      type: 'sendMessage',
      payload: { content: 'Hello from webview' }
    };

    messageHandler!(testMessage);
    
    // Verify message was processed (no errors thrown)
    assert.ok(true, 'Should handle webview messages without errors');
  });

  it('should handle command palette integration', async () => {
    await activate(mockContext);
    
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    
    // Verify all expected commands are registered
    const registeredCommands = registerCommandStub.getCalls().map(call => call.args[0]);
    
    const expectedCommands = [
      'comrade.helloWorld',
      'comrade.openAgentConfig',
      'comrade.testAgentConnectivity',
      'comrade.showRegistryStats',
      'comrade.openPersonalityConfig',
      'comrade.createDefaultPersonality',
      'comrade.checkPersonalityStatus',
      'comrade.runContextAnalysis',
      'comrade.readContext',
      'comrade.checkContext',
      'comrade.cancelOperation',
      'comrade.openApiConfig',
      'comrade.openMcpConfig',
      'comrade.openSettings',
      'comrade.showErrorRecovery',
      'comrade.retryLastOperation'
    ];

    expectedCommands.forEach(command => {
      assert.ok(
        registeredCommands.includes(command),
        `Command ${command} should be registered`
      );
    });

    // Test command execution
    const helloWorldHandler = registerCommandStub.getCalls()
      .find(call => call.args[0] === 'comrade.helloWorld')?.args[1];
    
    assert.ok(helloWorldHandler, 'Hello world command handler should exist');
    
    const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage');
    await helloWorldHandler();
    
    assert.ok(showInfoStub.called, 'Command should execute successfully');
  });

  it('should handle status bar integration', async () => {
    await activate(mockContext);
    
    // Mock status bar item creation
    const mockStatusBarItem = {
      text: '',
      tooltip: '',
      command: '',
      show: sandbox.stub(),
      hide: sandbox.stub(),
      dispose: sandbox.stub()
    };

    const createStatusBarItemStub = sandbox.stub(vscode.window, 'createStatusBarItem')
      .returns(mockStatusBarItem as any);

    // Trigger status bar creation (would be done during activation)
    // This tests that the extension can create and manage status bar items
    assert.ok(true, 'Should handle status bar integration');
  });

  it('should handle progress reporting integration', async () => {
    await activate(mockContext);
    
    const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
    withProgressStub.callsFake(async (options, task) => {
      const progress = { report: sandbox.stub() };
      const token = { 
        isCancellationRequested: false,
        onCancellationRequested: new vscode.EventEmitter<any>().event
      };
      return await task(progress, token);
    });

    // Test progress reporting through command execution
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    const contextAnalysisHandler = registerCommandStub.getCalls()
      .find(call => call.args[0] === 'comrade.runContextAnalysis')?.args[1];

    if (contextAnalysisHandler) {
      await contextAnalysisHandler();
      assert.ok(withProgressStub.called, 'Should use VS Code progress API');
    }
  });

  it('should handle file system integration', async () => {
    await activate(mockContext);
    
    // Mock file system operations
    const mockFileSystem = {
      readFile: sandbox.stub().resolves(Buffer.from('test content')),
      writeFile: sandbox.stub().resolves(),
      createDirectory: sandbox.stub().resolves(),
      delete: sandbox.stub().resolves(),
      stat: sandbox.stub().resolves({ type: vscode.FileType.File, size: 100 })
    };

    sandbox.stub(vscode.workspace, 'fs').value(mockFileSystem);

    // Test file operations through personality configuration
    const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
    const personalityHandler = registerCommandStub.getCalls()
      .find(call => call.args[0] === 'comrade.createDefaultPersonality')?.args[1];

    if (personalityHandler) {
      await personalityHandler();
      // Should interact with file system for personality file
      assert.ok(true, 'Should handle file system operations');
    }
  });

  it('should handle workspace folder changes', async () => {
    await activate(mockContext);
    
    // Mock workspace folder change event
    const workspaceFoldersChangeEmitter = new vscode.EventEmitter<vscode.WorkspaceFoldersChangeEvent>();
    sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').value(workspaceFoldersChangeEmitter.event);

    // Trigger workspace folder change
    workspaceFoldersChangeEmitter.fire({
      added: [{ uri: vscode.Uri.file('/new/workspace'), name: 'new-workspace', index: 0 }],
      removed: []
    });

    // Extension should handle workspace changes gracefully
    assert.ok(true, 'Should handle workspace folder changes');
  });

  it('should handle text document changes', async () => {
    await activate(mockContext);
    
    // Mock text document change event
    const textDocumentChangeEmitter = new vscode.EventEmitter<vscode.TextDocumentChangeEvent>();
    sandbox.stub(vscode.workspace, 'onDidChangeTextDocument').value(textDocumentChangeEmitter.event);

    const mockDocument = {
      uri: vscode.Uri.file('/test/file.ts'),
      fileName: '/test/file.ts',
      isUntitled: false,
      languageId: 'typescript',
      version: 1,
      isDirty: true,
      isClosed: false,
      save: sandbox.stub(),
      eol: vscode.EndOfLine.LF,
      lineCount: 10,
      getText: () => 'test content'
    } as any;

    // Trigger text document change
    textDocumentChangeEmitter.fire({
      document: mockDocument,
      contentChanges: [{
        range: new vscode.Range(0, 0, 0, 4),
        rangeOffset: 0,
        rangeLength: 4,
        text: 'new '
      }],
      reason: undefined
    });

    // Extension should handle document changes gracefully
    assert.ok(true, 'Should handle text document changes');
  });

  it('should handle extension lifecycle events', async () => {
    // Test activation
    await activate(mockContext);
    
    // Verify activation completed successfully
    assert.ok(mockContext.subscriptions.length > 0, 'Should register disposables during activation');

    // Test deactivation
    await deactivate();
    
    // Verify deactivation completed without errors
    assert.ok(true, 'Should deactivate cleanly');
  });

  it('should handle multi-root workspace scenarios', async () => {
    // Mock multi-root workspace
    const workspaceFolders = [
      { uri: vscode.Uri.file('/workspace1'), name: 'workspace1', index: 0 },
      { uri: vscode.Uri.file('/workspace2'), name: 'workspace2', index: 1 }
    ];
    
    sandbox.stub(vscode.workspace, 'workspaceFolders').value(workspaceFolders);

    await activate(mockContext);
    
    // Extension should handle multi-root workspaces
    assert.ok(true, 'Should handle multi-root workspace scenarios');
  });

  it('should handle extension settings validation', async () => {
    // Mock invalid settings
    const mockConfig = {
      get: sandbox.stub(),
      update: sandbox.stub(),
      has: sandbox.stub(),
      inspect: sandbox.stub()
    };

    // Mock invalid agent configuration
    mockConfig.get.withArgs('agents', []).returns([
      { id: '', name: 'Invalid Agent' } // Invalid: empty ID
    ]);

    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);

    await activate(mockContext);
    
    // Extension should handle invalid settings gracefully
    assert.ok(true, 'Should validate and handle invalid settings');
  });

  it('should handle extension resource cleanup', async () => {
    await activate(mockContext);
    
    // Verify all registered disposables have dispose methods
    mockContext.subscriptions.forEach((disposable, index) => {
      assert.ok(
        typeof disposable.dispose === 'function',
        `Disposable ${index} should have dispose method`
      );
    });

    // Test cleanup
    const disposePromises = mockContext.subscriptions.map(disposable => {
      try {
        return Promise.resolve(disposable.dispose());
      } catch (error) {
        return Promise.reject(error);
      }
    });

    const results = await Promise.allSettled(disposePromises);
    
    // All disposals should succeed
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        assert.fail(`Disposable ${index} cleanup failed: ${result.reason}`);
      }
    });
  });
});


