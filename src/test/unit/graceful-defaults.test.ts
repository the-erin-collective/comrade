/**
 * Tests for graceful configuration defaults implementation
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PersonalityManager } from '../../core/personality';
import { ConfigurationManager } from '../../core/config';
import { initializeWorkspaceDefaults, isWorkspaceInitialized } from '../../utils/workspace';

describe('Graceful Configuration Defaults Tests', () => {
  let testWorkspaceUri: vscode.Uri;

  beforeEach(() => {
    // Create a test workspace URI
    testWorkspaceUri = vscode.Uri.file('/tmp/test-workspace');
    
    // Reset singletons
    PersonalityManager.resetInstance();
    ConfigurationManager.resetInstance();
  });

  afterEach(() => {
    // Clean up singletons
    PersonalityManager.resetInstance();
    ConfigurationManager.resetInstance();
  });

  describe('PersonalityManager Graceful Defaults', () => {
    it('should handle missing .comrade directory gracefully', async () => {
      const personalityManager = PersonalityManager.getInstance();
      
      // Should not throw error even if directory doesn't exist
      const personality = await personalityManager.getPersonality(testWorkspaceUri);
      
      assert.strictEqual(personality.source, 'default');
      assert.ok(personality.content.includes('Respond in a concise, friendly'));
    });

    it('should create default personality file when needed', async () => {
      const personalityManager = PersonalityManager.getInstance();
      
      // Initialize should create default files
      await personalityManager.initialize(testWorkspaceUri);
      
      // Should have personality content
      const personality = await personalityManager.getPersonality(testWorkspaceUri);
      assert.ok(personality.content.length > 0);
    });

    it('should provide personality for prompt without errors', async () => {
      const personalityManager = PersonalityManager.getInstance();
      
      // Should work even without initialization
      const promptContent = await personalityManager.getPersonalityForPrompt(testWorkspaceUri);
      
      assert.ok(promptContent.includes('Personality Guidelines'));
      assert.ok(promptContent.length > 0);
    });

    it('should check for .comrade directory existence', async () => {
      const personalityManager = PersonalityManager.getInstance();
      
      // Initially should not exist
      const hasDirectory = await personalityManager.hasComradeDirectory(testWorkspaceUri);
      assert.strictEqual(hasDirectory, false);
    });
  });

  describe('ConfigurationManager Graceful Defaults', () => {
    it('should provide default configuration when none exists', () => {
      // Create a mock secret storage
      const mockSecretStorage = {
        get: async () => undefined,
        store: async () => {},
        delete: async () => {},
        onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
      } as vscode.SecretStorage;

      const configManager = ConfigurationManager.getInstance(mockSecretStorage);
      
      // Should not throw error
      const config = configManager.getConfigurationWithDefaults();
      
      assert.ok(Array.isArray(config.agents));
      assert.strictEqual(config.assignmentDefaultMode, 'speed');
      assert.strictEqual(config.contextMaxFiles, 100);
      assert.strictEqual(config.contextMaxTokens, 8000);
    });

    it('should initialize default configuration without errors', async () => {
      const mockSecretStorage = {
        get: async () => undefined,
        store: async () => {},
        delete: async () => {},
        onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
      } as vscode.SecretStorage;

      const configManager = ConfigurationManager.getInstance(mockSecretStorage);
      
      // Should not throw error
      await configManager.initializeDefaultConfiguration();
      
      // Should complete without errors
      assert.ok(true);
    });
  });

  describe('Workspace Initialization', () => {
    it('should initialize workspace defaults without errors', async () => {
      // Should not throw error
      await initializeWorkspaceDefaults(testWorkspaceUri);
      
      // Should complete without errors
      assert.ok(true);
    });

    it('should check workspace initialization status', async () => {
      // Initially should not be initialized
      const isInitialized = await isWorkspaceInitialized(testWorkspaceUri);
      assert.strictEqual(isInitialized, false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid workspace URI gracefully', async () => {
      const personalityManager = PersonalityManager.getInstance();
      
      // Should not throw error with invalid URI
      const personality = await personalityManager.getPersonality();
      
      assert.strictEqual(personality.source, 'default');
      assert.ok(personality.content.length > 0);
    });

    it('should handle missing workspace gracefully', async () => {
      // Should not throw error without workspace
      await initializeWorkspaceDefaults();
      
      // Should complete without errors
      assert.ok(true);
    });
  });
});