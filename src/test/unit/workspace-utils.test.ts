import assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { hasWorkspace, getFirstWorkspaceFolder, handleNoWorkspace } from '../../utils/workspace';

describe('Workspace Utilities', () => {
  let sandbox: sinon.SinonSandbox;
  let showWarningMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
    executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand');
    
    // Mock workspace folders
    sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('hasWorkspace', () => {
    it('should return false when no workspace is open', () => {
      assert.strictEqual(hasWorkspace(), false);
    });

    it('should return true when a workspace is open', () => {
      // Mock a workspace folder
      (vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/test/workspace') }
      ];
      assert.strictEqual(hasWorkspace(), true);
    });
  });

  describe('getFirstWorkspaceFolder', () => {
    it('should return undefined when no workspace is open', () => {
      assert.strictEqual(getFirstWorkspaceFolder(), undefined);
    });

    it('should return the first workspace folder when available', () => {
      const mockFolder = { uri: vscode.Uri.file('/test/workspace') };
      (vscode.workspace as any).workspaceFolders = [mockFolder];
      assert.strictEqual(getFirstWorkspaceFolder(), mockFolder);
    });
  });

  describe('handleNoWorkspace', () => {
    it('should show a warning message when no workspace is open', () => {
      // Mock the promise to avoid hanging
      showWarningMessageStub.resolves(undefined);
      
      handleNoWorkspace({} as any);
      assert(showWarningMessageStub.calledOnce);
      const message = showWarningMessageStub.firstCall.args[0];
      assert(message.includes('requires an open workspace'));
      
      // Check that the correct options are provided
      const options = showWarningMessageStub.firstCall.args.slice(1);
      assert(options.includes('Open Workspace'));
      assert(options.includes('Open Folder'));
    });

    it('should not show a warning when a workspace is open', () => {
      (vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/test/workspace') }
      ];
      handleNoWorkspace({} as any);
      assert(showWarningMessageStub.notCalled);
    });

    it('should execute open workspace command when button is clicked', async () => {
      showWarningMessageStub.resolves('Open Workspace');
      
      handleNoWorkspace({} as any);
      
      // Wait for the promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10));
      
      assert(executeCommandStub.calledWith('workbench.action.openWorkspace'));
    });
  });
});


