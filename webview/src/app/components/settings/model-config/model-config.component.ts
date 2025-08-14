import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModelConfig } from '../../../interfaces/model-config.interface';
import { ModelManagerService } from '../../../services/model-manager.service';

@Component({
  selector: 'app-model-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="model-config">
      <div class="form-group">
        <label for="modelProvider">Provider</label>
        <select id="modelProvider" [(ngModel)]="editableConfig.provider" (change)="onProviderChange()">
          <option value="ollama">Ollama</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="huggingface">Hugging Face</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div class="form-group">
        <label for="modelName">Model</label>
        <input 
          type="text" 
          id="modelName" 
          [(ngModel)]="editableConfig.model" 
          placeholder="e.g., llama3, gpt-4, claude-2"
        >
      </div>

      <div class="form-group">
        <label for="endpoint">Endpoint</label>
        <input 
          type="text" 
          id="endpoint" 
          [(ngModel)]="editableConfig.endpoint" 
          [placeholder]="getDefaultEndpoint()"
        >
      </div>

      <div class="form-group" *ngIf="editableConfig.provider !== 'ollama'">
        <label for="apiKey">API Key</label>
        <input 
          type="password" 
          id="apiKey" 
          [(ngModel)]="editableConfig.apiKey" 
          placeholder="Enter your API key"
        >
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="temperature">Temperature</label>
          <input 
            type="range" 
            id="temperature" 
            [(ngModel)]="editableConfig.temperature" 
            min="0" 
            max="2" 
            step="0.1"
          >
          <span class="value">{{ editableConfig.temperature || 0.7 }}</span>
        </div>

        <div class="form-group">
          <label for="maxTokens">Max Tokens</label>
          <input 
            type="number" 
            id="maxTokens" 
            [(ngModel)]="editableConfig.maxTokens" 
            min="1" 
            [max]="getMaxTokens()"
          >
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" (click)="saveConfig()">Save</button>
        <button class="btn btn-secondary" (click)="cancelEdit()">Cancel</button>
      </div>
    </div>
  `,
  styles: [`
    .model-config {
      padding: 1rem;
      max-width: 600px;
      margin: 0 auto;
    }
    
    .form-group {
      margin-bottom: 1rem;
    }
    
    .form-row {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .form-row .form-group {
      flex: 1;
    }
    
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1.5rem;
    }
    
    input[type="range"] {
      width: 100%;
    }
    
    .value {
      display: inline-block;
      min-width: 2.5rem;
      text-align: right;
    }
  `]
})
export class ModelConfigComponent implements OnChanges {
  @Input() modelConfig: ModelConfig | null = null;
  @Input() modelId: string = '';
  
  editableConfig: ModelConfig = this.getDefaultConfig();
  isEditing = signal(false);

  constructor(private modelManager: ModelManagerService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['modelConfig'] && this.modelConfig) {
      this.editableConfig = { ...this.modelConfig };
    }
  }

  onProviderChange(): void {
    // Update endpoint to default when provider changes
    this.editableConfig.endpoint = this.getDefaultEndpoint();
  }

  getDefaultEndpoint(): string {
    switch (this.editableConfig.provider) {
      case 'ollama': return 'http://localhost:11434';
      case 'openai': return 'https://api.openai.com/v1';
      case 'anthropic': return 'https://api.anthropic.com/v1';
      case 'huggingface': return 'https://api-inference.huggingface.co/models';
      default: return '';
    }
  }

  getMaxTokens(): number {
    // Default maximum tokens based on common model limits
    return 8192;
  }

  getDefaultConfig(): ModelConfig {
    return {
      name: 'Llama 3',
      provider: 'ollama',
      model: 'llama3',
      endpoint: this.getDefaultEndpoint(),
      temperature: 0.7,
      maxTokens: 2048
    };
  }

  saveConfig(): void {
    if (!this.editableConfig) return;
    
    // Validate required fields
    if (!this.editableConfig.provider || !this.editableConfig.model) {
      // Show error to user
      return;
    }

    // Save the configuration
    this.modelManager.updateModelConfig(this.modelId, this.editableConfig);
    this.isEditing.set(false);
  }

  cancelEdit(): void {
    if (this.modelConfig) {
      this.editableConfig = { ...this.modelConfig };
    } else {
      this.editableConfig = this.getDefaultConfig();
    }
    this.isEditing.set(false);
  }
}
