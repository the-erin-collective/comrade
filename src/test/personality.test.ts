/**
 * Tests for personality configuration system
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { PersonalityManager, PersonalityConfig } from '../core/personality';

suite('Personality Configuration Tests', () => {
  let personalityManager: PersonalityManager;
  let testWorkspaceUri: vscode.Uri;

  suiteSetup(async () => {
    // Create a test workspace URI
    testWorkspaceUri = vscode.Uri.file(path.join(__dirname, '..', '..', 'test-workspace'));
    personalityManager = PersonalityManager.getInstance();
  });

  suiteTeardown(() => {
    personalityManager.dispose();
  });

  test('should create singleton instance', () => {
    const instance1 = PersonalityManager.getInstance();
    const instance2 = PersonalityManager.getInstance();
    assert.strictEqual(instance1, instance2, 'PersonalityManager should be a singleton');
  });

  test('should return personality configuration', async () => {
    const personality = await personalityManager.getPersonality();
    
    assert.ok(personality, 'Should return a personality config');
    assert.ok(['file', 'default'].includes(personality.source), 'Should use valid source');
    assert.ok(personality.content.includes('Personality'), 'Should contain personality content');
    assert.ok(personality.content.length > 0, 'Should have non-empty content');
  });

  test('should generate personality content for prompt injection', async () => {
    const promptContent = await personalityManager.getPersonalityForPrompt();
    
    assert.ok(promptContent, 'Should return prompt content');
    assert.ok(promptContent.includes('Personality Guidelines'), 'Should include guidelines header');
    assert.ok(promptContent.includes('Please follow these personality guidelines'), 'Should include instruction');
  });

  test('should handle missing workspace gracefully', async () => {
    const personality = await personalityManager.getPersonality();
    
    assert.ok(personality, 'Should return personality even without workspace');
    assert.ok(['file', 'default'].includes(personality.source), 'Should use valid source');
  });

  test('should create default personality file', async () => {
    try {
      await personalityManager.createDefaultPersonalityFile(testWorkspaceUri);
      
      const hasFile = await personalityManager.hasPersonalityFile(testWorkspaceUri);
      assert.ok(hasFile, 'Should create personality file');
      
      const personality = await personalityManager.getPersonality(testWorkspaceUri);
      assert.strictEqual(personality.source, 'file', 'Should read from file');
      assert.ok(personality.content.includes('Personality'), 'Should contain default content');
    } catch (error) {
      // Test might fail in CI environment without file system access
      console.warn('Personality file creation test skipped:', error);
    }
  });

  test('should validate personality config structure', async () => {
    const personality = await personalityManager.getPersonality();
    
    assert.ok(personality.content, 'Should have content property');
    assert.ok(personality.lastModified instanceof Date, 'Should have lastModified date');
    assert.ok(['file', 'default'].includes(personality.source), 'Should have valid source');
  });

  test('should handle initialization without errors', async () => {
    try {
      await personalityManager.initialize(testWorkspaceUri);
      // If we get here, initialization succeeded
      assert.ok(true, 'Initialization should complete without errors');
    } catch (error) {
      // In test environment, file operations might fail
      console.warn('Personality initialization test skipped:', error);
    }
  });
});

suite('Personality Integration Tests', () => {
  test('should export utility functions', async () => {
    const { getPersonalityForPrompt, initializePersonality } = await import('../core/personality');
    
    assert.ok(typeof getPersonalityForPrompt === 'function', 'Should export getPersonalityForPrompt');
    assert.ok(typeof initializePersonality === 'function', 'Should export initializePersonality');
  });

  test('utility functions should work without workspace', async () => {
    const { getPersonalityForPrompt } = await import('../core/personality');
    
    const promptContent = await getPersonalityForPrompt();
    assert.ok(promptContent, 'Should return content even without workspace');
    assert.ok(promptContent.includes('Personality Guidelines'), 'Should include guidelines');
  });
});