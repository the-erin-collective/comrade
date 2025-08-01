import { Component, Input, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewChecked, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { ChatMessage, ConversationSession } from '../../models/session.model';

@Component({
  selector: 'app-chat-output',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-output" #chatContainer>
      @if (session && session.messages && session.messages.length > 0) {
        @for (message of session.messages; track message.id) {
          <div class="chat-message" [class]="message.sender">
            <div class="chat-message-header">
              <span class="sender-name">{{ getSenderName(message) }}</span>
              <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
              @if (message.agentId) {
                <span class="agent-id">{{ message.agentId }}</span>
              }
            </div>
            <div class="chat-message-content" [innerHTML]="renderMarkdown(message.content)"></div>
          </div>
        }
      } @else {
        <div class="welcome-message">
          <div class="chat-message-content">
            <h3>Welcome to your new session!</h3>
            <p>Start by typing a message below to begin your conversation with the AI assistant.</p>
          </div>
        </div>
      }
      
      @if (isLoading) {
        <div class="loading-message">
          <div class="chat-message agent">
            <div class="chat-message-header">
              <span class="sender-name">Agent</span>
              <span class="timestamp">{{ getCurrentTime() }}</span>
            </div>
            <div class="chat-message-content">
              <div class="loading-indicator">
                <div class="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span class="loading-text">{{ loadingMessage }}</span>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .chat-output {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
    }

    .chat-message {
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .chat-message-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .sender-name {
      font-weight: 600;
    }

    .timestamp {
      opacity: 0.7;
    }

    .agent-id {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
    }

    .chat-message-content {
      padding: 12px 16px;
      border-radius: 8px;
      line-height: 1.5;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .chat-message.user .chat-message-content {
      background-color: var(--primary-color);
      color: var(--vscode-button-foreground);
      margin-left: 20px;
      border-bottom-right-radius: 4px;
    }

    .chat-message.agent .chat-message-content {
      background-color: var(--input-background);
      border: 1px solid var(--border-color);
      margin-right: 20px;
      border-bottom-left-radius: 4px;
    }

    .welcome-message {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 200px;
      text-align: center;
    }

    .welcome-message .chat-message-content {
      background: transparent;
      border: 2px dashed var(--border-color);
      margin: 0;
      max-width: 400px;
    }

    .welcome-message h3 {
      margin: 0 0 12px 0;
      color: var(--text-color);
      font-size: 16px;
    }

    .welcome-message p {
      margin: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }

    .loading-message {
      animation: fadeIn 0.3s ease-in;
    }

    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .loading-dots {
      display: flex;
      gap: 4px;
    }

    .loading-dots span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--primary-color);
      animation: pulse 1.4s ease-in-out infinite both;
    }

    .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
    .loading-dots span:nth-child(2) { animation-delay: -0.16s; }
    .loading-dots span:nth-child(3) { animation-delay: 0s; }

    @keyframes pulse {
      0%, 80%, 100% {
        transform: scale(0);
        opacity: 0.5;
      }
      40% {
        transform: scale(1);
        opacity: 1;
      }
    }

    .loading-text {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    /* Markdown content styling */
    .chat-message-content :global(h1),
    .chat-message-content :global(h2),
    .chat-message-content :global(h3),
    .chat-message-content :global(h4),
    .chat-message-content :global(h5),
    .chat-message-content :global(h6) {
      margin: 16px 0 8px 0;
      font-weight: 600;
    }

    .chat-message-content :global(h1) { font-size: 1.5em; }
    .chat-message-content :global(h2) { font-size: 1.3em; }
    .chat-message-content :global(h3) { font-size: 1.1em; }

    .chat-message-content :global(p) {
      margin: 8px 0;
    }

    .chat-message-content :global(ul),
    .chat-message-content :global(ol) {
      margin: 8px 0;
      padding-left: 20px;
    }

    .chat-message-content :global(li) {
      margin: 4px 0;
    }

    .chat-message-content :global(code) {
      background: var(--vscode-textCodeBlock-background);
      color: var(--vscode-textPreformat-foreground);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .chat-message-content :global(pre) {
      background: var(--vscode-textCodeBlock-background);
      color: var(--vscode-textPreformat-foreground);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 12px 0;
      border: 1px solid var(--border-color);
    }

    .chat-message-content :global(pre code) {
      background: transparent;
      padding: 0;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .chat-message-content :global(blockquote) {
      border-left: 4px solid var(--primary-color);
      margin: 12px 0;
      padding: 8px 16px;
      background: var(--vscode-textBlockQuote-background);
      font-style: italic;
    }

    .chat-message-content :global(table) {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
    }

    .chat-message-content :global(th),
    .chat-message-content :global(td) {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
    }

    .chat-message-content :global(th) {
      background: var(--vscode-keybindingTable-headerBackground);
      font-weight: 600;
    }

    .chat-message-content :global(a) {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }

    .chat-message-content :global(a:hover) {
      color: var(--vscode-textLink-activeForeground);
      text-decoration: underline;
    }
  `]
})
export class ChatOutputComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() session: ConversationSession | null = null;
  @Input() isLoading: boolean = false;
  @Input() loadingMessage: string = 'Thinking...';
  
  @ViewChild('chatContainer', { static: true }) chatContainer!: ElementRef<HTMLDivElement>;
  
  private shouldScrollToBottom = true;
  private lastMessageCount = 0;
  
  ngOnInit() {
    this.setupMarkdown();
  }
  
  ngOnDestroy() {
    // Cleanup if needed
  }
  
  ngAfterViewChecked() {
    this.scrollToBottomIfNeeded();
  }
  
  private setupMarkdown() {
    // Configure marked with highlight.js - using a simpler approach
    marked.use({
      breaks: true,
      gfm: true
    });
  }
  
  public renderMarkdown(content: string): string {
    try {
      let html = marked.parse(content) as string;
      
      // Apply syntax highlighting to code blocks
      html = html.replace(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g, (match, lang, code) => {
        if (hljs.getLanguage(lang)) {
          try {
            const highlighted = hljs.highlight(code, { language: lang }).value;
            return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
          } catch (err) {
            console.warn('Syntax highlighting failed:', err);
          }
        }
        return match;
      });
      
      // Apply auto-highlighting to code blocks without language
      html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
        try {
          const highlighted = hljs.highlightAuto(code).value;
          return `<pre><code class="hljs">${highlighted}</code></pre>`;
        } catch (err) {
          return match;
        }
      });
      
      return html;
    } catch (error) {
      console.error('Markdown parsing failed:', error);
      return this.escapeHtml(content);
    }
  }
  
  public getSenderName(message: ChatMessage): string {
    if (message.sender === 'user') {
      return 'You';
    } else {
      return message.agentId ? `Agent (${message.agentId})` : 'Agent';
    }
  }
  
  public formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
  
  public getCurrentTime(): string {
    return new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
  
  private scrollToBottomIfNeeded() {
    const currentMessageCount = this.session?.messages?.length || 0;
    
    if (currentMessageCount > this.lastMessageCount) {
      this.shouldScrollToBottom = true;
      this.lastMessageCount = currentMessageCount;
    }
    
    if (this.shouldScrollToBottom && this.chatContainer) {
      const container = this.chatContainer.nativeElement;
      const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
      
      if (isNearBottom || currentMessageCount === 1) {
        container.scrollTop = container.scrollHeight;
      }
      
      this.shouldScrollToBottom = false;
    }
  }
  
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  public scrollToBottom() {
    if (this.chatContainer) {
      const container = this.chatContainer.nativeElement;
      container.scrollTop = container.scrollHeight;
    }
  }
}