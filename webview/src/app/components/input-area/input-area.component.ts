import { Component, Input, Output, EventEmitter, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContextItem, PhaseAlert } from '../../models/session.model';

@Component({
  selector: 'app-input-area',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="input-area">
      @if (phaseAlert) {
        <div class="phase-alert" [class]="phaseAlert.type">
          <span class="phase-alert-message">{{ phaseAlert.message }}</span>
          <div class="phase-alert-actions">
            <button class="phase-alert-btn" (click)="phaseAlert.actionButton.action()">
              {{ phaseAlert.actionButton.text }}
            </button>
          </div>
        </div>
      }
      
      <div class="input-container">
        <textarea 
          #messageInput
          class="input-text" 
          placeholder="Type your message here..."
          [value]="currentMessage()"
          (input)="onInputChange($event)"
          (keydown)="onInputKeyDown($event)"
          [style.height.px]="textareaHeight()">
        </textarea>
        <button 
          class="input-send-btn" 
          (click)="sendMessage()"
          [disabled]="!currentMessage().trim() || isLoading">
          Send
        </button>
      </div>
      
      <div class="toolbar">
        <div class="toolbar-section" style="position: relative;">
          <button 
            class="toolbar-btn context-btn" 
            (click)="toggleContextMenu()"
            [class.active]="showContextMenu()">
            <span class="toolbar-icon">#</span>
            <span class="toolbar-label">Add Context</span>
          </button>
          
          @if (showContextMenu()) {
            <div class="context-menu" (click)="$event.stopPropagation()">
              <button class="context-menu-item" (click)="addContext('file')">
                <span class="context-icon">📄</span>
                <span>File</span>
              </button>
              <button class="context-menu-item" (click)="addContext('selection')">
                <span class="context-icon">📝</span>
                <span>Selection</span>
              </button>
              <button class="context-menu-item" (click)="addContext('image')">
                <span class="context-icon">🖼️</span>
                <span>Image</span>
              </button>
              <button class="context-menu-item" (click)="addContext('workspace')">
                <span class="context-icon">📁</span>
                <span>Workspace</span>
              </button>
            </div>
          }
        </div>
        
        <div class="toolbar-section">
          <select 
            class="toolbar-select agent-select" 
            [value]="selectedAgent()"
            (change)="onAgentChange($event)">
            <option value="">Select Agent</option>
            @for (agent of availableAgents; track agent.id) {
              <option [value]="agent.id">{{ agent.name }}</option>
            }
          </select>
        </div>
        
        <div class="toolbar-section">
          <button 
            class="toolbar-btn comrade-btn" 
            (click)="showComradeMenu()"
            [class.active]="showSettingsMenu()">
            <span class="toolbar-icon">⚙️</span>
            <span class="toolbar-label">Comrade</span>
          </button>
        </div>
      </div>
      
      @if (contextItems().length > 0) {
        <div class="context-items">
          @for (item of contextItems(); track $index) {
            <div class="context-item" [class]="item.type">
              <span class="context-item-icon">{{ getContextIcon(item.type) }}</span>
              <span class="context-item-label">{{ getContextLabel(item) }}</span>
              <button class="context-item-remove" (click)="removeContextItem($index)">×</button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .input-area {
      border-top: 1px solid var(--border-color);
      background-color: var(--secondary-background);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .phase-alert {
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .phase-alert.info {
      background-color: var(--vscode-editorInfo-background);
      color: var(--vscode-editorInfo-foreground);
      border: 1px solid var(--vscode-editorInfo-border);
    }

    .phase-alert.warning {
      background-color: var(--vscode-editorWarning-background);
      color: var(--vscode-editorWarning-foreground);
      border: 1px solid var(--vscode-editorWarning-border);
    }

    .phase-alert.success {
      background-color: var(--success-color);
      color: var(--background-color);
    }

    .phase-alert.error {
      background-color: var(--vscode-editorError-background);
      color: var(--vscode-editorError-foreground);
      border: 1px solid var(--vscode-editorError-border);
    }

    .phase-alert-actions {
      display: flex;
      gap: 8px;
    }

    .phase-alert-btn {
      padding: 4px 8px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: inherit;
      cursor: pointer;
      border-radius: 2px;
      font-size: 11px;
      transition: background-color 0.2s;
    }

    .phase-alert-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .input-container {
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .input-text {
      width: 100%;
      min-height: 60px;
      max-height: 200px;
      padding: 12px 50px 12px 12px;
      border: 1px solid var(--input-border);
      background-color: var(--input-background);
      color: var(--text-color);
      font-family: inherit;
      font-size: inherit;
      resize: none;
      border-radius: 6px;
      line-height: 1.4;
      transition: border-color 0.2s;
    }

    .input-text:focus {
      outline: none;
      border-color: var(--focus-border);
    }

    .input-send-btn {
      position: absolute;
      right: 8px;
      top: 8px;
      padding: 8px 12px;
      border: none;
      background: var(--primary-color);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .input-send-btn:hover:not(:disabled) {
      background: var(--primary-hover-color);
      transform: translateY(-1px);
    }

    .input-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 0;
      flex-wrap: wrap;
    }

    .toolbar-section {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toolbar-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      background: var(--input-background);
      color: var(--text-color);
      cursor: pointer;
      border-radius: 4px;
      font-size: 12px;
      transition: all 0.2s;
      position: relative;
    }

    .toolbar-btn:hover {
      background: var(--primary-hover-color);
      border-color: var(--primary-color);
    }

    .toolbar-btn.active {
      background: var(--primary-color);
      color: var(--vscode-button-foreground);
      border-color: var(--primary-color);
    }

    .toolbar-icon {
      font-size: 14px;
    }

    .toolbar-label {
      font-weight: 500;
    }

    .toolbar-select {
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      background: var(--input-background);
      color: var(--text-color);
      border-radius: 4px;
      font-size: 12px;
      min-width: 140px;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .toolbar-select:focus {
      outline: none;
      border-color: var(--focus-border);
    }

    .context-menu {
      position: absolute;
      bottom: 100%;
      left: 0;
      background: var(--vscode-menu-background);
      border: 1px solid var(--vscode-menu-border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      min-width: 160px;
      margin-bottom: 4px;
      animation: contextMenuSlide 0.2s ease-out;
    }

    @keyframes contextMenuSlide {
      from { transform: translateY(10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .context-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      border: none;
      background: transparent;
      color: var(--vscode-menu-foreground);
      width: 100%;
      text-align: left;
      transition: background-color 0.2s;
    }

    .context-menu-item:first-child {
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
    }

    .context-menu-item:last-child {
      border-bottom-left-radius: 6px;
      border-bottom-right-radius: 6px;
    }

    .context-menu-item:hover {
      background: var(--vscode-menu-selectionBackground);
      color: var(--vscode-menu-selectionForeground);
    }

    .context-icon {
      font-size: 14px;
    }

    .context-items {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 0 0 0;
    }

    .context-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 12px;
      font-size: 11px;
      animation: fadeIn 0.3s ease-out;
    }

    .context-item-icon {
      font-size: 12px;
    }

    .context-item-label {
      font-weight: 500;
    }

    .context-item-remove {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 0;
      margin-left: 2px;
      font-size: 14px;
      line-height: 1;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .context-item-remove:hover {
      opacity: 1;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
  `]
})
export class InputAreaComponent implements AfterViewInit {
  @Input() phaseAlert: PhaseAlert | null = null;
  @Input() isLoading: boolean = false;
  @Input() availableAgents: any[] = [];
  
  @Output() messageSubmit = new EventEmitter<{ message: string; contextItems: ContextItem[] }>();
  @Output() agentChange = new EventEmitter<string>();
  @Output() contextAdd = new EventEmitter<{ type: string; content?: string }>();
  @Output() settingsOpen = new EventEmitter<void>();
  
  @ViewChild('messageInput', { static: true }) messageInput!: ElementRef<HTMLTextAreaElement>;
  
  public currentMessage = signal('');
  public selectedAgent = signal('');
  public showContextMenu = signal(false);
  public showSettingsMenu = signal(false);
  public contextItems = signal<ContextItem[]>([]);
  public textareaHeight = signal(60);
  
  ngAfterViewInit() {
    this.setupClickOutsideHandler();
  }
  
  private setupClickOutsideHandler() {
    document.addEventListener('click', (event) => {
      if (!event.target || !(event.target as Element).closest('.toolbar-section')) {
        this.showContextMenu.set(false);
        this.showSettingsMenu.set(false);
      }
    });
  }
  
  public onInputChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.currentMessage.set(target.value);
    this.adjustTextareaHeight();
  }
  
  public onInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
  
  private adjustTextareaHeight() {
    if (this.messageInput) {
      const textarea = this.messageInput.nativeElement;
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 200);
      this.textareaHeight.set(newHeight);
    }
  }
  
  public sendMessage() {
    const message = this.currentMessage().trim();
    if (message && !this.isLoading) {
      this.messageSubmit.emit({
        message,
        contextItems: this.contextItems()
      });
      this.currentMessage.set('');
      this.contextItems.set([]);
      this.textareaHeight.set(60);
      
      // Reset textarea height
      if (this.messageInput) {
        this.messageInput.nativeElement.style.height = '60px';
      }
    }
  }
  
  public toggleContextMenu() {
    this.showContextMenu.update(show => !show);
    this.showSettingsMenu.set(false);
  }
  
  public addContext(type: string) {
    this.contextAdd.emit({ type });
    this.showContextMenu.set(false);
    
    // Add a mock context item for demo
    const contextItems = this.contextItems();
    contextItems.push({
      type: type as any,
      content: `Mock ${type} content`,
      metadata: { timestamp: new Date().toISOString() }
    });
    this.contextItems.set([...contextItems]);
  }
  
  public removeContextItem(index: number) {
    const items = this.contextItems();
    items.splice(index, 1);
    this.contextItems.set([...items]);
  }
  
  public onAgentChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const agentId = target.value;
    this.selectedAgent.set(agentId);
    this.agentChange.emit(agentId);
  }
  
  public showComradeMenu() {
    this.settingsOpen.emit();
  }
  
  public getContextIcon(type: string): string {
    const icons: Record<string, string> = {
      file: '📄',
      selection: '📝',
      image: '🖼️',
      workspace: '📁'
    };
    return icons[type] || '📎';
  }
  
  public getContextLabel(item: ContextItem): string {
    switch (item.type) {
      case 'file':
        return item.metadata?.['filename'] || 'File';
      case 'selection':
        return 'Selection';
      case 'image':
        return item.metadata?.['filename'] || 'Image';
      case 'workspace':
        return 'Workspace';
      default:
        return 'Context';
    }
  }
}