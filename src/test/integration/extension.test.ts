/**
 * VS Code extension integration tests
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';

// Import extension components
import { activate, deactivate } from '../../extension';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { ComradeSidebarProvider } from '../../providers/sidebarProvider';

suite('VS Code Extension Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockContext: vscode.ExtensionContext;
  let mockSecretStorage: vscode.SecretStorage;

  setup(() => {
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

  teardown(() => {
    sandbox.restore();
    // Clean up singletons
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  test('should activate extension successfully', async () => {
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

  test('should deactivate extension cleanly', async () => {
    // First activate
    await activate(mockContext);
    
    // Then deactivate
    await deactivate();
    
    // Verify cleanup (this is mainly to ensure no errors are thrown)
    assert.ok(true, 'Deactivation should complete without errors');
  });

  test('should handle command execution', async () => {
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

  test('should handle agent configuration command', async () => {
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

  test('should handle agent connectivity testing', async () => {
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

  test('should handle personality configuration', async () => {
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

  test('should handle context analysis command', async () => {
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

  test('should handle error recovery command', async () => {
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

  test('should handle workspace configuration changes', async () => {
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

  test('should register sidebar webview provider correctly', async () => {
    await activate(mockContext);
    
    const registerWebviewStub = vscode.window.registerWebviewViewProvider as sinon.SinonStub;
    
    // Verify webview provider registration
    assert.ok(registerWebviewStub.called, 'Webview provider should be registered');
    
    const providerCall = registerWebviewStub.getCall(0);
    assert.strictEqual(providerCall.args[0], 'comrade.sidebar', 'Should register sidebar view');
    
    const provider = providerCall.args[1];
    assert.ok(provider instanceof ComradeSidebarProvider, 'Should register ComradeSidebarProvider instance');
  });

  test('should handle extension context disposal', async () => {
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

  test('should handle missing workspace gracefully', async () => {
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

  test('should handle extension activation errors gracefully', async () => {
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
});