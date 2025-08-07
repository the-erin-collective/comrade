import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ComradeStatusBarManager, createStatusBarManager } from '../../ui/statusBar';
import { ISession } from '../../core/session';

describe('Enhanced Status Bar Manager Tests', () => {
  let mockContext: vscode.ExtensionContext;
  let mockPersistentItem: sinon.SinonStubbedInstance<vscode.StatusBarItem>;
  let mockProgressItem: sinon.SinonStubbedInstance<vscode.StatusBarItem>;
  let mockCancelItem: sinon.SinonStubbedInstance<vscode.StatusBarItem>;
  let mockCommands: sinon.SinonStub;
  let mockWindow: sinon.SinonStub;
  let manager: ComradeStatusBarManager;

  beforeEach(() => {
    // Create separate mock status bar items
    mockPersistentItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: sinon.stub(),
      hide: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    mockProgressItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: sinon.stub(),
      hide: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    mockCancelItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: sinon.stub(),
      hide: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    // Mock VS Code window.createStatusBarItem to return different items
    mockWindow = sinon.stub(vscode.window, 'createStatusBarItem');
    mockWindow.onCall(0).returns(mockPersistentItem as any); // First call - persistent item
    mockWindow.onCall(1).returns(mockProgressItem as any);   // Second call - progress item
    mockWindow.onCall(2).returns(mockCancelItem as any);     // Third call - cancel item
    
    // Mock VS Code commands
    mockCommands = sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: sinon.stub() } as any);

    // Mock extension context
    mockContext = {
      subscriptions: []
    } as any;

    // Create manager instance
    manager = new ComradeStatusBarManager(mockContext);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Persistent Status Bar Item Creation and Display', () => {
    it('should create three status bar items on initialization', () => {
      // Verify that createStatusBarItem was called 3 times (persistent, progress, cancel)
      assert.strictEqual(mockWindow.callCount, 3);
      
      // Verify the persistent item was created with correct priority
      const persistentCall = mockWindow.getCall(0);
      assert.strictEqual(persistentCall.args[0], vscode.StatusBarAlignment.Left);
      assert.strictEqual(persistentCall.args[1], 101);
    });

    it('should initialize persistent item with correct properties', () => {
      // The persistent item should be configured and shown
      assert.strictEqual(mockPersistentItem.text, '$(robot) Comrade');
      assert.strictEqual(mockPersistentItem.tooltip, 'Comrade - Click for quick access');
      assert.strictEqual(mockPersistentItem.command, 'comrade.statusBar.quickAccess');
      assert.ok(mockPersistentItem.show.called);
    });

    it('should register required commands on initialization', () => {
      // Verify that both commands are registered
      assert.strictEqual(mockCommands.callCount, 2);
      
      const commandNames = mockCommands.getCalls().map(call => call.args[0]);
      assert.ok(commandNames.includes('comrade.cancelOperation'));
      assert.ok(commandNames.includes('comrade.statusBar.quickAccess'));
    });
  });

  describe('State Transitions', () => {
    it('should transition to ready state correctly', () => {
      manager.showReady();
      
      assert.strictEqual(manager.getCurrentState(), 'ready');
      assert.strictEqual(mockPersistentItem.text, '$(robot) Comrade');
      assert.strictEqual(mockPersistentItem.tooltip, 'Comrade - Click for quick access');
      assert.strictEqual(mockPersistentItem.backgroundColor, undefined);
    });

    it('should transition to busy state correctly', () => {
      const mockSession = createMockSession();
      
      manager.showProgress(mockSession, 'Processing...');
      
      assert.strictEqual(manager.getCurrentState(), 'busy');
      assert.strictEqual(mockPersistentItem.text, '$(sync~spin) Processing...');
      assert.strictEqual(mockPersistentItem.tooltip, 'Comrade: Processing...');
    });

    it('should transition to error state correctly', () => {
      manager.showError('Test error message');
      
      assert.strictEqual(manager.getCurrentState(), 'error');
      assert.strictEqual(mockPersistentItem.text, '$(error) Test error message');
      assert.strictEqual(mockPersistentItem.tooltip, 'Comrade Error: Test error message');
      assert.ok(mockPersistentItem.backgroundColor instanceof vscode.ThemeColor);
    });

    it('should transition to warning state correctly', () => {
      manager.showWarning('Test warning message');
      
      assert.strictEqual(manager.getCurrentState(), 'warning');
      assert.strictEqual(mockPersistentItem.text, '$(warning) Test warning message');
      assert.strictEqual(mockPersistentItem.tooltip, 'Comrade Warning: Test warning message');
      assert.ok(mockPersistentItem.backgroundColor instanceof vscode.ThemeColor);
    });

    it('should return to ready state after hiding progress', () => {
      const mockSession = createMockSession();
      
      // Start with busy state
      manager.showProgress(mockSession, 'Processing...');
      assert.strictEqual(manager.getCurrentState(), 'busy');
      
      // Hide progress should return to ready
      manager.hideProgress();
      assert.strictEqual(manager.getCurrentState(), 'ready');
      assert.strictEqual(mockPersistentItem.text, '$(robot) Comrade');
    });
  });

  describe('Click Handler and Quick Access Menu', () => {
    let mockQuickPick: sinon.SinonStub;
    let mockExecuteCommand: sinon.SinonStub;

    beforeEach(() => {
      mockQuickPick = sinon.stub(vscode.window, 'showQuickPick');
      mockExecuteCommand = sinon.stub(vscode.commands, 'executeCommand');
    });

    it('should show quick access menu when status bar is clicked', async () => {
      // Get the registered quick access command handler
      const quickAccessCall = mockCommands.getCalls().find(call => 
        call.args[0] === 'comrade.statusBar.quickAccess'
      );
      assert.ok(quickAccessCall, 'Quick access command should be registered');
      
      const handler = quickAccessCall.args[1];
      
      // Mock user selecting nothing (cancelling)
      mockQuickPick.resolves(undefined);
      
      await handler();
      
      // Verify quick pick was shown with correct items
      assert.ok(mockQuickPick.called);
      const quickPickCall = mockQuickPick.getCall(0);
      const items = quickPickCall.args[0];
      
      assert.strictEqual(items.length, 3);
      assert.ok(items.some((item: any) => item.label.includes('Open Chat')));
      assert.ok(items.some((item: any) => item.label.includes('Settings')));
      assert.ok(items.some((item: any) => item.label.includes('Help')));
    });

    it('should execute sidebar focus command when Open Chat is selected', async () => {
      const quickAccessCall = mockCommands.getCalls().find(call => 
        call.args[0] === 'comrade.statusBar.quickAccess'
      );
      const handler = quickAccessCall!.args[1];
      
      // Mock user selecting Open Chat
      mockQuickPick.resolves({
        label: '$(comment-discussion) Open Chat',
        command: 'comrade.sidebar.focus'
      });
      
      await handler();
      
      assert.ok(mockExecuteCommand.calledWith('workbench.view.extension.comrade'));
    });

    it('should execute settings command when Settings is selected', async () => {
      const quickAccessCall = mockCommands.getCalls().find(call => 
        call.args[0] === 'comrade.statusBar.quickAccess'
      );
      const handler = quickAccessCall!.args[1];
      
      // Mock user selecting Settings
      mockQuickPick.resolves({
        label: '$(gear) Settings',
        command: 'workbench.action.openSettings'
      });
      
      await handler();
      
      assert.ok(mockExecuteCommand.calledWith('workbench.action.openSettings', 'comrade'));
    });

    it('should show help message when Help is selected', async () => {
      const mockShowInformationMessage = sinon.stub(vscode.window, 'showInformationMessage');
      
      const quickAccessCall = mockCommands.getCalls().find(call => 
        call.args[0] === 'comrade.statusBar.quickAccess'
      );
      const handler = quickAccessCall!.args[1];
      
      // Mock user selecting Help
      mockQuickPick.resolves({
        label: '$(question) Help',
        command: 'comrade.help'
      });
      
      await handler();
      
      assert.ok(mockShowInformationMessage.called);
      const message = mockShowInformationMessage.getCall(0).args[0];
      assert.ok(message.includes('Comrade Help'));
    });
  });

  describe('Progress and Cancellation Handling', () => {
    it('should show progress and cancellation button for cancellable operations', () => {
      const mockSession = createMockSession();
      
      manager.showProgress(mockSession, 'Processing...');
      
      // Progress item should be shown
      assert.ok(mockProgressItem.show.called);
      
      // Cancellation button should be shown
      assert.ok(mockCancelItem.show.called);
      
      // State should be busy
      assert.strictEqual(manager.getCurrentState(), 'busy');
    });

    it('should handle cancellation when cancel button is clicked', async () => {
      const mockSession = createMockSession();
      const mockShowInformationMessage = sinon.stub(vscode.window, 'showInformationMessage');
      
      manager.showProgress(mockSession, 'Processing...');
      
      // Get the cancel command handler
      const cancelCall = mockCommands.getCalls().find(call => 
        call.args[0] === 'comrade.cancelOperation'
      );
      assert.ok(cancelCall, 'Cancel command should be registered');
      
      const cancelHandler = cancelCall.args[1];
      
      // Execute cancel
      cancelHandler();
      
      // Verify session.cancel() was called
      assert.ok((mockSession.cancel as sinon.SinonStub).called);
      
      // Verify information message was shown
      assert.ok(mockShowInformationMessage.calledWith('Operation cancelled'));
      
      // Verify state returned to ready
      assert.strictEqual(manager.getCurrentState(), 'ready');
    });

    it('should hide cancellation button when requested', () => {
      manager.hideCancellationButton();
      
      // The hide method should be called on the cancel item
      assert.ok(mockCancelItem.hide.called);
    });
  });

  describe('Proper Disposal', () => {
    it('should dispose all status bar items when dispose is called', () => {
      manager.dispose();
      
      // All three status bar items should be disposed
      assert.ok(mockPersistentItem.dispose.called);
      assert.ok(mockProgressItem.dispose.called);
      assert.ok(mockCancelItem.dispose.called);
    });

    it('should register disposal with extension context', () => {
      const testContext = {
        subscriptions: []
      } as any;
      
      // This will add disposables to testContext.subscriptions
      createStatusBarManager(testContext);
      
      // Verify that items were added to subscriptions
      // The exact number may vary based on mocking, but should be > 0
      assert.ok(testContext.subscriptions.length > 0);
      
      // Find a disposal object with a dispose function
      const disposables = testContext.subscriptions.filter((item: any) => 
        item && typeof item.dispose === 'function'
      );
      
      assert.ok(disposables.length > 0, 'Should have at least one disposable item');
      
      // Test that the disposal function works
      assert.doesNotThrow(() => {
        disposables[0].dispose();
      });
    });
  });

  describe('Legacy Compatibility Methods', () => {
    it('should show temporary error with timeout', (done) => {
      manager.showTemporaryError('Temporary error', 100);
      
      // Initially should show error
      assert.strictEqual(mockProgressItem.text, '$(error) Temporary error');
      
      // After timeout, should restore
      setTimeout(() => {
        // The text should be restored (empty in this case since no original text)
        assert.ok(mockProgressItem.hide.called);
        done();
      }, 150);
    });

    it('should show temporary warning with timeout', (done) => {
      manager.showTemporaryWarning('Temporary warning', 100);
      
      // Initially should show warning
      assert.strictEqual(mockProgressItem.text, '$(warning) Temporary warning');
      
      // After timeout, should restore
      setTimeout(() => {
        assert.ok(mockProgressItem.hide.called);
        done();
      }, 150);
    });

    it('should show success message with timeout', (done) => {
      manager.showSuccess('Success message', 100);
      
      // Initially should show success
      assert.strictEqual(mockProgressItem.text, '$(check) Success message');
      
      // After timeout, should restore
      setTimeout(() => {
        assert.ok(mockProgressItem.hide.called);
        done();
      }, 150);
    });
  });

  describe('Workspace Status Updates', () => {
    it('should handle workspace status updates without errors', () => {
      assert.doesNotThrow(() => {
        manager.updateWorkspaceStatus(true);
        manager.updateWorkspaceStatus(false);
      });
    });
  });

  // Helper function to create mock session
  function createMockSession(): ISession {
    const mockSession = {
      id: 'test-session',
      workspaceUri: vscode.Uri.file('/test'),
      state: 'active' as any,
      currentPhase: undefined,
      agentMapping: {} as any,
      requirements: {} as any,
      mode: 'interactive' as any,
      cancellationToken: {} as any,
      progress: {} as any,
      startTime: new Date(),
      metadata: {},
      setState: sinon.stub(),
      setPhase: sinon.stub(),
      reportProgress: sinon.stub(),
      cancel: sinon.stub(),
      isCancelled: sinon.stub().returns(false),
      complete: sinon.stub(),
      error: sinon.stub(),
      getLastError: sinon.stub().returns(null),
      clearError: sinon.stub(),
      dispose: sinon.stub()
    } as ISession;
    
    return mockSession;
  }
});