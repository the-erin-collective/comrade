/**
 * Test suite index - loads and runs all tests
 * 
 * This file is the entry point for the VS Code test runner.
 * It's responsible for setting up the test environment and running the tests.
 */

import * as path from 'path';
import { runTests as vscodeRunTests } from '@vscode/test-electron';

// Import test setup to ensure Mocha globals are available
import '../test-setup';

async function runTests() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './index');
    
    // Run the extension test
    await vscodeRunTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions', // Disable other extensions
        '--disable-workspace-trust', // Disable workspace trust
        '--disable-updates', // Disable updates
        '--disable-crash-reporter', // Disable crash reporter
        '--disable-renderer-backgrounding', // Prevent background throttling
        '--disable-gpu', // Disable GPU hardware acceleration
        '--no-cached-data', // Don't use cached data
        '--user-data-dir', 
        path.join(extensionDevelopmentPath, '.vscode-test', 'user-data-dir')
      ]
    });
    
  } catch (err) {
    console.error('❌ Failed to run tests:', err);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(err => {
  console.error('❌ Unhandled error in test runner:', err);
  process.exit(1);
});

// Export the run function for VS Code test runner
export function run(): Promise<void> {
  console.log('🧪 Starting Comrade test suite...');
  return runTests();
}
