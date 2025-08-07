import * as path from 'path';
import Mocha = require('mocha');
const glob = require('glob');

// Import test setup to ensure Mocha globals are available
import '../test-setup';

// This function is called by the test runner to execute the tests
export function run(testsRoot: string, cb: (error: Error | null, failures?: number) => void): void {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000,
    reporter: 'spec'
  });

  // Add files to the test suite
  glob('**/**.test.js', { cwd: testsRoot }, (err: Error | null, files: string[]) => {
    if (err) {
      return cb(err);
    }

    // Add files to the test suite
    files.forEach((f: string) => {
      mocha.addFile(path.resolve(testsRoot, f));
    });

    try {
      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          cb(new Error(`${failures} tests failed.`));
        } else {
          cb(null);
        }
      });
    } catch (err) {
      console.error('Error running tests:', err);
      cb(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
