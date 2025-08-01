/**
 * Test suite index - loads and runs all tests
 */

import * as path from 'path';
import * as fs from 'fs';

// Import Mocha properly
const Mocha = require('mocha');

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 30000,
    reporter: 'spec'
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((c, e) => {
    console.log('🧪 Starting Comrade test suite...');
    
    // Manually add test files that we know exist
    const testFiles = [
      'basic.test.js',
      'registry.test.js',
      'config.test.js',
      'chat.test.js',
      'personality.test.js',
      'personality-integration.test.js',
      'runner.test.js',
      'context-runner.test.js',
      'planning-runner.test.js',
      'execution-runner.test.js',
      'error-handling.test.js',
      'webcompat.test.js'
    ];

    // Add integration tests
    const integrationDir = path.join(testsRoot, 'integration');
    if (fs.existsSync(integrationDir)) {
      const integrationFiles = fs.readdirSync(integrationDir)
        .filter(f => f.endsWith('.test.js'))
        .map(f => path.join('integration', f));
      testFiles.push(...integrationFiles);
    }

    // Add unit tests
    const unitDir = path.join(testsRoot, 'unit');
    if (fs.existsSync(unitDir)) {
      const unitFiles = fs.readdirSync(unitDir)
        .filter(f => f.endsWith('.test.js'))
        .map(f => path.join('unit', f));
      testFiles.push(...unitFiles);
    }

    let addedFiles = 0;
    
    // Add files to the test suite
    testFiles.forEach(f => {
      const fullPath = path.resolve(testsRoot, f);
      if (fs.existsSync(fullPath)) {
        console.log(`  📄 Adding: ${f}`);
        mocha.addFile(fullPath);
        addedFiles++;
      }
    });

    console.log(`📊 Total test files added: ${addedFiles}`);

    if (addedFiles === 0) {
      console.warn('⚠️  No test files found!');
      return c();
    }

    console.log('🚀 Starting test execution...');

    try {
      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          console.error(`❌ ${failures} test(s) failed.`);
          e(new Error(`${failures} tests failed.`));
        } else {
          console.log('✅ All tests passed!');
          c();
        }
      });
    } catch (err) {
      console.error('💥 Error running tests:', err);
      e(err);
    }
  });
}