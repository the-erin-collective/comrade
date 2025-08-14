/**
 * Simple test runner for AI conversation flow integration tests
 */

const Mocha = require('mocha');
const path = require('path');

// Create mocha instance
const mocha = new Mocha({
  ui: 'bdd',
  color: true,
  timeout: 30000,
  reporter: 'spec'
});

// Add the specific test file
const testFile = path.resolve(__dirname, 'integration/ai-conversation-flow.test.js');
console.log('Looking for test file at:', testFile);

try {
  mocha.addFile(testFile);
  
  // Run the tests
  mocha.run((failures) => {
    if (failures > 0) {
      console.error(`${failures} tests failed.`);
      process.exit(1);
    } else {
      console.log('All tests passed!');
      process.exit(0);
    }
  });
} catch (error) {
  console.error('Error running tests:', error);
  process.exit(1);
}