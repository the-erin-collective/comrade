import { Component, ChangeDetectionStrategy, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { MessageService } from '../../services/message.service';
import { ValidationService } from '../../services/validation.service';
import { ProviderManagementComponent } from '../provider-management/provider-management.component';
import { FormValidationState, ValidationRules, FormValidation, FieldValidationState } from '../../utils/validation.utils';
import { ConfirmationDialogComponent, ConfirmationData } from '../confirmation-dialog/confirmation-dialog.component';
import { selectAgentsWithProviders, selectActiveAgents } from '../../state/agent/agent.selectors';
import { selectActiveProviders } from '../../state/provider/provider.selectors';
import { AgentWithProvider, Agent, ProviderConfig, AgentFormData } from '../../interfaces/provider-agent.interface';
import * as AgentActions from '../../state/agent/agent.actions';


// Legacy interface for backward compatibility during migration
interface AgentConfig {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  model: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  capabilities: {
    hasVision: boolean;
    hasToolUse: boolean;
    reasoningDepth: 'basic' | 'intermediate' | 'advanced';
    speed: 'fast' | 'medium' | 'slow';
    costTier: 'low' | 'medium' | 'high';
    supportedLanguages?: string[];
    specializations?: string[];
  };
  isEnabledForAssignment?: boolean;
  // Store our custom fields in a metadata object or handle them separately
  _metadata?: {
    apiKey?: string;
    networkAddress?: string;
    localHostType?: string;
    multimodal?: boolean;
  };
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ProviderManagementComponent, ConfirmationDialogComponent],
  template: `
    <div class="settings-container">
      <div class="settings-header">
        <h2>Comrade Settings</h2>
        <button class="close-btn" (click)="onCloseSettings()" title="Close Settings">
          <span class="icon">×</span>
        </button>
      </div>

      <div class="settings-tabs">
        <button 
          class="settings-tab" 
          [class.active]="activeTab() === 'providers'"
          (click)="setActiveTab('providers')"
        >
          Provider Management
        </button>
        <button 
          class="settings-tab" 
          [class.active]="activeTab() === 'agents'"
          (click)="setActiveTab('agents')">
          Agent Management
        </button>
        <button 
          class="settings-tab" 
          [class.active]="activeTab() === 'general'"
          (click)="setActiveTab('general')">
          General Settings
        </button>
      </div>

      <div class="settings-content">
        @if (activeTab() === 'providers') {
          <div class="settings-section">
            <app-provider-management></app-provider-management>
          </div>
        } @else if (activeTab() === 'agents') {
          <!-- Agent Configuration Section -->
          <div class="settings-section">
            <p class="section-description">Configure AI agents to assist with your coding tasks.</p>
            
            @if ((agentsWithProviders$ | async)?.length === 0) {
              <div class="empty-state">
                <h4>No agents configured</h4>
                <p>Add your first AI agent to get started with Comrade.</p>
                <button 
                  class="primary-btn" 
                  (click)="addNewAgent()"
                  [disabled]="!hasActiveProviders()"
                  [title]="getAddAgentTooltip()">
                  Add Agent
                </button>
              </div>
            } @else {
              <div class="agents-list">
                @for (agentWithProvider of agentsWithProviders$ | async; track agentWithProvider.agent.id) {
                  <div class="agent-card" [class.disabled]="!agentWithProvider.agent.isActive" [class.provider-inactive]="!agentWithProvider.provider.isActive">
                    <div class="agent-header">
                      <div class="agent-info">
                        <div class="agent-name-row">
                          <h4>{{ agentWithProvider.agent.name }}</h4>
                          @if (agentWithProvider.agent.capabilities.hasVision) {
                            <span class="agent-tag multimodal">Vision</span>
                          }
                          @if (agentWithProvider.agent.capabilities.hasToolUse) {
                            <span class="agent-tag tools">Tools</span>
                          }
                          <span class="agent-tag reasoning">{{ agentWithProvider.agent.capabilities.reasoningDepth | titlecase }}</span>
                        </div>
                        <div class="agent-provider-info">
                          <span class="agent-provider">{{ agentWithProvider.provider.name }}</span>
                          <span class="agent-model">{{ agentWithProvider.agent.model }}</span>
                          @if (!agentWithProvider.provider.isActive) {
                            <span class="provider-status-warning">Provider Inactive</span>
                          }
                        </div>
                      </div>
                      <div class="agent-controls">
                        <label class="toggle-switch">
                          <input type="checkbox" 
                                 [ngModel]="agentWithProvider.agent.isActive" 
                                 (ngModelChange)="onAgentToggleChange(agentWithProvider.agent.id, $event)"
                                 [disabled]="!agentWithProvider.provider.isActive">
                          <span class="toggle-slider"></span>
                        </label>
                        <button class="icon-btn" (click)="editAgent(agentWithProvider)" title="Edit">
                          <span class="icon">✏️</span>
                        </button>
                        <button class="icon-btn danger" (click)="deleteAgent(agentWithProvider.agent.id)" title="Delete">
                          <span class="icon">🗑️</span>
                        </button>
                      </div>
                    </div>
                    <div class="agent-status">
                      @if (agentWithProvider.agent.isActive && agentWithProvider.provider.isActive) {
                        <span class="status-indicator active"></span>
                        <span class="status-text">Active</span>
                      } @else if (!agentWithProvider.provider.isActive) {
                        <span class="status-indicator provider-inactive"></span>
                        <span class="status-text">Provider Inactive</span>
                      } @else {
                        <span class="status-indicator inactive"></span>
                        <span class="status-text">Inactive</span>
                      }
                      <div class="agent-capabilities">
                        <span class="capability-badge speed-{{ agentWithProvider.agent.capabilities.speed }}">{{ agentWithProvider.agent.capabilities.speed }}</span>
                        <span class="capability-badge cost-{{ agentWithProvider.agent.capabilities.costTier }}">{{ agentWithProvider.agent.capabilities.costTier }} cost</span>
                      </div>
                    </div>
                  </div>
                }
              </div>
              <button 
                class="secondary-btn" 
                (click)="addNewAgent()"
                [disabled]="!hasActiveProviders()"
                [title]="getAddAgentTooltip()">
                Add Another Agent
              </button>
            }
          </div>
        } @else if (activeTab() === 'general') {
          <!-- General Settings Section -->
          <div class="settings-section">
            <div class="setting-item">
              <label class="setting-label">
                <input type="checkbox" [(ngModel)]="autoSave" (ngModelChange)="autoSaveSettings()">
                Auto-save conversations
              </label>
              <p class="setting-description">Automatically save your conversation history.</p>
            </div>
            <div class="setting-item">
              <label class="setting-label">
                <input type="checkbox" [(ngModel)]="enableNotifications" (ngModelChange)="autoSaveSettings()">
                Enable notifications
              </label>
              <p class="setting-description">Show notifications for important events.</p>
            </div>
            
            <h4 class="subsection-title">Advanced Settings</h4>
            <div class="setting-item">
              <label class="setting-label">Request timeout (seconds)</label>
              <input type="number" class="setting-input" [(ngModel)]="requestTimeout" (ngModelChange)="autoSaveSettings()" min="10" max="300">
              <p class="setting-description">Maximum time to wait for AI responses.</p>
            </div>
            <div class="setting-item">
              <label class="setting-label">Max conversation history</label>
              <input type="number" class="setting-input" [(ngModel)]="maxHistory" (ngModelChange)="autoSaveSettings()" min="10" max="1000">
              <p class="setting-description">Maximum number of messages to keep in conversation history.</p>
            </div>
          </div>
        }
      </div>


    </div>

    <!-- Agent Form Modal -->
    @if (showAgentForm()) {
      <div class="modal-overlay" (click)="closeAgentForm()">
        <form #agentFormElement="ngForm" (ngSubmit)="saveAgent($event)" class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingAgent() ? 'Edit Agent' : 'Add New Agent' }}</h3>
            <button type="button" class="close-btn" (click)="closeAgentForm()">×</button>
          </div>
          <div class="modal-body">
            <!-- Success/Error Messages -->
            @if (successMessage()) {
              <div class="success-message">
                <span class="icon">✓</span>
                {{ successMessage() }}
              </div>
            }
            @if (errorMessage()) {
              <div class="error-message">
                <span class="icon">⚠</span>
                {{ errorMessage() }}
              </div>
            }
            @if (agentFormErrors().length > 0) {
              <div class="validation-errors">
                <h4>Please fix the following errors:</h4>
                <ul>
                  @for (error of agentFormErrors(); track error) {
                    <li>{{ error }}</li>
                  }
                </ul>
              </div>
            }

            <div class="form-group">
              <label for="agentName">Agent Name (Optional)</label>
              <input 
                type="text" 
                id="agentName" 
                name="agentName" 
                [(ngModel)]="agentForm.name" 
                (input)="validateAgentNameField($event.target.value)"
                placeholder="Leave empty to auto-generate from model name"
                class="form-input"
                [class.error]="!agentNameFieldState().isValid"
                [class.validating]="agentNameFieldState().isValidating"
                [disabled]="savingAgent()">
              @if (agentNameFieldState().isValidating) {
                <div class="field-validation validating">
                  <span class="loading-spinner-small"></span>
                  <span>Validating...</span>
                </div>
              } @else if (!agentNameFieldState().isValid) {
                <div class="field-validation error">
                  @for (error of agentNameFieldState().errors; track error) {
                    <span class="error-text">{{ error }}</span>
                  }
                </div>
              }
              <p class="form-help-text">If left empty, the name will be generated automatically based on the selected model.</p>
            </div>

            <div class="form-group">
              <label for="provider">Provider *</label>
              <select id="provider" name="provider" [(ngModel)]="agentForm.provider" (ngModelChange)="onProviderChange($event); validateAgentProviderField($event)" required #providerField="ngModel" class="form-select" [class.error]="!agentProviderFieldState().isValid" [disabled]="savingAgent()">
                <option value="" disabled>Select a provider...</option>
                @for (provider of activeProviders$ | async; track provider.id) {
                  <option [value]="provider.id">{{ provider.name }} ({{ getProviderTypeDisplayName(provider.type, provider.provider) }})</option>
                }
              </select>
              @if (!agentProviderFieldState().isValid) {
                <div class="field-validation error">
                  @for (error of agentProviderFieldState().errors; track error) {
                    <span class="error-text">{{ error }}</span>
                  }
                </div>
              }
              @if ((activeProviders$ | async)?.length === 0) {
                <p class="form-help-text error">No active providers available. Please configure a provider first.</p>
              }
            </div>

            @if (agentForm.provider) {
              <div class="form-group">
                <button type="button" class="fetch-models-btn" (click)="fetchModelsForProvider()" [disabled]="loadingModels()">
                  @if (loadingModels()) {
                    <span class="loading-spinner-small"></span>
                    Loading Models...
                  } @else {
                    Fetch Available Models
                  }
                </button>
                @if (modelError()) {
                  <p class="error-text">{{ modelError() }}</p>
                }
              </div>
            }

            <div class="form-group">
              <label for="model">Model *</label>
              @if (availableModels().length > 0) {
                <select id="model" name="model" [(ngModel)]="agentForm.model" (ngModelChange)="validateAgentModelField($event)" required class="form-select" [class.error]="!agentModelFieldState().isValid" [disabled]="savingAgent()">
                  <option value="" disabled>Select a model...</option>
                  @for (model of availableModels(); track model) {
                    <option [value]="model">{{ model }}</option>
                  }
                </select>
              } @else {
                <input 
                  type="text" 
                  id="model" 
                  name="model" 
                  [(ngModel)]="agentForm.model" 
                  (input)="validateAgentModelField($event.target.value)"
                  placeholder="Enter model name or fetch models from provider" 
                  [disabled]="!agentForm.provider || savingAgent()"
                  required
                  class="form-input"
                  [class.error]="!agentModelFieldState().isValid"
                  [class.validating]="agentModelFieldState().isValidating">
              }
              @if (agentModelFieldState().isValidating) {
                <div class="field-validation validating">
                  <span class="loading-spinner-small"></span>
                  <span>Validating model name...</span>
                </div>
              } @else if (!agentModelFieldState().isValid) {
                <div class="field-validation error">
                  @for (error of agentModelFieldState().errors; track error) {
                    <span class="error-text">{{ error }}</span>
                  }
                </div>
              }
              <p class="form-help-text">Select a provider and fetch models, or enter a model name manually.</p>
            </div>

            <!-- Advanced Settings -->
            <div class="form-group">
              <label for="temperature">Temperature</label>
              <input 
                type="number" 
                id="temperature" 
                name="temperature" 
                [(ngModel)]="agentForm.temperature" 
                (input)="validateTemperatureField($event.target.value)"
                min="0" 
                max="2" 
                step="0.1"
                class="form-input"
                [class.error]="!agentTemperatureFieldState().isValid"
                [class.validating]="agentTemperatureFieldState().isValidating"
                [disabled]="savingAgent()">
              @if (agentTemperatureFieldState().isValidating) {
                <div class="field-validation validating">
                  <span class="loading-spinner-small"></span>
                  <span>Validating...</span>
                </div>
              } @else if (!agentTemperatureFieldState().isValid) {
                <div class="field-validation error">
                  @for (error of agentTemperatureFieldState().errors; track error) {
                    <span class="error-text">{{ error }}</span>
                  }
                </div>
              }
              <p class="form-help-text">Controls randomness in responses (0.0 = deterministic, 2.0 = very creative)</p>
            </div>

            <div class="form-group">
              <label for="maxTokens">Max Tokens</label>
              <input 
                type="number" 
                id="maxTokens" 
                name="maxTokens" 
                [(ngModel)]="agentForm.maxTokens" 
                (input)="validateMaxTokensField($event.target.value)"
                min="1" 
                max="100000"
                class="form-input"
                [class.error]="!agentMaxTokensFieldState().isValid"
                [class.validating]="agentMaxTokensFieldState().isValidating"
                [disabled]="savingAgent()">
              @if (agentMaxTokensFieldState().isValidating) {
                <div class="field-validation validating">
                  <span class="loading-spinner-small"></span>
                  <span>Validating...</span>
                </div>
              } @else if (!agentMaxTokensFieldState().isValid) {
                <div class="field-validation error">
                  @for (error of agentMaxTokensFieldState().errors; track error) {
                    <span class="error-text">{{ error }}</span>
                  }
                </div>
              }
              <p class="form-help-text">Maximum number of tokens in the response</p>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="agentForm.multimodal" name="multimodal">
                <span class="checkbox-text">Multimodal (supports images and vision)</span>
              </label>
              <p class="setting-description">Enable if this model can process images and visual content.</p>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="secondary-btn" (click)="closeAgentForm()" [disabled]="savingAgent()">Cancel</button>
            <button type="submit" class="primary-btn" [disabled]="savingAgent() || !isAgentFormValid() || agentFormErrors().length > 0">
              @if (savingAgent()) {
                <span class="loading-spinner-small"></span>
                {{ editingAgent() ? 'Updating...' : 'Adding...' }}
              } @else {
                {{ editingAgent() ? 'Update Agent' : 'Add Agent' }}
              }
            </button>
          </div>
        </form>
      </div>
    }

    <!-- Confirmation Dialog -->
    @if (showConfirmDialog()) {
      <app-confirmation-dialog 
        [data]="confirmationData()"
        (confirm)="onConfirmDelete()"
        (cancel)="closeConfirmDialog()">
      </app-confirmation-dialog>
    }
  `,
  styles: [`
    .settings-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--background-color);
      color: var(--text-color);
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
    }
    
    .settings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border-bottom: 1px solid var(--border-color);
    }
    
    .settings-tabs {
      display: flex;
      border-bottom: 1px solid var(--border-color);
      padding: 0 1rem;
    }
    
    .settings-tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      font-weight: 500;
      color: var(--text-secondary);
      transition: all 0.2s ease;
      
      &:hover {
        color: var(--text-color);
      }
      
      &.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
      }
    }
    
    .settings-content {
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
      min-height: 0;
    }
    
    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text-secondary);
      padding: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      
      &:hover {
        background: var(--hover-bg);
        color: var(--text-color);
      }
    }

    .settings-section {
      margin-bottom: 2rem;
    }

    .section-description {
      margin-bottom: 1.5rem;
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      border: 2px dashed var(--border-color);
      border-radius: 8px;
      background: var(--background-secondary);
    }

    .empty-state h4 {
      margin: 0 0 1rem 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-color);
    }

    .empty-state p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    /* Agent list styles */
    .agents-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .agent-card {
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem;
      background: var(--background-secondary);
      transition: all 0.2s ease;
    }

    .agent-card.disabled {
      opacity: 0.6;
    }

    .agent-card.provider-inactive {
      border-color: var(--warning-color);
      background: var(--warning-bg);
    }

    .agent-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }

    .agent-info {
      flex: 1;
    }

    .agent-name-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }

    .agent-name-row h4 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color);
    }

    .agent-tag {
      padding: 0.125rem 0.5rem;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .agent-tag.multimodal {
      background: var(--primary-color);
      color: white;
    }

    .agent-tag.tools {
      background: var(--success-color);
      color: white;
    }

    .agent-tag.reasoning {
      background: var(--info-color);
      color: white;
    }

    .agent-provider-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .agent-provider {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color);
    }

    .agent-model {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: monospace;
    }

    .provider-status-warning {
      font-size: 11px;
      color: var(--warning-color);
      font-weight: 500;
      text-transform: uppercase;
    }

    .agent-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--border-color);
      transition: 0.2s;
      border-radius: 24px;
    }

    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.2s;
      border-radius: 50%;
    }

    input:checked + .toggle-slider {
      background-color: var(--primary-color);
    }

    input:checked + .toggle-slider:before {
      transform: translateX(20px);
    }

    input:disabled + .toggle-slider {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .icon-btn {
      background: none;
      border: none;
      padding: 0.25rem;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.2s ease;
    }

    .icon-btn:hover {
      background: var(--hover-bg);
      color: var(--text-color);
    }

    .icon-btn.danger:hover {
      background: var(--error-bg);
      color: var(--error-color);
    }

    .agent-status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 0.5rem;
    }

    .status-indicator.active {
      background: var(--success-color);
    }

    .status-indicator.inactive {
      background: var(--text-secondary);
    }

    .status-indicator.provider-inactive {
      background: var(--warning-color);
    }

    .status-text {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .agent-capabilities {
      display: flex;
      gap: 0.25rem;
    }

    .capability-badge {
      padding: 0.125rem 0.375rem;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .capability-badge.speed-fast {
      background: var(--success-bg);
      color: var(--success-color);
    }

    .capability-badge.speed-medium {
      background: var(--warning-bg);
      color: var(--warning-color);
    }

    .capability-badge.speed-slow {
      background: var(--error-bg);
      color: var(--error-color);
    }

    .capability-badge.cost-low {
      background: var(--success-bg);
      color: var(--success-color);
    }

    .capability-badge.cost-medium {
      background: var(--warning-bg);
      color: var(--warning-color);
    }

    .capability-badge.cost-high {
      background: var(--error-bg);
      color: var(--error-color);
    }

    /* Button styles */
    .primary-btn, .secondary-btn {
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
    }

    .primary-btn {
      background: var(--primary-color);
      color: white;
    }

    .primary-btn:hover {
      background: var(--primary-hover);
    }

    .secondary-btn {
      background: var(--background-secondary);
      color: var(--text-color);
      border: 1px solid var(--border-color);
    }

    .secondary-btn:hover {
      background: var(--hover-bg);
    }

    /* Form styles */
    .form-help-text {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 0.25rem;
      line-height: 1.4;
    }

    .error-text {
      font-size: 12px;
      color: var(--error-color);
      margin-top: 0.25rem;
    }

    .fetch-models-btn {
      padding: 0.5rem 1rem;
      background: var(--primary-color);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s ease;
    }

    .fetch-models-btn:hover {
      background: var(--primary-hover);
    }

    .fetch-models-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .loading-spinner-small {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid transparent;
      border-top: 2px solid currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Message styles */
    .success-message, .error-message {
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 14px;
      font-weight: 500;
    }

    .success-message {
      background: var(--success-bg);
      color: var(--success-color);
      border: 1px solid var(--success-color);
    }

    .error-message {
      background: var(--error-bg);
      color: var(--error-color);
      border: 1px solid var(--error-color);
    }

    .validation-errors {
      background: var(--error-bg);
      border: 1px solid var(--error-color);
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .validation-errors h4 {
      margin: 0 0 0.5rem 0;
      color: var(--error-color);
      font-size: 14px;
      font-weight: 600;
    }

    .validation-errors ul {
      margin: 0;
      padding-left: 1.5rem;
      color: var(--error-color);
    }

    .validation-errors li {
      font-size: 13px;
      line-height: 1.4;
      margin-bottom: 0.25rem;
    }

    /* Form input styles */
    .form-input, .form-select {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--background-color);
      color: var(--text-color);
      font-size: 14px;
      transition: border-color 0.2s ease;
    }

    .form-input:focus, .form-select:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.1);
    }

    .form-input:disabled, .form-select:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: var(--background-secondary);
    }

    /* Validation states */
    .form-input.error,
    .form-select.error {
      border-color: var(--error-color, #dc3545);
      box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.1);
    }

    .form-input.validating,
    .form-select.validating {
      border-color: var(--warning-color, #ffc107);
    }

    /* Field validation messages */
    .field-validation {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
      font-size: 0.875rem;
      line-height: 1.4;
    }

    .field-validation.error {
      color: var(--error-color, #dc3545);
    }

    .field-validation.warning {
      color: var(--warning-color, #ffc107);
    }

    .field-validation.validating {
      color: var(--text-secondary);
    }

    .field-validation .loading-spinner-small {
      width: 14px;
      height: 14px;
      border-width: 2px;
    }

    .field-validation .error-text {
      margin: 0;
      font-weight: 500;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text-color);
      font-size: 14px;
    }

    .form-help-text.error {
      color: var(--error-color);
    }

    /* Modal styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: var(--background-color);
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }

    .modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-color);
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border-color);
      background: var(--background-secondary);
    }

    /* Button disabled state */
    .primary-btn:disabled, .secondary-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .primary-btn:disabled:hover, .secondary-btn:disabled:hover {
      background: var(--primary-color);
    }

    .secondary-btn:disabled:hover {
      background: var(--background-secondary);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent {
  closeSettings = output<void>();

  public agents = signal<AgentConfig[]>([]);
  public showAgentForm = signal(false);
  public editingAgent = signal<Agent | null>(null);
  public activeTab = signal<'providers' | 'agents' | 'general'>('providers');
  public availableModels = signal<string[]>([]);
  public loadingModels = signal(false);
  public modelError = signal<string | null>(null);
  public showConfirmDialog = signal(false);
  public confirmationData = signal<ConfirmationData>({
    title: '',
    message: ''
  });
  public agentToDelete = signal<string | null>(null);

  public autoSave = signal(true);
  public enableNotifications = signal(true);
  public requestTimeout = signal(60);
  public maxHistory = signal(100);

  public agentForm = {
    name: '',
    provider: '',
    model: '',
    apiKey: '',
    networkAddress: '',
    localHostType: '',
    multimodal: false,
    endpoint: '',
    temperature: 0.7,
    maxTokens: 4000,
    timeout: 30000
  };

  // UI state signals
  public savingAgent = signal(false);
  public agentFormErrors = signal<string[]>([]);
  public successMessage = signal<string | null>(null);
  public errorMessage = signal<string | null>(null);

  // Real-time validation state for agent form
  private agentValidationState = new FormValidationState();
  
  // Agent field validation states
  agentNameFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  agentProviderFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  agentModelFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  agentTemperatureFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  agentMaxTokensFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });

  // Computed agent form validity
  isAgentFormValid = computed(() => {
    return this.agentValidationState.isFormValid() && 
           this.agentNameFieldState().isValid &&
           this.agentProviderFieldState().isValid &&
           this.agentModelFieldState().isValid &&
           this.agentTemperatureFieldState().isValid &&
           this.agentMaxTokensFieldState().isValid;
  });

  // NgRx selectors
  public agentsWithProviders$ = this.store.select(selectAgentsWithProviders);
  public activeProviders$ = this.store.select(selectActiveProviders);

  constructor(
    private messageService: MessageService,
    private validationService: ValidationService,
    private store: Store
  ) {
    // Load mock data for demo
    this.loadSettings();

    // Subscribe to message responses
    this.messageService.messages$.subscribe(message => {
      this.handleMessageResponse(message);
    });

    // Subscribe to NgRx actions for model loading
    this.subscribeToAgentActions();
  }

  private loadSettings() {
    // Request current configuration from VS Code
    this.messageService.sendMessage({
      type: 'getConfig',
      payload: {}
    });
  }

  private handleMessageResponse(message: any) {
    console.log('SettingsComponent: Received message:', message.type, message.payload);
    switch (message.type) {
      case 'ollamaModelsResult':
        this.handleOllamaModelsResult(message.payload);
        break;
      case 'cloudModelsResult':
        this.handleCloudModelsResult(message.payload);
        break;
      case 'configUpdateResult':
        this.handleConfigUpdateResult(message.payload);
        break;
      case 'configResult':
        this.handleConfigResult(message.payload);
        break;
    }
  }

  private handleOllamaModelsResult(payload: { success: boolean; models?: string[]; error?: string; networkAddress?: string }) {
    this.loadingModels.set(false);

    if (payload.success && payload.models) {
      this.availableModels.set(payload.models);
      this.modelError.set(null);
    } else {
      this.modelError.set(payload.error || 'Failed to fetch Ollama models');
      this.availableModels.set([]);
    }
  }

  private handleCloudModelsResult(payload: { success: boolean; models?: string[]; error?: string; provider?: string }) {
    this.loadingModels.set(false);

    if (payload.success && payload.models) {
      this.availableModels.set(payload.models);
      this.modelError.set(null);
    } else {
      this.modelError.set(payload.error || 'Failed to fetch models');
      this.availableModels.set([]);
    }
  }

  private handleConfigUpdateResult(payload: { success: boolean; error?: string }) {
    if (payload.success) {
      console.log('SettingsComponent: Configuration saved successfully');
    } else {
      console.error('SettingsComponent: Failed to save configuration:', payload.error);
      // You could show an error message to the user here
    }
  }

  private handleConfigResult(payload: { success: boolean; agents?: any[]; error?: string }) {
    if (payload.success && payload.agents) {
      console.log('SettingsComponent: Loaded agents from configuration:', payload.agents);
      // Ensure agents have proper structure
      const normalizedAgents = payload.agents.map(agent => ({
        ...agent,
        capabilities: agent.capabilities || {
          hasVision: false,
          hasToolUse: true,
          reasoningDepth: 'intermediate',
          speed: 'medium',
          costTier: 'medium'
        },
        isEnabledForAssignment: agent.isEnabledForAssignment !== false
      }));
      this.agents.set(normalizedAgents);
    } else {
      console.log('SettingsComponent: No agents found or error loading config:', payload.error);
      this.agents.set([]);
    }
  }

  public addNewAgent() {
    // Check if there are active providers before allowing agent creation
    if (!this.hasActiveProviders()) {
      this.showErrorMessage('Please configure at least one provider before adding agents');
      return;
    }

    this.editingAgent.set(null);
    this.resetAgentForm();
    this.clearMessages();
    this.showAgentForm.set(true);
  }

  public editAgent(agentWithProvider: AgentWithProvider) {
    this.editingAgent.set(agentWithProvider.agent);
    
    this.agentForm = {
      name: agentWithProvider.agent.name,
      provider: agentWithProvider.provider.id,
      model: agentWithProvider.agent.model,
      apiKey: '',
      networkAddress: '',
      localHostType: '',
      multimodal: agentWithProvider.agent.capabilities.hasVision,
      endpoint: '',
      temperature: agentWithProvider.agent.temperature || 0.7,
      maxTokens: agentWithProvider.agent.maxTokens || 4000,
      timeout: agentWithProvider.agent.timeout || 30000
    };
    this.availableModels.set([]);
    this.modelError.set(null);
    this.clearMessages();
    this.showAgentForm.set(true);
  }

  public deleteAgent(agentId: string) {
    this.agentToDelete.set(agentId);
    this.confirmationData.set({
      title: 'Delete Agent',
      message: 'Are you sure you want to delete this agent? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    this.showConfirmDialog.set(true);
  }

  public onConfirmDelete() {
    const agentId = this.agentToDelete();
    if (agentId) {
      // Dispatch NgRx action to delete agent
      this.store.dispatch(AgentActions.deleteAgent({ agentId }));
    }
    this.closeConfirmDialog();
  }

  public closeConfirmDialog() {
    this.showConfirmDialog.set(false);
    this.agentToDelete.set(null);
  }

  public closeAgentForm() {
    this.showAgentForm.set(false);
    this.editingAgent.set(null);
    this.availableModels.set([]);
    this.modelError.set(null);
    this.loadingModels.set(false);
    this.savingAgent.set(false);
    this.clearMessages();
    this.resetAgentForm();
  }

  public async saveAgent(event?: Event) {
    // Prevent default form submission if event is provided
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Clear previous messages
    this.clearMessages();

    // Validate the form
    if (!this.validateAgentForm()) {
      return;
    }

    this.savingAgent.set(true);

    try {
      const editing = this.editingAgent();
      
      if (editing) {
        // Update existing agent
        const updates: Partial<Agent> = {
          name: this.agentForm.name || this.generateAgentName(),
          providerId: this.agentForm.provider,
          model: this.agentForm.model,
          temperature: this.agentForm.temperature,
          maxTokens: this.agentForm.maxTokens,
          timeout: this.agentForm.timeout,
          capabilities: {
            ...editing.capabilities,
            hasVision: this.agentForm.multimodal
          }
        };

        // Dispatch NgRx action to update agent
        this.store.dispatch(AgentActions.updateAgent({ 
          agentId: editing.id, 
          updates 
        }));

        // Listen for success/failure
        this.handleAgentActionResult('update');

      } else {
        // Create new agent
        const agentData: AgentFormData = {
          name: this.agentForm.name || this.generateAgentName(),
          providerId: this.agentForm.provider,
          model: this.agentForm.model,
          temperature: this.agentForm.temperature,
          maxTokens: this.agentForm.maxTokens,
          timeout: this.agentForm.timeout,
          capabilities: {
            hasVision: this.agentForm.multimodal,
            hasToolUse: true,
            reasoningDepth: 'intermediate',
            speed: 'medium',
            costTier: 'medium'
          }
        };

        // Dispatch NgRx action to add agent
        this.store.dispatch(AgentActions.addAgent({ agentData }));

        // Listen for success/failure
        this.handleAgentActionResult('add');
      }

    } catch (error) {
      this.savingAgent.set(false);
      this.showErrorMessage(`Failed to save agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateAgentName(): string {
    const model = this.agentForm.model;
    const providerId = this.agentForm.provider;

    if (model) {
      return `${model} Agent`;
    } else if (providerId) {
      return `Agent - ${providerId}`;
    } else {
      return `New Agent`;
    }
  }

  /**
   * Real-time agent validation methods
   */
  
  /**
   * Validate agent name field in real-time
   */
  async validateAgentNameField(value: string): Promise<void> {
    // Agent name is optional - will be auto-generated if empty
    if (!value?.trim()) {
      this.agentNameFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      return;
    }

    const rules = [
      ValidationRules.stringLength(2, 50)
    ];

    const result = await this.agentValidationState.validateFieldDebounced('agentName', value, rules);
    this.agentNameFieldState.set(this.agentValidationState.getFieldState('agentName'));
  }

  /**
   * Validate agent provider field
   */
  validateAgentProviderField(value: string): void {
    const rules = [ValidationRules.required()];
    const result = FormValidation.validateFieldRealTime(value, 'provider', rules);
    
    this.agentValidationState.setFieldState('agentProvider', {
      isValid: result.valid,
      errors: result.error ? [result.error] : [],
      warnings: result.warnings || [],
      isValidating: false
    });
    
    this.agentProviderFieldState.set(this.agentValidationState.getFieldState('agentProvider'));
  }

  /**
   * Validate agent model field in real-time
   */
  async validateAgentModelField(value: string): Promise<void> {
    const rules = [
      ValidationRules.required(),
      ValidationRules.modelNameFormat()
    ];

    const result = await this.agentValidationState.validateFieldDebounced('model', value, rules);
    this.agentModelFieldState.set(this.agentValidationState.getFieldState('model'));
  }

  /**
   * Validate temperature field in real-time
   */
  async validateTemperatureField(value: number | string): Promise<void> {
    if (value === '' || value === null || value === undefined) {
      this.agentTemperatureFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      return;
    }

    const rules = [ValidationRules.range(0, 2)];
    const result = await this.agentValidationState.validateFieldDebounced('temperature', value, rules);
    this.agentTemperatureFieldState.set(this.agentValidationState.getFieldState('temperature'));
  }

  /**
   * Validate max tokens field in real-time
   */
  async validateMaxTokensField(value: number | string): Promise<void> {
    if (value === '' || value === null || value === undefined) {
      this.agentMaxTokensFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      return;
    }

    const rules = [ValidationRules.range(1, 100000)];
    const result = await this.agentValidationState.validateFieldDebounced('maxTokens', value, rules);
    this.agentMaxTokensFieldState.set(this.agentValidationState.getFieldState('maxTokens'));
  }

  /**
   * Clear agent validation states
   */
  private clearAgentValidationStates(): void {
    this.agentValidationState.clear();
    this.agentNameFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.agentProviderFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.agentModelFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.agentTemperatureFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.agentMaxTokensFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
  }

  private validateAgentForm(): boolean {
    const errors: string[] = [];

    // Validate required fields
    if (!this.agentForm.provider) {
      errors.push('Please select a provider');
    }

    if (!this.agentForm.model || this.agentForm.model.trim().length === 0) {
      errors.push('Please enter or select a model');
    }

    // Validate optional numeric fields
    if (this.agentForm.temperature !== undefined && 
        (this.agentForm.temperature < 0 || this.agentForm.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (this.agentForm.maxTokens !== undefined && 
        (this.agentForm.maxTokens < 1 || this.agentForm.maxTokens > 100000)) {
      errors.push('Max tokens must be between 1 and 100,000');
    }

    if (this.agentForm.timeout !== undefined && 
        (this.agentForm.timeout < 1000 || this.agentForm.timeout > 300000)) {
      errors.push('Timeout must be between 1 and 300 seconds');
    }

    this.agentFormErrors.set(errors);
    return errors.length === 0;
  }

  private handleAgentActionResult(operation: 'add' | 'update') {
    // Listen for configuration update results from the message service
    const subscription = this.messageService.messages$.subscribe(message => {
      if (message.type === 'configUpdateResult' && message.payload.configType === 'agents') {
        this.savingAgent.set(false);
        
        if (message.payload.success) {
          const successMsg = operation === 'add' ? 'Agent created successfully!' : 'Agent updated successfully!';
          this.showSuccessMessage(successMsg);
          
          // Close the form after a brief delay to show the success message
          setTimeout(() => {
            this.closeAgentForm();
          }, 1500);
          
        } else {
          const errorMsg = message.payload.error || `Failed to ${operation} agent`;
          this.showErrorMessage(errorMsg);
        }
        
        subscription.unsubscribe();
      }
    });

    // Set up a timeout to handle the case where no response is received
    setTimeout(() => {
      if (this.savingAgent()) {
        this.savingAgent.set(false);
        this.showErrorMessage('Operation timed out. Please try again.');
        subscription.unsubscribe();
      }
    }, 10000); // 10 second timeout
  }

  private resetAgentForm() {
    this.agentForm = {
      name: '',
      provider: '',
      model: '',
      apiKey: '',
      networkAddress: '',
      localHostType: '',
      multimodal: false,
      endpoint: '',
      temperature: 0.7,
      maxTokens: 4000,
      timeout: 30000
    };
    this.availableModels.set([]);
    this.modelError.set(null);
    this.agentFormErrors.set([]);
    this.clearAgentValidationStates();
  }

  private clearMessages() {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.agentFormErrors.set([]);
    this.clearAgentValidationStates();
  }

  private showSuccessMessage(message: string) {
    this.successMessage.set(message);
    this.errorMessage.set(null);
    
    // Auto-clear success message after 3 seconds
    setTimeout(() => {
      if (this.successMessage() === message) {
        this.successMessage.set(null);
      }
    }, 3000);
  }

  private showErrorMessage(message: string) {
    this.errorMessage.set(message);
    this.successMessage.set(null);
  }

  public hasActiveProviders(): boolean {
    // This will be used in the template to disable the add agent button
    let hasProviders = false;
    
    // Use synchronous approach with current store state
    const subscription = this.store.select(selectActiveProviders).subscribe(providers => {
      hasProviders = providers && providers.length > 0;
    });
    subscription.unsubscribe();
    
    return hasProviders;
  }

  public getAddAgentTooltip(): string {
    if (!this.hasActiveProviders()) {
      return 'Configure at least one provider before adding agents';
    }
    return 'Add a new AI agent';
  }

  private subscribeToAgentActions() {
    // Listen for model loading results
    this.messageService.messages$.subscribe(message => {
      if (message.type === 'configUpdateResult' && 
          message.payload.operation === 'fetchModels') {
        this.loadingModels.set(false);
        
        if (message.payload.success) {
          this.availableModels.set(message.payload.models || []);
          this.modelError.set(null);
        } else {
          this.modelError.set(message.payload.error || 'Failed to fetch models');
          this.availableModels.set([]);
        }
      }
    });
  }

  public onProviderChange(providerId: string) {
    console.log('SettingsComponent: Provider changed to:', providerId);
    this.agentForm.model = '';
    this.availableModels.set([]);
    this.modelError.set(null);
    
    // Clear old form fields that are no longer needed
    this.agentForm.apiKey = '';
    this.agentForm.networkAddress = '';
    this.agentForm.localHostType = '';
  }

  // Legacy methods removed - no longer needed with provider-agent architecture

  public resetToDefaults() {
    this.autoSave.set(true);
    this.enableNotifications.set(true);
    this.requestTimeout.set(60);
    this.maxHistory.set(100);
  }

  public setActiveTab(tab: 'providers' | 'agents' | 'general') {
    this.activeTab.set(tab);
  }

  public onCloseSettings() {
    this.closeSettings.emit();
  }

  public onAgentToggleChange(agentId: string, isActive: boolean) {
    // Dispatch NgRx action to toggle agent status
    this.store.dispatch(AgentActions.toggleAgent({ agentId, isActive }));
  }

  public autoSaveSettings() {
    // Save agents to VS Code settings immediately
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: {
        agents: this.agents(),
        settings: {
          autoSave: this.autoSave(),
          enableNotifications: this.enableNotifications(),
          requestTimeout: this.requestTimeout(),
          maxHistory: this.maxHistory()
        }
      }
    });
    console.log('Settings auto-saved');
  }

  public getProviderDisplayName(provider: string): string {
    const providerNames: { [key: string]: string } = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google',
      'azure': 'Azure OpenAI',
      'ollama': 'Ollama',
      'custom': 'Custom'
    };

    return providerNames[provider] || provider;
  }

  public getProviderTypeDisplayName(type: string, provider: string): string {
    if (type === 'cloud') {
      return this.getProviderDisplayName(provider);
    } else {
      return `${this.getProviderDisplayName(provider)} (Local)`;
    }
  }

  public fetchModelsForProvider() {
    if (!this.agentForm.provider) {return;}
    
    this.loadingModels.set(true);
    this.modelError.set(null);
    
    // Dispatch NgRx action to fetch models for the selected provider
    this.store.dispatch(AgentActions.loadModelsForProvider({ 
      providerId: this.agentForm.provider 
    }));
  }


}