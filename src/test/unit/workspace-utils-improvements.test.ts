import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

// Import the functions we want to test
import {
    getWorkspaceFolderOrDefault,
    handleNoWorkspace,
    initializeWorkspaceDefaults,
    isWorkspaceInitialized,
    hasWorkspace,
    getFirstWorkspaceFolder,
    getWorkspaceRootPath,
    getWorkspaceUri
} from '../../utils/workspace';

describe('Workspace Utility Improvements', () => {
    let sandbox: sinon.SinonSandbox;
    let showWarningMessageStub: sinon.SinonStub;
    let consoleLogStub: sinon.SinonStub;
    let consoleWarnStub: sinon.SinonStub;
    let workspaceFoldersStub: sinon.SinonStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
        sandbox.stub(vscode.window, 'showInformationMessage');
        consoleLogStub = sandbox.stub(console, 'log');
        consoleWarnStub = sandbox.stub(console, 'warn');

        // Mock workspace folders
        workspaceFoldersStub = sandbox.stub(vscode.workspace, 'workspaceFolders');
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getWorkspaceFolderOrDefault', () => {
        it('should return the first workspace folder when available', () => {
            // Arrange
            const mockWorkspaceFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            };
            workspaceFoldersStub.value([mockWorkspaceFolder]);

            // Act
            const result = getWorkspaceFolderOrDefault();

            // Assert
            assert.strictEqual(result, mockWorkspaceFolder);
        });

        it('should return a temporary workspace when no workspace is available', () => {
            // Arrange
            workspaceFoldersStub.value(undefined);

            // Act
            const result = getWorkspaceFolderOrDefault();

            // Assert
            assert.strictEqual(result.name, 'Comrade Temporary Workspace');
            assert.strictEqual(result.index, 0);
            assert.ok(result.uri.fsPath.includes('.comrade-temp'));
        });

        it('should return a temporary workspace when workspace folders is empty array', () => {
            // Arrange
            workspaceFoldersStub.value([]);

            // Act
            const result = getWorkspaceFolderOrDefault();

            // Assert
            assert.strictEqual(result.name, 'Comrade Temporary Workspace');
            assert.strictEqual(result.index, 0);
            assert.ok(result.uri.fsPath.includes('.comrade-temp'));
        });
    });

    describe('handleNoWorkspace', () => {
        it('should not show warning notifications when no workspace is available', () => {
            // Arrange
            workspaceFoldersStub.value(undefined);
            const mockContext = {} as vscode.ExtensionContext;

            // Act
            handleNoWorkspace(mockContext);

            // Assert
            assert.ok(showWarningMessageStub.notCalled, 'Should not show warning messages');
            assert.ok(consoleLogStub.calledWith('Comrade: No workspace is currently open. Extension will function with default settings.'));
        });

        it('should do nothing when workspace is available', () => {
            // Arrange
            const mockWorkspaceFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            };
            workspaceFoldersStub.value([mockWorkspaceFolder]);
            const mockContext = {} as vscode.ExtensionContext;

            // Act
            handleNoWorkspace(mockContext);

            // Assert
            assert.ok(showWarningMessageStub.notCalled, 'Should not show any messages');
            assert.ok(consoleLogStub.notCalled, 'Should not log anything');
        });
    });

    describe('hasWorkspace', () => {
        it('should return true when workspace folders exist', () => {
            // Arrange
            const mockWorkspaceFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            };
            workspaceFoldersStub.value([mockWorkspaceFolder]);

            // Act
            const result = hasWorkspace();

            // Assert
            assert.strictEqual(result, true);
        });

        it('should return false when no workspace folders exist', () => {
            // Arrange
            workspaceFoldersStub.value(undefined);

            // Act
            const result = hasWorkspace();

            // Assert
            assert.strictEqual(result, false);
        });

        it('should return false when workspace folders is empty array', () => {
            // Arrange
            workspaceFoldersStub.value([]);

            // Act
            const result = hasWorkspace();

            // Assert
            assert.strictEqual(result, false);
        });
    });

    describe('getFirstWorkspaceFolder', () => {
        it('should return the first workspace folder when available', () => {
            // Arrange
            const mockWorkspaceFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            };
            workspaceFoldersStub.value([mockWorkspaceFolder]);

            // Act
            const result = getFirstWorkspaceFolder();

            // Assert
            assert.strictEqual(result, mockWorkspaceFolder);
        });

        it('should return undefined when no workspace folders exist', () => {
            // Arrange
            workspaceFoldersStub.value(undefined);

            // Act
            const result = getFirstWorkspaceFolder();

            // Assert
            assert.strictEqual(result, undefined);
        });
    });

    describe('getWorkspaceRootPath', () => {
        it('should return workspace path when workspace is available', () => {
            // Arrange
            const mockWorkspaceFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            };
            workspaceFoldersStub.value([mockWorkspaceFolder]);

            // Act
            const result = getWorkspaceRootPath();

            // Assert
            assert.strictEqual(result, '/test/workspace');
        });

        it('should return temporary path when no workspace is available', () => {
            // Arrange
            workspaceFoldersStub.value(undefined);

            // Act
            const result = getWorkspaceRootPath();

            // Assert
            assert.ok(result.includes('.comrade-temp'));
        });
    });

    describe('getWorkspaceUri', () => {
        it('should return workspace URI when workspace is available', () => {
            // Arrange
            const mockWorkspaceFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            };
            workspaceFoldersStub.value([mockWorkspaceFolder]);

            // Act
            const result = getWorkspaceUri();

            // Assert
            assert.strictEqual(result.fsPath, '/test/workspace');
        });

        it('should return temporary URI when no workspace is available', () => {
            // Arrange
            workspaceFoldersStub.value(undefined);

            // Act
            const result = getWorkspaceUri();

            // Assert
            assert.ok(result.fsPath.includes('.comrade-temp'));
        });
    });

    describe('initializeWorkspaceDefaults', () => {
        let fsStatStub: sinon.SinonStub;
        let fsCreateDirectoryStub: sinon.SinonStub;

        beforeEach(() => {
            fsStatStub = sandbox.stub(vscode.workspace.fs, 'stat');
            fsCreateDirectoryStub = sandbox.stub(vscode.workspace.fs, 'createDirectory');
        });

        it('should create .comrade directory when it does not exist', async () => {
            // Arrange
            workspaceFoldersStub.value([{
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            }]);

            fsStatStub.rejects(new Error('Directory not found'));
            fsCreateDirectoryStub.resolves();

            // Act
            await initializeWorkspaceDefaults();

            // Assert
            assert.ok(fsCreateDirectoryStub.calledOnce, 'Should create .comrade directory');
            assert.ok(consoleLogStub.calledWith(sinon.match('Created .comrade directory')));
        });

        it('should not create .comrade directory when it already exists', async () => {
            // Arrange
            workspaceFoldersStub.value([{
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            }]);

            fsStatStub.resolves({ type: vscode.FileType.Directory } as vscode.FileStat);

            // Act
            await initializeWorkspaceDefaults();

            // Assert
            assert.ok(fsCreateDirectoryStub.notCalled, 'Should not create directory when it exists');
            assert.ok(consoleLogStub.calledWith(sinon.match('Comrade directory already exists')));
        });

        it('should handle errors gracefully without throwing', async () => {
            // Arrange
            workspaceFoldersStub.value([{
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            }]);

            fsStatStub.rejects(new Error('Permission denied'));
            fsCreateDirectoryStub.rejects(new Error('Cannot create directory'));

            // Act & Assert - should not throw
            await assert.doesNotReject(async () => {
                await initializeWorkspaceDefaults();
            });

            assert.ok(consoleWarnStub.calledWith(sinon.match('Failed to initialize workspace defaults')));
        });
    });

    describe('isWorkspaceInitialized', () => {
        let fsStatStub: sinon.SinonStub;

        beforeEach(() => {
            fsStatStub = sandbox.stub(vscode.workspace.fs, 'stat');
        });

        it('should return true when .comrade directory exists', async () => {
            // Arrange
            workspaceFoldersStub.value([{
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            }]);

            fsStatStub.resolves({ type: vscode.FileType.Directory } as vscode.FileStat);

            // Act
            const result = await isWorkspaceInitialized();

            // Assert
            assert.strictEqual(result, true);
        });

        it('should return false when .comrade directory does not exist', async () => {
            // Arrange
            workspaceFoldersStub.value([{
                uri: vscode.Uri.file('/test/workspace'),
                name: 'test-workspace',
                index: 0
            }]);

            fsStatStub.rejects(new Error('Directory not found'));

            // Act
            const result = await isWorkspaceInitialized();

            // Assert
            assert.strictEqual(result, false);
        });
    });
});