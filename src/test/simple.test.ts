/**
 * Simple test to verify the test infrastructure is working
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Simple Test', () => {
  before(() => {
    // Ensure we're in test environment
    process.env.NODE_ENV = 'test';
  });

  it('should pass a simple assertion', () => {
    assert.strictEqual(1 + 1, 2);
  });

  it('should have access to vscode API', () => {
    assert.ok(vscode);
  });
});


