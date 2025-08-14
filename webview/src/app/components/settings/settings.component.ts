import { Component, ChangeDetectionStrategy, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from '../../services/message.service';
import { ModelListComponent } from './model-list/model-list.component';

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
  imports: [CommonModule, FormsModule, ModelListComponent],
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
          [class.active]="activeTab() === 'models'"
          (click)="setActiveTab('models')"
        >
          Model Management
        </button>
        <button 
          class="settings-tab" 
          [class.active]="activeTab() === 'agents'"
          (click)="setActiveTab('agents')">
          Agent Configuration
        </button>
        <button 
          class="settings-tab" 
          [class.active]="activeTab() === 'general'"
          (click)="setActiveTab('general')">
          General Settings
        </button>
      </div>

      <div class="settings-content">
        @if (activeTab() === 'models') {
          <model-list></model-list>
        } @else if (activeTab() === 'agents') {
          <!-- Agent Configuration Section -->
          <div class="settings-section">
            <p class="section-description">Configure AI agents to assist with your coding tasks.</p>
            
            @if (agents().length === 0) {
              <div class="empty-state">
                <h4>No agents configured</h4>
                <p>Add your first AI agent to get started with Comrade.</p>
                <button class="primary-btn" (click)="addNewAgent()">Add Agent</button>
              </div>
            } @else {
              <div class="agents-list">
                @for (agent of agents(); track agent.id) {
                  <div class="agent-card" [class.disabled]="!agent.isEnabledForAssignment">
                    <div class="agent-header">
                      <div class="agent-info">
                        <div class="agent-name-row">
                          <h4>{{ agent.name }}</h4>
                          @if (agent.capabilities?.hasVision) {
                            <span class="agent-tag multimodal">Multimodal</span>
                          }
                        </div>
                        <span class="agent-provider">{{ getProviderDisplayName(agent.provider) }}</span>
                      </div>
                      <div class="agent-controls">
                        <label class="toggle-switch">
                          <input type="checkbox" [(ngModel)]="agent.isEnabledForAssignment" (ngModelChange)="onAgentToggleChange()">
                          <span class="toggle-slider"></span>
                        </label>
                        <button class="icon-btn" (click)="editAgent(agent)" title="Edit">
                          <span class="icon">✏️</span>
                        </button>
                        <button class="icon-btn danger" (click)="deleteAgent(agent.id)" title="Delete">
                          <span class="icon">🗑️</span>
                        </button>
                      </div>
                    </div>
                    <div class="agent-status">
                      @if (agent.isEnabledForAssignment) {
                        <span class="status-indicator active"></span>
                        <span class="status-text">Active</span>
                      } @else {
                        <span class="status-indicator inactive"></span>
                        <span class="status-text">Disabled</span>
                      }
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
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
                <option value="azure">Azure OpenAI</option>
                <option value="local-network">Local Network</option>
              </select>
            </div>

            @if (agentForm.provider === 'local-network') {
              <div class="form-group">
                <label>Local Host Type</label>
                <select [(ngModel)]="agentForm.localHostType" (ngModelChange)="onLocalHostTypeChange($event)">
                  <option value="" disabled>Select host type...</option>
                  <option value="ollama">Ollama</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label>Network Address</label>
                <input type="text" [(ngModel)]="agentForm.networkAddress" placeholder="e.g., http://localhost:11434">
              </div>
            } @else if (agentForm.provider && agentForm.provider !== 'local-network') {
              <div class="form-group">
                <label>API Key</label>
                <div class="api-key-group">
                  <input type="password" [(ngModel)]="agentForm.apiKey" placeholder="Enter your API key">
                  @if (agentForm.apiKey) {
                    <button type="button" class="fetch-models-btn" (click)="fetchModels()" [disabled]="loadingModels()">
                      @if (loadingModels()) {
                        <span class="loading-spinner-small"></span>
                      } @else {
                        Fetch Models
                      }
                    </button>
                  }
                </div>
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
                       [placeholder]="getModelPlaceholder()" 
                       [disabled]="agentForm.provider !== 'local-network' && !agentForm.apiKey">
              }
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
            <button type="submit" class="primary-btn" [disabled]="!agentFormElement.form?.valid">
              {{ editingAgent() ? 'Update' : 'Add' }} Agent
            </button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .settings-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--background-color);
      color: var(--text-color);
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent {
  closeSettings = output<void>();

  public agents = signal<AgentConfig[]>([]);
  public showAgentForm = signal(false);
  public editingAgent = signal<AgentConfig | null>(null);
  public activeTab = signal<'models' | 'agents' | 'general'>('models');
  public availableModels = signal<string[]>([]);
  public loadingModels = signal(false);
  public modelError = signal<string | null>(null);

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

  constructor(private messageService: MessageService) {
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
      provider: '',
      model: '',
      apiKey: '',
      networkAddress: '',
      localHostType: '',
      multimodal: false,
      endpoint: ''
    };
    this.availableModels.set([]);
    this.modelError.set(null);
    this.showAgentForm.set(true);
  }

  public editAgent(agent: AgentConfig) {
    this.editingAgent.set(agent);
    const provider = agent.provider === 'ollama' && agent._metadata?.localHostType ? 'local-network' : agent.provider;
    
    this.agentForm = {
      provider: provider,
      model: agent.model,
      apiKey: agent._metadata?.apiKey || '',
      networkAddress: agent.endpoint || agent._metadata?.networkAddress || '',
      localHostType: agent._metadata?.localHostType || '',
      multimodal: agent.capabilities.hasVision || agent._metadata?.multimodal || false,
      endpoint: agent.endpoint || ''
    };
    this.availableModels.set([]);
    this.modelError.set(null);
    this.showAgentForm.set(true);
  }

  public deleteAgent(agentId: string) {
    const agents = this.agents();
    this.agents.set(agents.filter(a => a.id !== agentId));
  }

  public closeAgentForm() {
    this.showAgentForm.set(false);
    this.editingAgent.set(null);
    this.availableModels.set([]);
    this.modelError.set(null);
    this.loadingModels.set(false);
  }

  public  saveAgent(event?: Event) {
    // Prevent default form submission if event is provided
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const editing = this.editingAgent();
    const agents = this.agents();

    // Generate agent name based on provider and model
    const agentName = this.generateAgentName();

    if (editing) {
      // Update existing agent
      const index = agents.findIndex(a => a.id === editing.id);
      if (index >= 0) {
        const provider = this.agentForm.provider === 'local-network' ? 'ollama' : this.agentForm.provider as 'openai' | 'anthropic' | 'ollama' | 'custom';
        
        agents[index] = {
          ...editing,
          name: agentName,
          provider: provider,
          model: this.agentForm.model,
          endpoint: this.agentForm.networkAddress || undefined,
          capabilities: {
            ...editing.capabilities,
            hasVision: this.agentForm.multimodal
          },
          _metadata: {
            apiKey: this.agentForm.apiKey || undefined,
            networkAddress: this.agentForm.networkAddress || undefined,
            localHostType: this.agentForm.localHostType || undefined,
            multimodal: this.agentForm.multimodal
          }
        };
      }
    } else {
      // Add new agent
      const provider = this.agentForm.provider === 'local-network' ? 'ollama' : this.agentForm.provider as 'openai' | 'anthropic' | 'ollama' | 'custom';
      
      const newAgent: AgentConfig = {
        id: Date.now().toString(),
        name: agentName,
        provider: provider,
        model: this.agentForm.model,
        endpoint: this.agentForm.networkAddress || undefined,
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000,
        capabilities: {
          hasVision: this.agentForm.multimodal,
          hasToolUse: true,
          reasoningDepth: 'intermediate',
          speed: 'medium',
          costTier: 'medium',
          supportedLanguages: ['en'],
          specializations: ['code']
        },
        isEnabledForAssignment: true,
        _metadata: {
          apiKey: this.agentForm.apiKey || undefined,
          networkAddress: this.agentForm.networkAddress || undefined,
          localHostType: this.agentForm.localHostType || undefined,
          multimodal: this.agentForm.multimodal
        }
      };
      agents.push(newAgent);
    }

    this.agents.set([...agents]);
    // Save settings immediately when an agent is added or updated
    this.autoSaveSettings();
    this.closeAgentForm();
  }

  private generateAgentName(): string {
    const provider = this.agentForm.provider;
    const model = this.agentForm.model;

    if (provider === 'local-network') {
      const hostType = this.agentForm.localHostType || 'Local';
      return `${hostType} - ${model}`;
    }

    const providerNames: { [key: string]: string } = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google',
      'azure': 'Azure'
    };

    const providerName = providerNames[provider] || provider;
    return `${providerName} - ${model}`;
  }

  public onProviderChange(provider: string) {
    console.log('SettingsComponent: Provider changed to:', provider);
    this.agentForm.model = '';
    this.agentForm.apiKey = '';
    this.agentForm.localHostType = '';
    this.availableModels.set([]);
    this.modelError.set(null);

    if (provider === 'local-network') {
      this.agentForm.networkAddress = 'http://localhost:11434';
      console.log('SettingsComponent: Set network address to:', this.agentForm.networkAddress);
    } else {
      this.agentForm.networkAddress = '';
    }
  }

  public onLocalHostTypeChange(hostType: string) {
    console.log('SettingsComponent: Local host type changed to:', hostType);
    console.log('SettingsComponent: Current network address:', this.agentForm.networkAddress);
    this.agentForm.model = '';
    this.availableModels.set([]);

    if (hostType === 'ollama' && this.agentForm.networkAddress) {
      console.log('SettingsComponent: Triggering Ollama model fetch...');
      this.fetchOllamaModels();
    } else {
      console.log('SettingsComponent: Not fetching models - hostType:', hostType, 'networkAddress:', this.agentForm.networkAddress);
    }
  }

  public getModelPlaceholder(): string {
    const provider = this.agentForm.provider;

    if (provider === 'local-network') {
      return this.agentForm.localHostType === 'ollama'
        ? 'e.g., llama3.2, codellama'
        : 'Enter model name';
    }

    const placeholders: { [key: string]: string } = {
      'openai': 'e.g., gpt-4, gpt-4-vision-preview',
      'anthropic': 'e.g., claude-3-5-sonnet-20241022',
      'google': 'e.g., gemini-pro, gemini-pro-vision',
      'azure': 'e.g., gpt-4, gpt-35-turbo'
    };

    return placeholders[provider] || 'Enter model name';
  }

  public fetchModels() {
    if (!this.agentForm.provider || !this.agentForm.apiKey) {return;}

    this.loadingModels.set(true);
    this.modelError.set(null);
    this.messageService.fetchCloudModels(this.agentForm.provider, this.agentForm.apiKey);
  }

  private fetchOllamaModels() {
    console.log('SettingsComponent: Starting to fetch Ollama models...');
    this.loadingModels.set(true);
    this.modelError.set(null);
    this.messageService.fetchOllamaModels(this.agentForm.networkAddress);
    console.log('SettingsComponent: Sent fetchOllamaModels message');
  }

  public resetToDefaults() {
    this.autoSave.set(true);
    this.enableNotifications.set(true);
    this.requestTimeout.set(60);
    this.maxHistory.set(100);
  }

  public setActiveTab(tab: 'models' | 'agents' | 'general') {
    this.activeTab.set(tab);
  }

  public onCloseSettings() {
    this.closeSettings.emit();
  }

  public onAgentToggleChange() {
    // Auto-save when agent toggle changes
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


}