/**
 * Test runner for comprehensive test suite
 */

import * as path from 'path';
import { runTests, downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    
    // Get the path to the VS Code executable
    const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

    // Run integration tests with specific configuration
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      version: 'stable',
      // Combine all environment variables into a single object
      extensionTestsEnv: {
        ...process.env,
        // Test environment variables
        NODE_ENV: 'test',
        TEST_TYPE: 'integration',
        VSCODE_EXTENSION_DEVELOPMENT_PATH: extensionDevelopmentPath,
        VSCODE_EXTENSION_TESTS_PATH: extensionTestsPath,
        VSCODE_TEST_DEBUG: 'true',
        NODE_OPTIONS: '--trace-warnings --unhandled-rejections=strict'
      },
      launchArgs: [
        '--disable-extensions', // Disable other extensions
        '--disable-workspace-trust', // Disable workspace trust
        '--disable-updates', // Disable updates
        '--disable-crash-reporter', // Disable crash reporter
        '--disable-renderer-backgrounding', // Prevent background throttling
        '--disable-gpu', // Disable GPU hardware acceleration
        '--no-cached-data', // Don't use cached data
        '--user-data-dir', path.join(extensionDevelopmentPath, '.vscode-test', 'user-data-dir'),
        '--log', 'debug' // Enable debug logging
      ]
    });
  } catch (err) {
    console.error('❌ Failed to run tests:', err);
    process.exit(1);
  } finally {
    console.log('🏁 Test run completed');
  }
}

main().catch(err => {
  console.error('❌ Unhandled error in test runner:', err);
  process.exit(1);
});