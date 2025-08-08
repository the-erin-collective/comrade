import { Component, ChangeDetectionStrategy, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface AgentConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-container">
      <div class="settings-header">
        <h2>Comrade Settings</h2>
        <button class="close-btn" (click)="onCloseSettings()" title="Close Settings">
          <span class="icon">×</span>
        </button>
      </div>

      <div class="settings-content">
        <!-- Agent Configuration Section -->
        <div class="settings-section">
          <h3>Agent Configuration</h3>
          <p class="section-description">Configure AI agents to assist with your coding tasks.</p>
          
          @if (agents().length === 0) {
            <div class="empty-state">
              <div class="empty-icon">🤖</div>
              <h4>No agents configured</h4>
              <p>Add your first AI agent to get started with Comrade.</p>
              <button class="primary-btn" (click)="addNewAgent()">Add Agent</button>
            </div>
          } @else {
            <div class="agents-list">
              @for (agent of agents(); track agent.id) {
                <div class="agent-card" [class.disabled]="!agent.enabled">
                  <div class="agent-header">
                    <div class="agent-info">
                      <h4>{{ agent.name }}</h4>
                      <span class="agent-provider">{{ agent.provider }} - {{ agent.model }}</span>
                    </div>
                    <div class="agent-controls">
                      <label class="toggle-switch">
                        <input type="checkbox" [(ngModel)]="agent.enabled">
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
                    @if (agent.enabled) {
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

        <!-- General Settings Section -->
        <div class="settings-section">
          <h3>General Settings</h3>
          <div class="setting-item">
            <label class="setting-label">
              <input type="checkbox" [(ngModel)]="autoSave">
              Auto-save conversations
            </label>
            <p class="setting-description">Automatically save your conversation history.</p>
          </div>
          <div class="setting-item">
            <label class="setting-label">
              <input type="checkbox" [(ngModel)]="enableNotifications">
              Enable notifications
            </label>
            <p class="setting-description">Show notifications for important events.</p>
          </div>
        </div>

        <!-- Advanced Settings Section -->
        <div class="settings-section">
          <h3>Advanced Settings</h3>
          <div class="setting-item">
            <label class="setting-label">Request timeout (seconds)</label>
            <input type="number" class="setting-input" [(ngModel)]="requestTimeout" min="10" max="300">
            <p class="setting-description">Maximum time to wait for AI responses.</p>
          </div>
          <div class="setting-item">
            <label class="setting-label">Max conversation history</label>
            <input type="number" class="setting-input" [(ngModel)]="maxHistory" min="10" max="1000">
            <p class="setting-description">Maximum number of messages to keep in conversation history.</p>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <button class="secondary-btn" (click)="resetToDefaults()">Reset to Defaults</button>
        <div class="footer-actions">
          <button class="secondary-btn" (click)="onCloseSettings()">Cancel</button>
          <button class="primary-btn" (click)="saveSettings()">Save Changes</button>
        </div>
      </div>
    </div>

    <!-- Agent Form Modal -->
    @if (showAgentForm()) {
      <div class="modal-overlay" (click)="closeAgentForm()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingAgent() ? 'Edit Agent' : 'Add New Agent' }}</h3>
            <button class="close-btn" (click)="closeAgentForm()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Agent Name</label>
              <input type="text" [(ngModel)]="agentForm.name" placeholder="e.g., Claude 3.5 Sonnet">
            </div>
            <div class="form-group">
              <label>Provider</label>
              <select [(ngModel)]="agentForm.provider">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
                <option value="azure">Azure OpenAI</option>
              </select>
            </div>
            <div class="form-group">
              <label>Model</label>
              <input type="text" [(ngModel)]="agentForm.model" placeholder="e.g., gpt-4, claude-3-5-sonnet">
            </div>
            <div class="form-group">
              <label>API Key</label>
              <input type="password" [(ngModel)]="agentForm.apiKey" placeholder="Enter your API key">
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-btn" (click)="closeAgentForm()">Cancel</button>
            <button class="primary-btn" (click)="saveAgent()">{{ editingAgent() ? 'Update' : 'Add' }} Agent</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .settings-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--vscode-editor-background);
    }

    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .settings-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-radius: 4px;
      font-size: 18px;
      transition: background-color 0.2s;
    }

    .close-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .settings-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .settings-section {
      margin-bottom: 32px;
    }

    .settings-section h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .section-description {
      margin: 0 0 16px 0;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      border: 2px dashed var(--vscode-panel-border);
      border-radius: 8px;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h4 {
      margin: 0 0 8px 0;
      font-size: 16px;
      color: var(--vscode-foreground);
    }

    .empty-state p {
      margin: 0 0 20px 0;
      color: var(--vscode-descriptionForeground);
    }

    .agents-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }

    .agent-card {
      padding: 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-input-background);
      transition: all 0.2s;
    }

    .agent-card.disabled {
      opacity: 0.6;
    }

    .agent-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .agent-info h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .agent-provider {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .agent-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 20px;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-switch .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 10px;
      transition: 0.3s;
    }

    .toggle-switch .toggle-slider:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 2px;
      bottom: 2px;
      background-color: var(--vscode-foreground);
      border-radius: 50%;
      transition: 0.3s;
    }

    .toggle-switch input:checked + .toggle-slider {
      background-color: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
    }

    .toggle-switch input:checked + .toggle-slider:before {
      transform: translateX(18px);
      background-color: var(--vscode-button-foreground);
    }

    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-radius: 4px;
      font-size: 12px;
      transition: background-color 0.2s;
    }

    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .icon-btn.danger:hover {
      background: var(--vscode-errorForeground);
      color: white;
    }

    .agent-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-indicator.active {
      background: var(--vscode-terminal-ansiGreen);
    }

    .status-indicator.inactive {
      background: var(--vscode-descriptionForeground);
    }

    .status-text {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .setting-item {
      margin-bottom: 20px;
    }

    .setting-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      color: var(--vscode-foreground);
      margin-bottom: 4px;
      cursor: pointer;
    }

    .setting-input {
      width: 100px;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 14px;
    }

    .setting-description {
      margin: 4px 0 0 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .settings-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .footer-actions {
      display: flex;
      gap: 8px;
    }

    .primary-btn, .secondary-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .primary-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .primary-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .secondary-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border);
    }

    .secondary-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    /* Modal Styles */
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
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .modal-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .modal-body {
      padding: 20px;
      overflow-y: auto;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
      font-weight: 500;
      color: var(--vscode-foreground);
    }

    .form-group input,
    .form-group select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 14px;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid var(--vscode-panel-border);
    }
  `]
})
export class SettingsComponent {
  closeSettings = output<void>();
  
  public agents = signal<AgentConfig[]>([]);
  public showAgentForm = signal(false);
  public editingAgent = signal<AgentConfig | null>(null);
  
  public autoSave = signal(true);
  public enableNotifications = signal(true);
  public requestTimeout = signal(60);
  public maxHistory = signal(100);

  public agentForm = {
    name: '',
    provider: 'openai',
    model: '',
    apiKey: ''
  };

  constructor() {
    // Load mock data for demo
    this.loadSettings();
  }

  private loadSettings() {
    // Mock data - in real implementation, load from VS Code settings
    this.agents.set([
      {
        id: '1',
        name: 'GPT-4',
        provider: 'OpenAI',
        model: 'gpt-4',
        apiKey: '***hidden***',
        enabled: true
      }
    ]);
  }

  public addNewAgent() {
    this.editingAgent.set(null);
    this.agentForm = {
      name: '',
      provider: 'openai',
      model: '',
      apiKey: ''
    };
    this.showAgentForm.set(true);
  }

  public editAgent(agent: AgentConfig) {
    this.editingAgent.set(agent);
    this.agentForm = {
      name: agent.name,
      provider: agent.provider.toLowerCase(),
      model: agent.model,
      apiKey: agent.apiKey
    };
    this.showAgentForm.set(true);
  }

  public deleteAgent(agentId: string) {
    const agents = this.agents();
    this.agents.set(agents.filter(a => a.id !== agentId));
  }

  public closeAgentForm() {
    this.showAgentForm.set(false);
    this.editingAgent.set(null);
  }

  public saveAgent() {
    const editing = this.editingAgent();
    const agents = this.agents();
    
    if (editing) {
      // Update existing agent
      const index = agents.findIndex(a => a.id === editing.id);
      if (index >= 0) {
        agents[index] = {
          ...editing,
          name: this.agentForm.name,
          provider: this.agentForm.provider,
          model: this.agentForm.model,
          apiKey: this.agentForm.apiKey
        };
      }
    } else {
      // Add new agent
      const newAgent: AgentConfig = {
        id: Date.now().toString(),
        name: this.agentForm.name,
        provider: this.agentForm.provider,
        model: this.agentForm.model,
        apiKey: this.agentForm.apiKey,
        enabled: true
      };
      agents.push(newAgent);
    }
    
    this.agents.set([...agents]);
    this.closeAgentForm();
  }

  public resetToDefaults() {
    this.autoSave.set(true);
    this.enableNotifications.set(true);
    this.requestTimeout.set(60);
    this.maxHistory.set(100);
  }

  public onCloseSettings() {
    this.closeSettings.emit();
  }

  public saveSettings() {
    // In real implementation, save to VS Code settings
    console.log('Saving settings...');
    this.closeSettings.emit();
  }
}