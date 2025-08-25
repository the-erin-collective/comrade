import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy, 
  ChangeDetectorRef, 
  ViewChild, 
  ElementRef, 
  HostListener,
  AfterViewChecked,
  OnChanges,
  SimpleChanges,
  Pipe,
  PipeTransform,
  ChangeDetectionStrategy,
  SecurityContext
} from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatMessage, MessageType, ToolResult } from '../../models/chat-message.model';
import { ConversationSession } from '../../models/conversation-session.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import bash from 'highlight.js/lib/languages/bash';
import 'highlight.js/styles/github.css';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('bash', bash);

// Configure marked with proper type extensions
declare module 'marked' {
  interface MarkedOptions {
    highlight?: (code: string, lang: string) => string;
    gfm?: boolean;
    breaks?: boolean;
    smartLists?: boolean;
    smartypants?: boolean;
    langPrefix?: string;
    headerIds?: boolean;
    mangle?: boolean;
  }
}

// Configure marked options
marked.setOptions({
  highlight: (code: string, lang: string): string => {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
  gfm: true,
  breaks: true,
  smartLists: true,
  smartypants: true
});

declare const vscode: any; // VS Code API

// Marked options interface
interface MarkedOptions {
  renderer: any;
  highlight?: (code: string, lang: string) => string;
  gfm?: boolean;
  breaks?: boolean;
  smartLists?: boolean;
  smartypants?: boolean;
  langPrefix?: string;
  headerIds?: boolean;
  mangle?: boolean;
}

// Create a local interface that extends the original ChatMessage
export interface ExtendedChatMessage extends ChatMessage {
  isStreaming?: boolean;
  isComplete?: boolean;
  error?: string;
  updateContent?(content: string): void;
  complete?(): void;
  fail?(error: string): void;
  renderMarkdown?(content: string): SafeHtml;
}

// JSON pipe for rendering objects
@Pipe({ name: 'json', standalone: true })
export class JsonPipe implements PipeTransform {
  transform(value: any): string {
    return JSON.stringify(value, null, 2);
  }
}

// Simple timestamp pipe
@Pipe({ name: 'timestamp', standalone: true })
export class TimestampPipe implements PipeTransform {
  transform(timestamp: Date | string | number | null | undefined): string {
    if (!timestamp) {
      return '';
    }
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

// Safe HTML pipe for rendering markdown content
@Pipe({ name: 'safeHtml', standalone: true })
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}

@Component({
  selector: 'app-chat-output',
  templateUrl: './chat-output.component.html',
  styleUrls: ['./chat-output.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    JsonPipe,
    TimestampPipe,
    SafeHtmlPipe
  ]
})
export class ChatOutputComponent implements OnInit, OnDestroy, AfterViewChecked, OnChanges {
  @ViewChild('chatContainer') private chatContainer!: ElementRef<HTMLDivElement>;
  
  @Input() session: {
    messages: ExtendedChatMessage[];
    messages$?: Observable<ExtendedChatMessage>;
  } | null = null;
  
  @Input() isLoading = false;
  @Input() loadingMessage = 'Thinking...';
  
  private previousLoadingState = false;
  
  protected messages: ExtendedChatMessage[] = [];
  private streamingMessages = new Map<string, ExtendedChatMessage>();
  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = true;
  private lastMessageCount = 0;
  private messageSubscription?: Subscription;
  private isUserScrolling = false;

  // Message type constants
  readonly MessageType = {
    User: 'user',
    Assistant: 'assistant',
    System: 'system',
    Tool: 'tool'
  } as const;

  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setupMarkdown();
    this.loadSessionMessages();
    
    // Set up scroll event listener after view init
    setTimeout(() => {
      this.setupScrollListener();
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Detect when session input changes and reload messages
    if (changes['session'] && changes['session'].currentValue) {
      console.log('ChatOutput: Session input changed, reloading messages');
      this.loadSessionMessages();
      this.cdr.detectChanges();
    }
  }

  private loadSessionMessages(): void {
    // Load messages from session if available
    if (this.session?.messages) {
      console.log('ChatOutput: Loading', this.session.messages.length, 'messages from session');
      this.messages = [...this.session.messages];
      this.lastMessageCount = this.messages.length;
    }
    
    // Set up message subscription if session has messages observable
    if (this.session?.messages$) {
      // Clean up existing subscription
      if (this.messageSubscription) {
        this.messageSubscription.unsubscribe();
      }
      
      this.messageSubscription = this.session.messages$.subscribe(
        (message: ExtendedChatMessage) => {
          this.handleNewMessage(message);
        }
      );
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.messageSubscription) {
      this.messageSubscription.unsubscribe();
    }
  }

  ngAfterViewChecked(): void {
    // Check if we have new messages and should auto-scroll
    const currentMessageCount = this.messages.length;
    if (currentMessageCount > this.lastMessageCount) {
      this.lastMessageCount = currentMessageCount;
      // Only auto-scroll if user was already at the bottom
      if (this.shouldScrollToBottom && !this.isUserScrolling) {
        this.scrollToBottom();
      }
    }
    
    // Check if loading state changed
    if (this.isLoading !== this.previousLoadingState) {
      this.previousLoadingState = this.isLoading;
      // Auto-scroll when loading starts or ends (if user is at bottom)
      if (this.shouldScrollToBottom && !this.isUserScrolling) {
        setTimeout(() => this.scrollToBottom(), 50);
      }
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.scrollToBottom(true);
  }

  // Render markdown to HTML
  async renderMarkdown(content: string): Promise<SafeHtml> {
    try {
      // Convert markdown to HTML and sanitize it
      const html = await marked.parse(content);
      return this.sanitizer.bypassSecurityTrustHtml(html as string);
    } catch (e) {
      console.error('Error rendering markdown:', e);
      return this.sanitizer.bypassSecurityTrustHtml(content);
    }
  }

  // Create a streaming message with proper typing
  createStreamingMessage(sender: MessageType, content: string): ExtendedChatMessage {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newMessage: ExtendedChatMessage = {
      id: messageId,
      content,
      sender: sender as any, // Cast to any to match the expected type
      timestamp: new Date(),
      type: sender,
      isStreaming: true,
      isComplete: false,
      updateContent: (newContent: string) => {
        const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          this.messages[messageIndex].content = newContent;
          this.cdr.detectChanges();
        }
      },
      complete: () => {
        const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          this.messages[messageIndex].isStreaming = false;
          this.messages[messageIndex].isComplete = true;
          this.cdr.detectChanges();
        }
      },
      fail: (error: string) => {
        const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          this.messages[messageIndex].isStreaming = false;
          this.messages[messageIndex].isComplete = true;
          this.messages[messageIndex].error = error;
          this.cdr.detectChanges();
        }
      },
      renderMarkdown: (content: string) => this.renderMarkdown(content)
    };
    
    // Add the new message to the messages array
    this.messages = [...this.messages, newMessage];
    this.scrollToBottom();
    
    return newMessage;
  }

  // Handle stream updates for a message
  handleStreamUpdate(update: { id: string; content: string; done: boolean; error?: string }): void {
    let message = this.messages.find(m => m.id === update.id);
    
    // If message doesn't exist and this is the first chunk, create it
    if (!message && update.id) {
      message = this.createStreamingMessage('assistant', '');
      message.id = update.id; // Use the provided ID
      this.messages.push(message);
      this.scrollToBottom();
    }
    
    if (message) {
      // Update content if provided
      if (update.content !== undefined) {
        // If this is an append operation (default)
        if (update.content) {
          message.content = message.content + update.content;
        }
        
        // Update streaming state
        message.isStreaming = !update.done && !update.error;
        message.isComplete = update.done && !update.error;
        
        // Handle errors
        if (update.error) {
          message.error = update.error;
          message.isStreaming = false;
          message.isComplete = true;
        }
        
        // Trigger change detection
        this.cdr.detectChanges();
        this.scrollToBottom();
      }
      
      // If this is the final chunk, ensure streaming is marked as complete
      if (update.done) {
        message.isStreaming = false;
        message.isComplete = true;
      }
    }
  }

  // Get display name for sender
  getSenderName(message: ExtendedChatMessage | null | undefined): string {
    if (!message) {
      return 'Unknown';
    }
    
    switch (message.sender) {
      case 'user':
        return 'You';
      case 'assistant':
        return 'Assistant';
      case 'system':
        return 'System';
      case 'tool':
        return 'Tool';
      default:
        return String(message.sender);
    }
  }

  // Get the appropriate icon for a message sender
  getSenderIcon(message: ExtendedChatMessage | null | undefined): string {
    const icons: Record<string, string> = {
      'user': '👤',
      'assistant': '🤖',
      'system': '⚙️',
      'tool': '🛠️',
      'tool-success': '✅',
      'tool-error': '❌'
    };

    if (!message?.sender) {
      return '🤖';
    }

    // Handle tool result status
    if (message.sender === 'tool') {
      if (message.toolResult) {
        return message.toolResult.success ? '✅' : '❌';
      }
      return '🛠️';
    }

    return icons[message.sender] || '🤖';
  }

  // Format timestamp for display
  formatTime(timestamp: Date | string | number | null | undefined): string {
    if (!timestamp) {
      return '';
    }
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Get current time for new messages
  getCurrentTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Get CSS classes for message based on type and status
  getMessageClasses(message: ExtendedChatMessage | null | undefined): string {
    if (!message) {
      return '';
    }
    
    const classes = ['message'];
    
    // Add type class
    classes.push(`message-${message.type || 'text'}`);
    
    // Add status classes
    if (message.isStreaming) {
      classes.push('streaming');
    }
    if (message.isComplete) {
      classes.push('complete');
    }
    if (message.error) {
      classes.push('error');
    }
    
    return classes.join(' ');
  }

  // Get CSS classes for tool status
  getToolStatusClass(message: ExtendedChatMessage | null | undefined): string {
    if (!message?.toolResult) {
      return 'tool-pending';
    }
    return message.toolResult.success ? 'tool-success' : 'tool-error';
  }

  // Get tool status text
  getToolStatus(message: ExtendedChatMessage | null | undefined): string {
    if (!message?.toolResult) {
      return 'Pending';
    }
    return message.toolResult.success ? 'Success' : 'Failed';
  }

  // Track messages by ID for ngFor
  trackByMessageId(index: number, message: ExtendedChatMessage): string {
    if (!message) {
      return `msg-${index}`;
    }
    return message.id || `msg-${index}`;
  }

  // Handle new incoming messages
  handleNewMessage(message: ExtendedChatMessage): void {
    // Check if this is an update to an existing message (streaming)
    const existingMessageIndex = this.messages.findIndex(m => m.id === message.id);
    
    if (existingMessageIndex !== -1) {
      // Update existing message
      this.messages[existingMessageIndex] = {
        ...this.messages[existingMessageIndex],
        ...message,
        // Preserve streaming state if not provided
        isStreaming: message.isStreaming ?? this.messages[existingMessageIndex].isStreaming,
        isComplete: message.isComplete ?? this.messages[existingMessageIndex].isComplete
      };
      
      // Trigger change detection
      this.messages = [...this.messages];
    } else {
      // Add new message
      this.messages = [...this.messages, message];
    }
    
    // Only auto-scroll if user is at bottom
    this.checkScrollPosition();
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
    }
  }

  // Set up scroll event listener
  private setupScrollListener(): void {
    if (!this.chatContainer?.nativeElement) {
      setTimeout(() => this.setupScrollListener(), 500);
      return;
    }

    const element = this.chatContainer.nativeElement;
    
    let scrollTimeout: any;

    element.addEventListener('scroll', () => {
      // User is actively scrolling
      this.isUserScrolling = true;
      
      // Check scroll position
      this.checkScrollPosition();
      
      // Clear previous timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      
      // Mark scrolling as finished after a delay
      scrollTimeout = setTimeout(() => {
        this.isUserScrolling = false;
      }, 150);
    });
    
    // Initial scroll to bottom
    this.scrollToBottom(true);
  }

  // Handle link clicks to open in default browser
  onLinkClick(event: Event): void {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    
    if (!anchor) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    const url = anchor.getAttribute('href');
    if (!url) {
      return;
    }
    
    // Use VS Code API to open the URL in the default browser
    const vscode = (window as any).acquireVsCodeApi?.();
    if (vscode) {
      vscode.postMessage({
        command: 'openExternal',
        url: url
      });
    } else {
      window.open(url, '_blank');
    }
  }

  // Check if a message is currently streaming
  isMessageStreaming(message: ExtendedChatMessage | null | undefined): boolean {
    if (!message) {
      return false;
    }
    return Boolean(message.isStreaming);
  }

  // Split content into chunks for streaming animation
  splitContentIntoChunks(content: string, chunkSize: number = 20): string[] {
    if (!content) {return [];}
    
    // For non-streaming content, return as a single chunk
    if (content.length <= chunkSize * 3) {
      return [content];
    }
    
    // For streaming content, split into chunks
    const chunks: string[] = [];
    let start = 0;
    
    while (start < content.length) {
      // Find the next sentence boundary or word boundary
      let end = Math.min(start + chunkSize, content.length);
      
      // Try to break at sentence boundaries first
      const sentenceEnd = content.indexOf('. ', start);
      if (sentenceEnd > start && sentenceEnd < start + chunkSize * 2) {
        end = sentenceEnd + 1; // Include the period
      } 
      // Then try word boundaries
      else {
        const spaceIndex = content.lastIndexOf(' ', end);
        if (spaceIndex > start && (spaceIndex - start) > chunkSize / 2) {
          end = spaceIndex + 1; // Include the space
        }
      }
      
      chunks.push(content.substring(start, end).trim());
      start = end;
    }
    
    return chunks;
  }

  // Check if a message is a user message
  isUserMessage(message: ExtendedChatMessage | null | undefined): boolean {
    return message?.sender === 'user';
  }

  // Scroll to the bottom of the chat
  private scrollToBottom(force = false): void {
    if ((this.shouldScrollToBottom || force) && this.chatContainer?.nativeElement) {
      try {
        const element = this.chatContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      } catch (err) {
        console.error('Error scrolling to bottom:', err);
      }
    }
  }

  // Check if we should auto-scroll to bottom
  private checkScrollPosition(): void {
    if (!this.chatContainer?.nativeElement) {
      this.shouldScrollToBottom = true; // Default to true if no container
      return;
    }
    
    const element = this.chatContainer.nativeElement;
    const threshold = 100; // pixels from bottom to consider "at bottom"
    const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + threshold;
    this.shouldScrollToBottom = isAtBottom;
  }

  private setupMarkdown(): void {
    // Configure marked options for better rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });
  }


}