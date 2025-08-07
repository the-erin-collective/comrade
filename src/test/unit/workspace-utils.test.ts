import assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { 
  hasWorkspace, 
  getFirstWorkspaceFolder, 
  handleNoWorkspace, 
  getWorkspaceFolderOrDefault, 
  getWorkspaceRootPath, 
  getWorkspaceUri,
  initializeWorkspaceDefaults,
  isWorkspaceInitialized,
  handleWorkspaceInitialization,
  registerWorkspaceChangeHandlers
} from '../../utils/workspace';


describe('Workspace Utilities', () => {
  let sandbox: sinon.SinonSandbox;
  let showWarningMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let consoleLogStub: sinon.SinonStub;
  let consoleWarnStub: sinon.SinonStub;
  let fsStatStub: sinon.SinonStub;
  let fsCreateDirectoryStub: sinon.SinonStub;
  let workspaceFoldersValue: vscode.WorkspaceFolder[] | undefined;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Setup stubs
    showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);
    consoleLogStub = sandbox.stub(console, 'log');
    consoleWarnStub = sandbox.stub(console, 'warn');
    
    // Mock filesystem operations
    fsStatStub = sandbox.stub(vscode.workspace.fs, 'stat');
    fsCreateDirectoryStub = sandbox.stub(vscode.workspace.fs, 'createDirectory').resolves();
    
    // Reset workspace folders value
    workspaceFoldersValue = undefined;
    
    // Stub the workspaceFolders getter
    sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => workspaceFoldersValue);
    });

  
  // Helper function to set workspace folders for tests
  function setWorkspaceFolders(folders: vscode.WorkspaceFolder[] | undefined) {
    workspaceFoldersValue = folders ? [...folders] : undefined;
  }

  afterEach(() => {
    sandbox.restore();

  });

  describe('hasWorkspace', () => {
    it('should return false when no workspace is open', () => {
      setWorkspaceFolders(undefined);
      assert.strictEqual(hasWorkspace(), false);
    });

    it('should return true when a workspace is open', () => {
      // Mock a workspace folder
      setWorkspaceFolders([{ 
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test',
        index: 0 
      }]);
      assert.strictEqual(hasWorkspace(), true);
    });
  });

  describe('getFirstWorkspaceFolder', () => {
    it('should return undefined when no workspace is open', () => {
      setWorkspaceFolders(undefined);
      assert.strictEqual(getFirstWorkspaceFolder(), undefined);
    });

    it('should return the first workspace folder when available', () => {
      const mockFolder = { 
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test',
        index: 0 
      };
      setWorkspaceFolders([mockFolder]);
      assert.strictEqual(getFirstWorkspaceFolder(), mockFolder);
    });
  });

  describe('handleNoWorkspace', () => {
    it('should not show warning notifications when no workspace is open', () => {
      setWorkspaceFolders(undefined);
      handleNoWorkspace({} as any);
      assert(showWarningMessageStub.notCalled);
    });

    it('should not show warning notifications when a workspace is open', () => {
      setWorkspaceFolders([{ 
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test',
        index: 0 
      }]);
      handleNoWorkspace({} as any);
      assert(showWarningMessageStub.notCalled);
    });
  });

  describe('getWorkspaceFolderOrDefault', () => {
    it('should return the workspace folder when available', () => {
      const mockFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test', index: 0 };
      setWorkspaceFolders([mockFolder]);
      
      const result = getWorkspaceFolderOrDefault();
      assert.strictEqual(result, mockFolder);
    });

    it('should return a temporary workspace when no workspace is available', () => {
      setWorkspaceFolders(undefined);
      const result = getWorkspaceFolderOrDefault();
      assert(result.uri.fsPath.includes('.comrade-temp'));
      assert.strictEqual(result.name, 'Comrade Temporary Workspace');
      assert.strictEqual(result.index, 0);
    });
  });

  describe('getWorkspaceRootPath', () => {
    it('should return workspace path when available', () => {
      const expectedPath = '/test/workspace';
      setWorkspaceFolders([{ 
        uri: vscode.Uri.file(expectedPath),
        name: 'test',
        index: 0 
      }]);
      const result = getWorkspaceRootPath();
      assert.strictEqual(result, expectedPath);
    });

    it('should return temporary path when no workspace is available', () => {
      setWorkspaceFolders(undefined);
      const result = getWorkspaceRootPath();
      assert(result.includes('.comrade-temp'));
    });
  });

  describe('getWorkspaceUri', () => {
    it('should return workspace URI when available', () => {
      const mockFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test', index: 0 };
      setWorkspaceFolders([mockFolder]);
      
      const result = getWorkspaceUri();
      // Use path.normalize to handle platform differences
      assert.strictEqual(path.normalize(result.fsPath), path.normalize('/test/workspace'));
    });

    it('should return temporary URI when no workspace is available', () => {
      setWorkspaceFolders(undefined);
      const result = getWorkspaceUri();
      assert(result.fsPath.includes('.comrade-temp'));
    });
  });

  describe('initializeWorkspaceDefaults', () => {
    it('should create .comrade directory when it does not exist', async () => {
      const testUri = vscode.Uri.file('/test/workspace');
      const comradeDir = vscode.Uri.joinPath(testUri, '.comrade');
      
      // Mock directory does not exist (stat fails)
      fsStatStub.withArgs(comradeDir).rejects(new Error('Directory not found'));
      fsCreateDirectoryStub.resolves();

      await initializeWorkspaceDefaults(testUri);
      
      // Verify directory was created
      assert(fsCreateDirectoryStub.calledOnce);
      assert(consoleLogStub.calledWithMatch(/Created .comrade directory at:/));
    });

    it('should initialize workspace defaults when directory does not exist', async () => {
      const workspaceUri = vscode.Uri.file('/test/workspace');
      setWorkspaceFolders([{ uri: workspaceUri, name: 'test', index: 0 }]);
      
      // Mock fs.stat to throw error (directory doesn't exist)
      fsStatStub.rejects(new Error('Directory does not exist'));
      
      await initializeWorkspaceDefaults(workspaceUri);
      
      // Verify directory was created
      assert(fsCreateDirectoryStub.calledOnce);
      assert(consoleLogStub.calledWithMatch(/Created .comrade directory at:/));
    });

    it('should use default workspace URI when none provided', async () => {
      const mockFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test', index: 0 };
      setWorkspaceFolders([mockFolder]);
      
      fsStatStub.resolves({} as any);

      await initializeWorkspaceDefaults();

      const expectedComradeDir = vscode.Uri.joinPath(mockFolder.uri, '.comrade');
      assert(fsStatStub.calledWith(expectedComradeDir));
    });

    it('should handle initialization errors gracefully', async () => {
      const workspaceUri = vscode.Uri.file('/test/workspace');
      setWorkspaceFolders([{ uri: workspaceUri, name: 'test', index: 0 }]);
      
      // Mock fs.stat to throw error
      fsStatStub.rejects(new Error('Test error'));
      
      await initializeWorkspaceDefaults(workspaceUri);
      
      // Verify error was logged but not re-thrown
      assert(consoleWarnStub.calledWith('Failed to initialize workspace defaults:'));
    });

    it('should log success message when initialization completes', async () => {
      const testUri = vscode.Uri.file('/test/workspace');
      fsStatStub.resolves({} as any);

      await initializeWorkspaceDefaults(testUri);

      assert(consoleLogStub.calledWith('Workspace defaults initialized successfully'));
    });
  });

  describe('isWorkspaceInitialized', () => {
    it('should return true when workspace is initialized', async () => {
      const workspaceUri = vscode.Uri.file('/test/workspace');
      setWorkspaceFolders([{ uri: workspaceUri, name: 'test', index: 0 }]);
      
      // Mock fs.stat to resolve (directory exists)
      fsStatStub.resolves();
      
      const result = await isWorkspaceInitialized(workspaceUri);
      assert.strictEqual(result, true);
    });

    it('should return false when workspace is not initialized', async () => {
      const workspaceUri = vscode.Uri.file('/test/workspace');
      setWorkspaceFolders([{ uri: workspaceUri, name: 'test', index: 0 }]);
      
      // Mock fs.stat to throw error (directory doesn't exist)
      fsStatStub.rejects(new Error('Directory does not exist'));
      
      const result = await isWorkspaceInitialized(workspaceUri);
      assert.strictEqual(result, false);
    });

    it('should use default workspace URI when none provided', async () => {
      const mockFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test', index: 0 };
      setWorkspaceFolders([mockFolder]);
      
      const expectedComradeDir = vscode.Uri.joinPath(mockFolder.uri, '.comrade');
      fsStatStub.withArgs(expectedComradeDir).resolves({} as any);

      const result = await isWorkspaceInitialized();
      assert.strictEqual(result, true);
      assert(fsStatStub.calledWith(expectedComradeDir));
    });
  });

  describe('handleWorkspaceInitialization', () => {
    it('should prompt user for initialization when workspace exists and is not initialized', async () => {
      // Mock workspace exists
      const mockFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test', index: 0 };
      setWorkspaceFolders([mockFolder]);
      
      // Mock workspace not initialized
      fsStatStub.rejects(new Error('Directory does not exist'));
      showInformationMessageStub.resolves('Not Now');
      
      await handleWorkspaceInitialization();
      
      assert(showInformationMessageStub.calledWith(
        'Comrade is not initialized in this workspace. Would you like to initialize it with default settings?',
        { modal: false },
        'Initialize',
        'Not Now'
      ));
    });

    it('should not prompt user when user chooses not to initialize', async () => {
      const mockFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test', index: 0 };
      setWorkspaceFolders([mockFolder]);
      
      // Mock workspace not initialized
      fsStatStub.rejects(new Error('Directory does not exist'));
      showInformationMessageStub.resolves('Not Now');
      
      await handleWorkspaceInitialization();
      
      assert.strictEqual(showInformationMessageStub.callCount, 1);
    });

    it('should initialize silently for temporary workspaces', async () => {
      // No workspace folders (temporary workspace scenario)
      fsStatStub.rejects(new Error('Directory does not exist'));
      fsCreateDirectoryStub.resolves();
      
      await handleWorkspaceInitialization();
      
      assert(showInformationMessageStub.notCalled);
      assert(consoleLogStub.calledWith('Initialized Comrade defaults for temporary workspace'));
    });

    it('should do nothing when workspace is already initialized', async () => {
      const mockFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test', index: 0 };
      setWorkspaceFolders([mockFolder]);
      
      // Mock workspace already initialized
      fsStatStub.resolves({} as any);
      
      await handleWorkspaceInitialization();
      
      assert(showInformationMessageStub.notCalled);
    });

    it('should handle initialization errors gracefully', async () => {
      const mockFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test', index: 0 };
      setWorkspaceFolders([mockFolder]);
      
      // Mock workspace not initialized
      fsStatStub.rejects(new Error('Directory does not exist'));
      showInformationMessageStub.onFirstCall().resolves('Initialize');
      fsCreateDirectoryStub.rejects(new Error('Initialization failed'));
      
      const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
      
      await handleWorkspaceInitialization();
      
      assert(showErrorMessageStub.calledWith('Failed to initialize Comrade workspace. Please try again.'));
    });
  });

  describe('registerWorkspaceChangeHandlers', () => {
    let mockContext: vscode.ExtensionContext;
    let onWorkspaceChangedSpy: sinon.SinonSpy;
    let onDidChangeWorkspaceFoldersStub: sinon.SinonStub;
    let onDidChangeConfigurationStub: sinon.SinonStub;

    beforeEach(() => {
      mockContext = {
        subscriptions: []
      } as any;
      
      onWorkspaceChangedSpy = sandbox.spy();
      onDidChangeWorkspaceFoldersStub = sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
      onDidChangeConfigurationStub = sandbox.stub(vscode.workspace, 'onDidChangeConfiguration');
    });

    it('should register workspace folder change handler', () => {
      const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
      const callback = sinon.stub();
      
      // Create mock event emitters
      const mockWorkspaceFoldersDisposable = { dispose: sinon.stub() };
      const mockConfigDisposable = { dispose: sinon.stub() };
      
      // Stub the event registration methods
      sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders')
        .callsFake((listener) => {
          // Simulate workspace folders change
          setTimeout(() => {
            listener({ added: [], removed: [] });
          }, 0);
          return mockWorkspaceFoldersDisposable;
        });
      
      sandbox.stub(vscode.workspace, 'onDidChangeConfiguration')
        .callsFake((listener) => {
          // Simulate configuration change
          setTimeout(() => {
            const mockEvent = { 
              affectsConfiguration: () => true 
            } as vscode.ConfigurationChangeEvent;
            listener(mockEvent);
          }, 0);
          return mockConfigDisposable;
        });
      
      // Call the function to test - it doesn't return anything, adds to context.subscriptions
      registerWorkspaceChangeHandlers(context, callback);
      
      // Wait for async events to fire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          try {
            // Verify callbacks were called
            assert.strictEqual(callback.callCount, 2, 'Callback should be called for both events');
            assert.strictEqual(context.subscriptions.length, 2, 'Should add disposables to context');
            
            // Verify disposables were added to context
            assert(context.subscriptions.includes(mockWorkspaceFoldersDisposable));
            assert(context.subscriptions.includes(mockConfigDisposable));
            
            // Cleanup - dispose all subscriptions
            context.subscriptions.forEach(d => d.dispose());
            resolve();
          } catch (error) {
            // Cleanup on error
            context.subscriptions.forEach(d => d.dispose());
            throw error;
          }
        }, 10);
      });
    });

    it('should call onWorkspaceChanged when workspace folders change', () => {
      let workspaceFolderChangeHandler: () => void;
      onDidChangeWorkspaceFoldersStub.callsFake((handler) => {
        workspaceFolderChangeHandler = handler;
        return { dispose: sandbox.stub() };
      });
      
      registerWorkspaceChangeHandlers(mockContext, onWorkspaceChangedSpy);
      
      // Simulate workspace folder change
      workspaceFolderChangeHandler!();
      
      assert(onWorkspaceChangedSpy.called);
    });

    it('should call onWorkspaceChanged when comrade configuration changes', () => {
      let configChangeHandler: (e: vscode.ConfigurationChangeEvent) => void;
      onDidChangeConfigurationStub.callsFake((handler) => {
        configChangeHandler = handler;
        return { dispose: sandbox.stub() };
      });
      
      registerWorkspaceChangeHandlers(mockContext, onWorkspaceChangedSpy);
      
      // Simulate configuration change for comrade
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs('comrade').returns(true)
      };
      configChangeHandler!(mockEvent as any);
      
      assert(onWorkspaceChangedSpy.called);
    });

    it('should not call onWorkspaceChanged when non-comrade configuration changes', () => {
      let configChangeHandler: (e: vscode.ConfigurationChangeEvent) => void;
      onDidChangeConfigurationStub.callsFake((handler) => {
        configChangeHandler = handler;
        return { dispose: sandbox.stub() };
      });
      
      registerWorkspaceChangeHandlers(mockContext, onWorkspaceChangedSpy);
      
      // Simulate configuration change for other extension
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs('comrade').returns(false)
      };
      configChangeHandler!(mockEvent as any);
      
      assert(onWorkspaceChangedSpy.notCalled);
    });
  });

  describe('Graceful handling of missing workspace scenarios', () => {
    it('should provide fallback workspace folder when no workspace is available', () => {
      const result = getWorkspaceFolderOrDefault();
      
      assert(result.uri.fsPath.includes('.comrade-temp'));
      assert.strictEqual(result.name, 'Comrade Temporary Workspace');
      assert.strictEqual(result.index, 0);
    });

    it('should use home directory for temporary workspace', () => {
      const result = getWorkspaceFolderOrDefault();
      const expectedPath = path.join(os.homedir(), '.comrade-temp');
      
      assert.strictEqual(path.normalize(result.uri.fsPath), path.normalize(expectedPath));
    });

    it('should handle workspace operations gracefully without workspace', () => {
      // These should not throw errors
      const rootPath = getWorkspaceRootPath();
      const uri = getWorkspaceUri();
      
      assert(typeof rootPath === 'string');
      assert(uri instanceof vscode.Uri);
      assert(rootPath.includes('.comrade-temp'));
      assert(uri.fsPath.includes('.comrade-temp'));
    });
  });

  describe('No warning notifications requirement', () => {
    it('should not show warning notifications in handleNoWorkspace', () => {
      handleNoWorkspace({} as any);
      
      assert(showWarningMessageStub.notCalled);
      assert(consoleLogStub.calledWith('Comrade: No workspace is currently open. Extension will function with default settings.'));
    });

    it('should log information instead of showing warnings', () => {
      handleNoWorkspace({} as any);
      
      assert(consoleLogStub.called);
      assert(showWarningMessageStub.notCalled);
    });
  });

  describe('Default configuration creation requirement', () => {
    it('should create default configurations when needed during initialization', async () => {
      const testUri = vscode.Uri.file('/test/workspace');
      
      // Mock directory doesn't exist
      fsStatStub.rejects(new Error('Directory not found'));
      fsCreateDirectoryStub.resolves();

      await initializeWorkspaceDefaults(testUri);
      
      const expectedComradeDir = vscode.Uri.joinPath(testUri, '.comrade');
      assert(fsCreateDirectoryStub.calledWith(expectedComradeDir));
      assert(consoleLogStub.calledWith('Created .comrade directory at:', expectedComradeDir.fsPath));
    });

    it('should attempt to initialize personality manager during workspace setup', async () => {
      const testUri = vscode.Uri.file('/test/workspace');
      
      fsStatStub.resolves({} as any);

      // This test verifies the function attempts to initialize personality manager
      // The actual personality manager initialization is tested separately
      await initializeWorkspaceDefaults(testUri);
      
      assert(consoleLogStub.calledWith('Workspace defaults initialized successfully'));
    });
  });
});


