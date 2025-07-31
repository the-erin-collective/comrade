/**
 * Test suite index - loads and runs all tests
 */

import * as path from 'path';
const { glob } = require('glob');

// Import Mocha properly
const Mocha = require('mocha');

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 20000
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((c, e) => {
    // Find all test files
    const testFiles = [
      // Unit tests
      'unit/**/*.test.js',
      // Integration tests
      'integration/**/*.test.js',
      // Existing tests
      '*.test.js'
    ];

    const promises = testFiles.map(pattern => {
      return new Promise<string[]>((resolve, reject) => {
        glob(pattern, { cwd: testsRoot }, (err: any, files: string[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(files);
          }
        });
      });
    });

    Promise.all(promises)
      .then(results => {
        const allFiles = results.flat();
        
        // Add files to the test suite
        allFiles.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

        try {
          // Run the mocha test
          mocha.run((failures: number) => {
            if (failures > 0) {
              e(new Error(`${failures} tests failed.`));
            } else {
              c();
            }
          });
        } catch (err) {
          console.error(err);
          e(err);
        }
      })
      .catch(e);
  });
}