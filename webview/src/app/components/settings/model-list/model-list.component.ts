import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelConfig } from '../../../interfaces/model-config.interface';
import { ModelManagerService } from '../../../services/model-manager.service';
import { ModelConfigComponent } from '../model-config/model-config.component';

@Component({
  selector: 'model-list',
  standalone: true,
  imports: [CommonModule, ModelConfigComponent],
  template: `
    <div class="model-list">
      <div class="model-list-header">
        <h3>AI Models</h3>
        <button class="btn btn-primary" (click)="addNewModel()">
          Add Model
        </button>
      </div>

      <div class="model-grid">
        <div 
          *ngFor="let model of models()" 
          class="model-card"
          [class.active]="model.id === activeModelId()"
          (click)="selectModel(model.id)"
        >
          <div class="model-card-header">
            <span class="model-name">{{ model.name || 'Unnamed Model' }}</span>
            <span class="model-provider">{{ model.provider }}</span>
          </div>
          <div class="model-details">
            <span class="model-id">{{ model.id }}</span>
            <span class="model-status" [class.online]="isModelOnline(model.id)">
              {{ isModelOnline(model.id) ? 'Online' : 'Offline' }}
            </span>
          </div>
          <div class="model-actions">
            <button 
              class="btn btn-icon" 
              (click)="editModel(model.id); $event.stopPropagation()"
              title="Edit Model"
            >
              <i class="icon-edit"></i>
            </button>
            <button 
              class="btn btn-icon" 
              (click)="deleteModel(model.id); $event.stopPropagation()"
              title="Delete Model"
            >
              <i class="icon-delete"></i>
            </button>
          </div>
        </div>
      </div>

      <div *ngIf="selectedModelId()" class="model-detail-panel">
        <app-model-config 
          [modelId]="selectedModelId()!" 
          [modelConfig]="getSelectedModelConfig()"
        ></app-model-config>
      </div>
    </div>
  `,
  styles: [`
    .model-list {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    
    .model-list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    
    .model-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .model-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .model-card:hover {
      border-color: var(--primary-color);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .model-card.active {
      border-color: var(--primary-color);
      background-color: rgba(var(--primary-rgb), 0.05);
    }
    
    .model-card-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    
    .model-name {
      font-weight: 500;
    }
    
    .model-provider {
      font-size: 0.8rem;
      background: var(--tag-bg);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      text-transform: capitalize;
    }
    
    .model-details {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
    }
    
    .model-status {
      &.online {
        color: var(--success-color);
      }
      
      &:not(.online) {
        color: var(--error-color);
      }
    }
    
    .model-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    
    .model-detail-panel {
      margin-top: 1.5rem;
      border-top: 1px solid var(--border-color);
      padding-top: 1.5rem;
    }
  `]
})
export class ModelListComponent implements OnInit {
  models = signal<Array<ModelConfig & { id: string }>>([]);
  selectedModelId = signal<string | null>(null);
  activeModelId = signal<string | null>(null);
  
  constructor(private modelManager: ModelManagerService) {}
  
  async ngOnInit() {
    await this.loadModels();
    
    // Subscribe to model changes
    this.modelManager.onModelsChanged(() => {
      this.loadModels();
    });
    
    // Get active model
    const activeModel = await this.modelManager.getActiveModel();
    if (activeModel) {
      this.activeModelId.set(activeModel.id);
      this.selectedModelId.set(activeModel.id);
    }
  }
  
  private async loadModels() {
    const modelConfigs = await this.modelManager.getAvailableModels();
    this.models.set(modelConfigs);
    
    // If no model is selected but we have models, select the first one
    if (!this.selectedModelId() && modelConfigs.length > 0) {
      this.selectedModelId.set(modelConfigs[0].id);
    }
  }
  
  selectModel(modelId: string) {
    this.selectedModelId.set(modelId);
  }
  
  async addNewModel() {
    const newModelId = `model-${Date.now()}`;
    const defaultConfig: ModelConfig = {
      name: 'Llama 3',
      provider: 'ollama',
      model: 'llama3',
      endpoint: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 2048
    };
    
    await this.modelManager.addModel(newModelId, defaultConfig);
    this.selectedModelId.set(newModelId);
  }
  
  editModel(modelId: string) {
    this.selectedModelId.set(modelId);
    // The ModelConfigComponent will handle the edit UI
  }
  
  async deleteModel(modelId: string) {
    if (confirm('Are you sure you want to delete this model configuration?')) {
      await this.modelManager.removeModel(modelId);
      if (this.selectedModelId() === modelId) {
        this.selectedModelId.set(this.models()[0]?.id || null);
      }
    }
  }
  
  isModelOnline(modelId: string): boolean {
    // This would be implemented to check model status
    // For now, we'll assume all models are online
    return true;
  }
  
  getSelectedModelConfig(): ModelConfig | null {
    if (!this.selectedModelId()) return null;
    return this.models().find(m => m.id === this.selectedModelId()) || null;
  }
}
