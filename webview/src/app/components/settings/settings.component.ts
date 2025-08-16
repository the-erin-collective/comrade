import { Component, ChangeDetectionStrategy, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { MessageService } from '../../services/message.service';
import { ProviderManagementComponent } from '../provider-management/provider-management.component';
import { ConfirmationDialogComponent, ConfirmationData } from '../confirmation-dialog/confirmation-dialog.component';
import { selectAgentsWithProviders, selectActiveAgents } from '../../state/agent/agent.selectors';
import { selectActiveProviders } from '../../state/provider/provider.selectors';
import { AgentWithProvider, Agent, ProviderConfig } from '../../interfaces/provider-agent.interface';


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
                <button class="primary-btn" (click)="addNewAgent()">Add Agent</button>
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
              <button class="secondary-btn" (click)="addNewAgent()">Add Another Agent</button>
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
            <div class="form-group">
              <label for="provider">Provider</label>
              <select id="provider" name="provider" [(ngModel)]="agentForm.provider" (ngModelChange)="onProviderChange($event)" required #providerField="ngModel">
                <option value="" disabled>Select a provider...</option>
                @for (provider of activeProviders$ | async; track provider.id) {
                  <option [value]="provider.id">{{ provider.name }} ({{ getProviderTypeDisplayName(provider.type, provider.provider) }})</option>
                }
              </select>
              @if ((activeProviders$ | async)?.length === 0) {
                <p class="form-help-text">No active providers available. Please configure a provider first.</p>
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
              <label>Model</label>
              @if (availableModels().length > 0) {
                <select [(ngModel)]="agentForm.model">
                  <option value="" disabled>Select a model...</option>
                  @for (model of availableModels(); track model) {
                    <option [value]="model">{{ model }}</option>
                  }
                </select>
              } @else {
                <input type="text" [(ngModel)]="agentForm.model" 
                       placeholder="Enter model name or fetch models from provider" 
                       [disabled]="!agentForm.provider"
                       required>
              }
              <p class="form-help-text">Select a provider and fetch models, or enter a model name manually.</p>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="agentForm.multimodal">
                <span class="checkbox-text">Multimodal (supports images and vision)</span>
              </label>
              <p class="setting-description">Enable if this model can process images and visual content.</p>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="secondary-btn" (click)="closeAgentForm()">Cancel</button>
            <button type="submit" class="primary-btn" [disabled]="!agentFormElement.form.valid">
              {{ editingAgent() ? 'Update' : 'Add' }} Agent
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
    provider: '',
    model: '',
    apiKey: '',
    networkAddress: '',
    localHostType: '',
    multimodal: false,
    endpoint: ''
  };

  // NgRx selectors
  public agentsWithProviders$ = this.store.select(selectAgentsWithProviders);
  public activeProviders$ = this.store.select(selectActiveProviders);

  constructor(
    private messageService: MessageService,
    private store: Store
  ) {
    // Load mock data for demo
    this.loadSettings();

    // Subscribe to message responses
    this.messageService.messages$.subscribe(message => {
      this.handleMessageResponse(message);
    });
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
    this.editingAgent.set(null);
    this.agentForm = {
      provider: '', // Now stores provider ID instead of provider type
      model: '',
      apiKey: '', // Not used anymore but kept for compatibility
      networkAddress: '', // Not used anymore but kept for compatibility
      localHostType: '', // Not used anymore but kept for compatibility
      multimodal: false,
      endpoint: '' // Not used anymore but kept for compatibility
    };
    this.availableModels.set([]);
    this.modelError.set(null);
    this.showAgentForm.set(true);
  }

  public editAgent(agentWithProvider: AgentWithProvider) {
    this.editingAgent.set(agentWithProvider.agent);
    
    this.agentForm = {
      provider: agentWithProvider.provider.id,
      model: agentWithProvider.agent.model,
      apiKey: '',
      networkAddress: '',
      localHostType: '',
      multimodal: agentWithProvider.agent.capabilities.hasVision,
      endpoint: ''
    };
    this.availableModels.set([]);
    this.modelError.set(null);
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
      // TODO: Dispatch NgRx action to delete agent
      // For now, use the old approach
      const agents = this.agents();
      this.agents.set(agents.filter(a => a.id !== agentId));
      this.autoSaveSettings();
      console.log('Would delete agent with ID:', agentId);
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
  }

  public saveAgent(event?: Event) {
    // Prevent default form submission if event is provided
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const editing = this.editingAgent();
    
    // Generate agent name based on provider and model
    const agentName = this.generateAgentName();

    if (editing) {
      // TODO: Dispatch NgRx action to update existing agent
      const updatedAgent: Agent = {
        ...editing,
        name: agentName,
        providerId: this.agentForm.provider, // Now uses provider ID
        model: this.agentForm.model,
        capabilities: {
          ...editing.capabilities,
          hasVision: this.agentForm.multimodal
        },
        updatedAt: new Date()
      };
      
      // For now, use the old approach
      console.log('Would update agent:', updatedAgent);
    } else {
      // TODO: Dispatch NgRx action to add new agent
      const newAgent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'> = {
        name: agentName,
        providerId: this.agentForm.provider, // Now uses provider ID
        model: this.agentForm.model,
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000,
        capabilities: {
          hasVision: this.agentForm.multimodal,
          hasToolUse: true,
          reasoningDepth: 'intermediate',
          speed: 'medium',
          costTier: 'medium'
        },
        isActive: true
      };
      
      // For now, use the old approach
      console.log('Would create agent:', newAgent);
    }

    // Save settings immediately when an agent is added or updated
    this.autoSaveSettings();
    this.closeAgentForm();
  }

  private generateAgentName(): string {
    const providerId = this.agentForm.provider;
    const model = this.agentForm.model;

    // TODO: Get provider name from NgRx store using providerId
    // For now, use a simple approach
    return `Agent - ${model}`;
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
    // TODO: Dispatch NgRx action to toggle agent status
    // For now, keep the existing behavior
    this.autoSaveSettings();
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
    if (!this.agentForm.provider) return;
    
    this.loadingModels.set(true);
    this.modelError.set(null);
    
    // TODO: Dispatch NgRx action to fetch models for the selected provider
    // For now, simulate the old behavior
    this.messageService.sendMessage({
      type: 'fetchModelsForProvider',
      payload: { providerId: this.agentForm.provider }
    });
  }


}