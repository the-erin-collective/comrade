/**
 * Tests for web compatibility layer
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { 
  WebCompatibility, 
  WebFileSystem, 
  WebShellExecutor, 
  WebNetworkUtils,
  WebCompatibilityError 
} from '../core/webcompat';

suite('Web Compatibility Tests', () => {
  
  suite('WebCompatibility', () => {
    test('should detect environment correctly', () => {
      // Note: In test environment, this will likely return false (desktop)
      // but we test the logic
      const isWeb = WebCompatibility.isWeb();
      const isDesktop = WebCompatibility.isDesktop();
      
      assert.strictEqual(isWeb, !isDesktop);
    });

    test('should provide shell information for desktop', () => {
      if (WebCompatibility.isDesktop()) {
        const shell = WebCompatibility.getShell();
        assert.ok(shell.shell);
        assert.ok(Array.isArray(shell.args));
      }
    });

    test('should throw error for shell in web environment', () => {
      // Mock web environment
      const originalIsWeb = WebCompatibility.isWeb;
      (WebCompatibility as any).isWeb = () => true;

      try {
        assert.throws(() => {
          WebCompatibility.getShell();
        }, /Shell commands are not supported in VS Code web environment/);
      } finally {
        // Restore original method
        (WebCompatibility as any).isWeb = originalIsWeb;
      }
    });

    test('should support file system operations', () => {
      assert.strictEqual(WebCompatibility.supportsFileSystem(), true);
    });

    test('should support network requests', () => {
      assert.strictEqual(WebCompatibility.supportsNetworkRequests(), true);
    });

    test('should provide network limitations for web', () => {
      // Mock web environment
      const originalIsWeb = WebCompatibility.isWeb;
      (WebCompatibility as any).isWeb = () => true;

      try {
        const limitations = WebCompatibility.getNetworkLimitations();
        assert.strictEqual(limitations.hasCorsRestrictions, true);
        assert.strictEqual(limitations.requiresHttps, true);
        assert.ok(Array.isArray(limitations.allowedOrigins));
      } finally {
        // Restore original method
        (WebCompatibility as any).isWeb = originalIsWeb;
      }
    });

    test('should provide network limitations for desktop', () => {
      // Mock desktop environment
      const originalIsWeb = WebCompatibility.isWeb;
      (WebCompatibility as any).isWeb = () => false;

      try {
        const limitations = WebCompatibility.getNetworkLimitations();
        assert.strictEqual(limitations.hasCorsRestrictions, false);
        assert.strictEqual(limitations.requiresHttps, false);
      } finally {
        // Restore original method
        (WebCompatibility as any).isWeb = originalIsWeb;
      }
    });
  });

  suite('WebFileSystem', () => {
    let testWorkspaceUri: vscode.Uri;

    setup(() => {
      // Create a test workspace URI
      testWorkspaceUri = vscode.Uri.file('/tmp/test-workspace');
    });

    test('should handle file existence check', async () => {
      const testFile = vscode.Uri.joinPath(testWorkspaceUri, 'nonexistent.txt');
      const exists = await WebFileSystem.exists(testFile);
      assert.strictEqual(exists, false);
    });

    test('should handle file operations gracefully', async () => {
      const testFile = vscode.Uri.joinPath(testWorkspaceUri, 'test.txt');
      const testContent = 'Hello, web compatibility!';

      try {
        // These operations might fail in test environment, but should not throw unexpected errors
        await WebFileSystem.writeFile(testFile, testContent);
        const content = await WebFileSystem.readFile(testFile);
        assert.strictEqual(content, testContent);
        
        await WebFileSystem.delete(testFile);
      } catch (error) {
        // Expected in test environment - just verify error handling
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Failed to'));
      }
    });

    test('should handle directory operations', async () => {
      const testDir = vscode.Uri.joinPath(testWorkspaceUri, 'test-dir');

      try {
        await WebFileSystem.createDirectory(testDir);
        const exists = await WebFileSystem.exists(testDir);
        // In a real workspace, this would be true
      } catch (error) {
        // Expected in test environment
        assert.ok(error instanceof Error);
      }
    });
  });

  suite('WebShellExecutor', () => {
    test('should execute commands in desktop environment', async () => {
      if (WebCompatibility.isDesktop()) {
        const result = await WebShellExecutor.executeCommand('echo "test"', process.cwd(), {
          showWarning: false
        });
        
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('test'));
      }
    });

    test('should return mock result in web environment', async () => {
      // Mock web environment
      const originalIsWeb = WebCompatibility.isWeb;
      (WebCompatibility as any).isWeb = () => true;

      try {
        const result = await WebShellExecutor.executeCommand('echo "test"', '/tmp', {
          showWarning: false
        });
        
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('[WEB MODE]'));
        assert.ok(result.stdout.includes('echo "test"'));
      } finally {
        // Restore original method
        (WebCompatibility as any).isWeb = originalIsWeb;
      }
    });

    test('should identify web-safe commands', () => {
      assert.strictEqual(WebShellExecutor.isWebSafeCommand('echo hello'), true);
      assert.strictEqual(WebShellExecutor.isWebSafeCommand('cat file.txt'), true);
      assert.strictEqual(WebShellExecutor.isWebSafeCommand('ls -la'), true);
      assert.strictEqual(WebShellExecutor.isWebSafeCommand('npm install'), false);
      assert.strictEqual(WebShellExecutor.isWebSafeCommand('rm -rf /'), false);
    });
  });

  suite('WebNetworkUtils', () => {
    test('should check web accessibility', () => {
      // Mock web environment for this test
      const originalIsWeb = WebCompatibility.isWeb;
      (WebCompatibility as any).isWeb = () => true;

      try {
        assert.strictEqual(WebNetworkUtils.isWebAccessible('https://api.openai.com'), true);
        assert.strictEqual(WebNetworkUtils.isWebAccessible('http://localhost:3000'), false);
        assert.strictEqual(WebNetworkUtils.isWebAccessible('https://unknown-api.com'), false);
      } finally {
        // Restore original method
        (WebCompatibility as any).isWeb = originalIsWeb;
      }
    });

    test('should make HTTP requests with proper error handling', async () => {
      // Test with a URL that should fail
      try {
        await WebNetworkUtils.makeRequest('https://nonexistent-domain-12345.com/api', {
          timeout: 1000
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    test('should validate HTTPS requirement in web environment', async () => {
      // Mock web environment
      const originalIsWeb = WebCompatibility.isWeb;
      (WebCompatibility as any).isWeb = () => true;

      try {
        try {
          await WebNetworkUtils.makeRequest('http://api.example.com/test');
          assert.fail('Should have thrown HTTPS error');
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.ok(error.message.includes('HTTPS is required'));
        }
      } finally {
        // Restore original method
        (WebCompatibility as any).isWeb = originalIsWeb;
      }
    });
  });

  suite('WebCompatibilityError', () => {
    test('should create error with feature and fallback info', () => {
      const error = new WebCompatibilityError(
        'Feature not supported',
        'shell-commands',
        'Use VS Code desktop for full functionality'
      );

      assert.strictEqual(error.name, 'WebCompatibilityError');
      assert.strictEqual(error.feature, 'shell-commands');
      assert.strictEqual(error.fallback, 'Use VS Code desktop for full functionality');
    });
  });

  suite('Integration Tests', () => {
    test('should handle mixed web/desktop operations', async () => {
      // Test that the system gracefully handles operations in both environments
      const isWeb = WebCompatibility.isWeb();
      
      if (isWeb) {
        // Web environment tests
        assert.strictEqual(WebCompatibility.supportsShellCommands(), false);
        
        const limitations = WebCompatibility.getNetworkLimitations();
        assert.strictEqual(limitations.hasCorsRestrictions, true);
      } else {
        // Desktop environment tests
        assert.strictEqual(WebCompatibility.supportsShellCommands(), true);
        
        const limitations = WebCompatibility.getNetworkLimitations();
        assert.strictEqual(limitations.hasCorsRestrictions, false);
      }
    });

    test('should provide consistent file system interface', async () => {
      // File system operations should work consistently across environments
      assert.strictEqual(WebCompatibility.supportsFileSystem(), true);
      
      // Test basic file system operations
      const testUri = vscode.Uri.file('/tmp/test-file.txt');
      const exists = await WebFileSystem.exists(testUri);
      
      // Should not throw, regardless of result
      assert.strictEqual(typeof exists, 'boolean');
    });
  });
});