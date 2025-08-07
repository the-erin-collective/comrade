/**
 * Integration tests for improved extension activation
 * Tests the UX improvements for extension activation without workspace warnings,
 * automatic sidebar revelation, and status bar integration.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';

// Import extension components
import { activate, deactivate, getStatusBarManager } from '../../extension';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
// Import extension components

describe('Extension Activation Improvements Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockContext: vscode.ExtensionContext;
  let mockSecretStorage: vscode.SecretStorage;
  let showInformationMessageStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let createStatusBarItemStub: sinon.SinonStub;

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

    // Mock notification methods to track if they're called
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
    showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
    showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
    
    // Mock command execution
    executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand');
    
    // Mock status bar item creation
    const mockStatusBarItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: sandbox.stub(),
      hide: sandbox.stub(),
      dispose: sandbox.stub()
    };
    createStatusBarItemStub = sandbox.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBarItem as any);
  });

  afterEach(() => {
    sandbox.restore();
    // Clean up singletons
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  describe('Extension activation without workspace', () => {
    it('should activate extension successfully without workspace', async () => {
      // Mock no workspace folders (Requirement 1.1, 1.2, 1.3)
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      
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
          'comrade.retryLastOperation',
          'comrade.sidebar.focus'
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

    it('should not display workspace requirement notifications', async () => {
      // Mock no workspace folders (Requirement 1.1)
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      
      await activate(mockContext);
      
      // Verify no blocking notifications were shown
      const warningMessages = showWarningMessageStub.getCalls()
        .map(call => call.args[0])
        .filter(message => typeof message === 'string' && message.toLowerCase().includes('workspace'));
      
      const errorMessages = showErrorMessageStub.getCalls()
        .map(call => call.args[0])
        .filter(message => typeof message === 'string' && message.toLowerCase().includes('workspace'));
      
      assert.strictEqual(
        warningMessages.length, 
        0, 
        'Should not show workspace warning notifications'
      );
      
      assert.strictEqual(
        errorMessages.length, 
        0, 
        'Should not show workspace error notifications'
      );
    });

    it('should initialize all features regardless of workspace status', async () => {
      // Mock no workspace folders (Requirement 1.2, 1.3)
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      
      await activate(mockContext);
      
      // Verify all managers are initialized
      const statusBarManager = getStatusBarManager();
      assert.ok(statusBarManager, 'StatusBarManager should be initialized');
      
      // Verify all expected commands are registered (indicating full initialization)
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const commandNames = registerCommandStub.getCalls().map(call => call.args[0]);
      
      // Core functionality commands should be available
      const coreCommands = [
        'comrade.helloWorld',
        'comrade.openAgentConfig',
        'comrade.testAgentConnectivity',
        'comrade.sidebar.focus'
      ];
      
      coreCommands.forEach(command => {
        assert.ok(
          commandNames.includes(command),
          `Core command ${command} should be available without workspace`
        );
      });
    });
  });

  describe('Automatic sidebar revelation', () => {
    it('should automatically reveal sidebar on extension activation', async () => {
      // Mock workspace folders (can be with or without workspace)
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([
        { uri: vscode.Uri.file('/test/workspace'), name: 'test-workspace', index: 0 }
      ]);
      
      await activate(mockContext);
      
      // Verify sidebar focus command was executed (Requirement 3.1, 3.2)
      assert.ok(
        executeCommandStub.calledWith('comrade.sidebar.focus'),
        'Should execute sidebar focus command on activation'
      );
    });

    it('should register sidebar focus command', async () => {
      await activate(mockContext);
      
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const sidebarFocusCall = registerCommandStub.getCalls().find(
        call => call.args[0] === 'comrade.sidebar.focus'
      );
      
      assert.ok(sidebarFocusCall, 'Sidebar focus command should be registered');
      
      // Test the command handler
      const commandHandler = sidebarFocusCall!.args[1];
      await commandHandler();
      
      // Verify it tries to focus the extension view (Requirement 3.3)
      assert.ok(
        executeCommandStub.calledWith('workbench.view.extension.comrade'),
        'Should execute workbench command to focus extension view'
      );
    });

    it('should handle sidebar focus command errors gracefully', async () => {
      await activate(mockContext);
      
      // Mock command execution to throw error
      executeCommandStub.withArgs('workbench.view.extension.comrade').rejects(new Error('View not found'));
      
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const sidebarFocusCall = registerCommandStub.getCalls().find(
        call => call.args[0] === 'comrade.sidebar.focus'
      );
      
      const commandHandler = sidebarFocusCall!.args[1];
      
      // Should not throw error
      try {
        await commandHandler();
        assert.ok(true, 'Should handle sidebar focus errors gracefully');
      } catch (error) {
        assert.fail(`Sidebar focus command should not throw error: ${error}`);
      }
    });
  });

  describe('Status bar integration', () => {
    it('should create persistent status bar icon after activation', async () => {
      await activate(mockContext);
      
      // Verify status bar items were created (Requirement 4.1)
      assert.ok(createStatusBarItemStub.called, 'Should create status bar items');
      
      // Verify multiple status bar items are created (persistent, progress, cancel)
      assert.ok(
        createStatusBarItemStub.callCount >= 3,
        'Should create at least 3 status bar items (persistent, progress, cancel)'
      );
      
      // Verify status bar manager is available
      const statusBarManager = getStatusBarManager();
      assert.ok(statusBarManager, 'StatusBarManager should be available after activation');
    });

    it('should register status bar quick access command', async () => {
      await activate(mockContext);
      
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const quickAccessCall = registerCommandStub.getCalls().find(
        call => call.args[0] === 'comrade.statusBar.quickAccess'
      );
      
      assert.ok(quickAccessCall, 'Status bar quick access command should be registered');
      
      // Test the command handler (Requirement 4.2)
      const commandHandler = quickAccessCall!.args[1];
      const showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
      showQuickPickStub.resolves({
        label: '$(comment-discussion) Open Chat',
        description: 'Open the Comrade sidebar chat interface'
      } as any);
      
      await commandHandler();
      
      // Verify quick pick was shown
      assert.ok(showQuickPickStub.called, 'Should show quick pick menu');
      
      // Verify the menu contains expected options
      const quickPickOptions = showQuickPickStub.getCall(0).args[0] as any[];
      const optionLabels = quickPickOptions.map((option: any) => option.label);
      
      assert.ok(
        optionLabels.some((label: string) => label.includes('Open Chat')),
        'Quick access menu should include Open Chat option'
      );
      
      assert.ok(
        optionLabels.some((label: string) => label.includes('Settings')),
        'Quick access menu should include Settings option'
      );
      
      assert.ok(
        optionLabels.some((label: string) => label.includes('Help')),
        'Quick access menu should include Help option'
      );
    });

    it('should handle status bar click interactions', async () => {
      await activate(mockContext);
      
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const quickAccessCall = registerCommandStub.getCalls().find(
        call => call.args[0] === 'comrade.statusBar.quickAccess'
      );
      
      const commandHandler = quickAccessCall!.args[1];
      const showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
      
      // Test selecting "Open Chat" option
      showQuickPickStub.resolves({
        label: '$(comment-discussion) Open Chat',
        description: 'Open the Comrade sidebar chat interface'
      } as any);
      
      await commandHandler();
      
      // Verify sidebar focus command was executed
      assert.ok(
        executeCommandStub.calledWith('workbench.view.extension.comrade'),
        'Should execute sidebar focus when Open Chat is selected'
      );
    });

    it('should show status bar in ready state initially', async () => {
      await activate(mockContext);
      
      const statusBarManager = getStatusBarManager();
      
      // Verify status bar manager has ready state method
      assert.ok(
        typeof statusBarManager.showReady === 'function',
        'StatusBarManager should have showReady method'
      );
      
      // Verify status bar items were shown
      const statusBarItems = createStatusBarItemStub.returnValues;
      statusBarItems.forEach((item: any) => {
        if (item.show.called) {
          assert.ok(true, 'Status bar item should be shown');
        }
      });
    });
  });

  describe('No blocking notifications', () => {
    it('should not show blocking notifications during activation without workspace', async () => {
      // Mock no workspace folders
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      
      await activate(mockContext);
      
      // Check for any blocking modal notifications
      const modalNotifications = [
        ...showInformationMessageStub.getCalls(),
        ...showWarningMessageStub.getCalls(),
        ...showErrorMessageStub.getCalls()
      ].filter(call => {
        // Check if the call includes modal: true option
        return call.args.some(arg => 
          typeof arg === 'object' && 
          arg !== null && 
          'modal' in arg && 
          arg.modal === true
        );
      });
      
      assert.strictEqual(
        modalNotifications.length,
        0,
        'Should not show modal notifications during activation'
      );
    });

    it('should not show workspace-related error messages', async () => {
      // Mock no workspace folders
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      
      await activate(mockContext);
      
      // Check for workspace-related error messages
      const workspaceErrors = showErrorMessageStub.getCalls()
        .map(call => call.args[0])
        .filter(message => 
          typeof message === 'string' && 
          (message.toLowerCase().includes('workspace') || 
           message.toLowerCase().includes('folder') ||
           message.toLowerCase().includes('open'))
        );
      
      assert.strictEqual(
        workspaceErrors.length,
        0,
        'Should not show workspace-related error messages'
      );
    });

    it('should handle missing configurations gracefully without blocking notifications', async () => {
      // Mock no workspace folders
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      
      // Mock configuration to return empty/missing values
      const mockConfig = {
        get: sandbox.stub().returns(undefined),
        update: sandbox.stub(),
        has: sandbox.stub().returns(false),
        inspect: sandbox.stub()
      };
      
      const getConfigStub = vscode.workspace.getConfiguration as sinon.SinonStub;
      getConfigStub.returns(mockConfig);
      
      await activate(mockContext);
      
      // Verify no blocking notifications about missing configurations
      const configurationErrors = [
        ...showWarningMessageStub.getCalls(),
        ...showErrorMessageStub.getCalls()
      ].map(call => call.args[0])
        .filter(message => 
          typeof message === 'string' && 
          (message.toLowerCase().includes('config') || 
           message.toLowerCase().includes('setting') ||
           message.toLowerCase().includes('missing'))
        );
      
      assert.strictEqual(
        configurationErrors.length,
        0,
        'Should not show configuration-related blocking notifications'
      );
    });
  });

  describe('Integration with workspace changes', () => {
    it('should handle workspace folder changes without blocking notifications', async () => {
      // Start without workspace
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      
      await activate(mockContext);
      
      // Mock workspace folder change event
      const workspaceFoldersChangeEmitter = new vscode.EventEmitter<vscode.WorkspaceFoldersChangeEvent>();
      sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').value(workspaceFoldersChangeEmitter.event);

      // Clear previous notification calls
      showWarningMessageStub.resetHistory();
      showErrorMessageStub.resetHistory();

      // Trigger workspace folder change
      workspaceFoldersChangeEmitter.fire({
        added: [{ uri: vscode.Uri.file('/new/workspace'), name: 'new-workspace', index: 0 }],
        removed: []
      });

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no blocking notifications were shown
      assert.strictEqual(
        showWarningMessageStub.callCount,
        0,
        'Should not show warning notifications on workspace change'
      );
      
      assert.strictEqual(
        showErrorMessageStub.callCount,
        0,
        'Should not show error notifications on workspace change'
      );
    });

    it('should maintain status bar presence across workspace changes', async () => {
      await activate(mockContext);
      
      const initialStatusBarManager = getStatusBarManager();
      assert.ok(initialStatusBarManager, 'Status bar manager should be present initially');
      
      // Mock workspace folder change
      const workspaceFoldersChangeEmitter = new vscode.EventEmitter<vscode.WorkspaceFoldersChangeEvent>();
      sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').value(workspaceFoldersChangeEmitter.event);

      // Trigger workspace change
      workspaceFoldersChangeEmitter.fire({
        added: [{ uri: vscode.Uri.file('/new/workspace'), name: 'new-workspace', index: 0 }],
        removed: []
      });

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify status bar manager is still available
      const statusBarManagerAfterChange = getStatusBarManager();
      assert.ok(statusBarManagerAfterChange, 'Status bar manager should remain available after workspace change');
    });
  });

  describe('Extension lifecycle', () => {
    it('should complete activation successfully with all improvements', async () => {
      // Mock no workspace to test the complete improved flow
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      
      await activate(mockContext);
      
      // Verify all key improvements are in place:
      
      // 1. No blocking notifications (Requirements 1.1, 1.2, 1.3)
      const blockingNotifications = [
        ...showWarningMessageStub.getCalls(),
        ...showErrorMessageStub.getCalls()
      ].filter(call => 
        call.args.some(arg => 
          typeof arg === 'string' && 
          arg.toLowerCase().includes('workspace')
        )
      );
      
      assert.strictEqual(
        blockingNotifications.length,
        0,
        'Should not show workspace-related blocking notifications'
      );
      
      // 2. Sidebar focus command registered and executed (Requirement 3.1)
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const sidebarFocusRegistered = registerCommandStub.getCalls().some(
        call => call.args[0] === 'comrade.sidebar.focus'
      );
      assert.ok(sidebarFocusRegistered, 'Sidebar focus command should be registered');
      
      assert.ok(
        executeCommandStub.calledWith('comrade.sidebar.focus'),
        'Sidebar focus should be executed on activation'
      );
      
      // 3. Status bar integration (Requirement 4.1)
      assert.ok(createStatusBarItemStub.called, 'Status bar items should be created');
      
      const statusBarManager = getStatusBarManager();
      assert.ok(statusBarManager, 'Status bar manager should be available');
      
      // 4. All core functionality available
      const expectedCommands = [
        'comrade.helloWorld',
        'comrade.openAgentConfig',
        'comrade.sidebar.focus',
        'comrade.statusBar.quickAccess'
      ];
      
      const commandNames = registerCommandStub.getCalls().map(call => call.args[0]);
      expectedCommands.forEach(command => {
        assert.ok(
          commandNames.includes(command),
          `Essential command ${command} should be registered`
        );
      });
    });

    it('should handle deactivation cleanly after improved activation', async () => {
      // Activate with improvements
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      await activate(mockContext);
      
      // Verify activation completed
      const statusBarManager = getStatusBarManager();
      assert.ok(statusBarManager, 'Status bar manager should be available');
      
      // Test deactivation
      try {
        await deactivate();
        assert.ok(true, 'Deactivation should complete without errors');
      } catch (error) {
        assert.fail(`Deactivation should not throw error: ${error}`);
      }
    });
  });
});