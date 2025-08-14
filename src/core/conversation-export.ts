/**
 * Conversation Export Service
 * 
 * Provides functionality to export conversation history in various formats
 * including JSON, Markdown, and CSV for analysis and debugging purposes.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationContextManager, SerializableConversationContext } from './conversation-context';
import { AIMessage, AIResponse, ToolCall, AIToolResult } from './ai-agent';
import { Logger } from './logger';

// Create logger instance
const logger = new Logger({ prefix: 'ConversationExport' });

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'markdown' | 'csv' | 'html' | 'txt';

/**
 * Export options configuration
 */
export interface ExportOptions {
  /** Format to export in */
  format: ExportFormat;
  /** Include tool execution details */
  includeToolExecutions: boolean;
  /** Include metadata (timestamps, token counts, etc.) */
  includeMetadata: boolean;
  /** Include system prompts */
  includeSystemPrompts: boolean;
  /** Include conversation context statistics */
  includeStatistics: boolean;
  /** Filter messages by date range */
  dateRange?: {
    start: Date;
    end: Date;
  };
  /** Filter messages by sender */
  senderFilter?: ('user' | 'assistant' | 'system' | 'tool')[];
  /** Include only successful tool executions */
  successfulToolsOnly?: boolean;
  /** Pretty print JSON output */
  prettyPrint?: boolean;
}

/**
 * Export result information
 */
export interface ExportResult {
  /** Success status */
  success: boolean;
  /** File path where export was saved */
  filePath?: string;
  /** Export content (if not saved to file) */
  content?: string;
  /** Error message if export failed */
  error?: string;
  /** Export statistics */
  statistics: {
    messageCount: number;
    toolExecutionCount: number;
    exportSize: number;
    processingTime: number;
  };
}

/**
 * Conversation export data structure
 */
export interface ConversationExportData {
  /** Export metadata */
  metadata: {
    exportedAt: Date;
    exportFormat: ExportFormat;
    conversationId: string;
    title?: string;
    totalMessages: number;
    totalToolExecutions: number;
    dateRange: {
      start: Date;
      end: Date;
    };
    exportOptions: ExportOptions;
  };
  /** Conversation context information */
  context: {
    systemPrompt: string;
    maxTokens: number;
    tokenCount: number;
    config: any;
  };
  /** Messages in the conversation */
  messages: ExportedMessage[];
  /** Tool execution summary */
  toolExecutions: ExportedToolExecution[];
  /** Conversation statistics */
  statistics: ConversationStatistics;
}

/**
 * Exported message structure
 */
export interface ExportedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: {
    tokenCount?: number;
    processingTime?: number;
    model?: string;
  };
  toolCalls?: ToolCall[];
  toolResults?: AIToolResult[];
}

/**
 * Exported tool execution structure
 */
export interface ExportedToolExecution {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  result: {
    success: boolean;
    output?: string;
    error?: string;
  };
  metadata: {
    executionTime: number;
    timestamp: Date;
    messageId?: string;
  };
}

/**
 * Conversation statistics
 */
export interface ConversationStatistics {
  messageCount: {
    total: number;
    byRole: Record<string, number>;
  };
  toolExecutions: {
    total: number;
    successful: number;
    failed: number;
    byTool: Record<string, number>;
    averageExecutionTime: number;
  };
  tokens: {
    total: number;
    average: number;
    byRole: Record<string, number>;
  };
  timespan: {
    start: Date;
    end: Date;
    duration: number; // in milliseconds
  };
}

/**
 * Conversation Export Service
 */
export class ConversationExportService {
  private logger: Logger;

  constructor() {
    this.logger = logger.child({ prefix: 'Service' });
  }

  /**
   * Export conversation from context manager
   */
  async exportConversation(
    contextManager: ConversationContextManager,
    options: ExportOptions,
    conversationId: string,
    title?: string
  ): Promise<ExportResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting conversation export', {
        conversationId,
        format: options.format,
        messageCount: contextManager.messages.length
      });

      // Prepare export data
      const exportData = this.prepareExportData(contextManager, options, conversationId, title);
      
      // Generate content based on format
      const content = await this.generateExportContent(exportData, options);
      
      // Calculate statistics
      const processingTime = Date.now() - startTime;
      const statistics = {
        messageCount: exportData.messages.length,
        toolExecutionCount: exportData.toolExecutions.length,
        exportSize: content.length,
        processingTime
      };

      this.logger.info('Conversation export completed', statistics);

      return {
        success: true,
        content,
        statistics
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown export error';
      this.logger.error('Conversation export failed', { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        statistics: {
          messageCount: 0,
          toolExecutionCount: 0,
          exportSize: 0,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Export conversation to file
   */
  async exportToFile(
    contextManager: ConversationContextManager,
    options: ExportOptions,
    conversationId: string,
    filePath?: string,
    title?: string
  ): Promise<ExportResult> {
    const exportResult = await this.exportConversation(contextManager, options, conversationId, title);
    
    if (!exportResult.success || !exportResult.content) {
      return exportResult;
    }

    try {
      // Generate file path if not provided
      if (!filePath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = this.getFileExtension(options.format);
        const fileName = `conversation-${conversationId}-${timestamp}.${extension}`;
        
        // Use workspace folder or fallback to temp directory
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const baseDir = workspaceFolder ? workspaceFolder.uri.fsPath : require('os').tmpdir();
        filePath = path.join(baseDir, 'exports', fileName);
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(filePath, exportResult.content, 'utf8');

      this.logger.info('Conversation exported to file', { filePath });

      return {
        ...exportResult,
        filePath
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to write export file';
      this.logger.error('File export failed', { error: errorMessage });

      return {
        ...exportResult,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Export multiple conversations
   */
  async exportMultipleConversations(
    conversations: Array<{
      contextManager: ConversationContextManager;
      id: string;
      title?: string;
    }>,
    options: ExportOptions,
    outputDir?: string
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = [];

    for (const conversation of conversations) {
      const filePath = outputDir 
        ? path.join(outputDir, `conversation-${conversation.id}.${this.getFileExtension(options.format)}`)
        : undefined;

      const result = await this.exportToFile(
        conversation.contextManager,
        options,
        conversation.id,
        filePath,
        conversation.title
      );

      results.push(result);
    }

    return results;
  }

  /**
   * Prepare export data from conversation context
   */
  private prepareExportData(
    contextManager: ConversationContextManager,
    options: ExportOptions,
    conversationId: string,
    title?: string
  ): ConversationExportData {
    const stats = contextManager.getStats();
    const serialized = contextManager.serialize();

    // Filter messages based on options
    let filteredMessages = contextManager.messages;

    if (options.dateRange) {
      filteredMessages = filteredMessages.filter(msg => 
        msg.timestamp >= options.dateRange!.start && 
        msg.timestamp <= options.dateRange!.end
      );
    }

    if (options.senderFilter) {
      filteredMessages = filteredMessages.filter(msg => 
        options.senderFilter!.includes(msg.role)
      );
    }

    // Convert messages to export format
    const exportedMessages: ExportedMessage[] = filteredMessages.map(msg => ({
      id: `msg-${msg.timestamp.getTime()}`,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: options.includeMetadata ? {
        tokenCount: this.estimateTokens(msg.content),
        model: (msg as any).model
      } : undefined,
      toolCalls: options.includeToolExecutions ? msg.toolCalls : undefined,
      toolResults: options.includeToolExecutions ? msg.toolResults : undefined
    }));

    // Filter and convert tool executions
    let filteredToolResults = contextManager.toolResults;

    if (options.successfulToolsOnly) {
      filteredToolResults = filteredToolResults.filter(result => result.success);
    }

    const exportedToolExecutions: ExportedToolExecution[] = filteredToolResults.map(result => ({
      id: `tool-${result.metadata.timestamp.getTime()}`,
      toolName: result.metadata.toolName,
      parameters: result.metadata.parameters,
      result: {
        success: result.success,
        output: result.output,
        error: result.error
      },
      metadata: {
        executionTime: result.metadata.executionTime,
        timestamp: result.metadata.timestamp
      }
    }));

    // Calculate statistics
    const statistics = this.calculateStatistics(exportedMessages, exportedToolExecutions);

    return {
      metadata: {
        exportedAt: new Date(),
        exportFormat: options.format,
        conversationId,
        title,
        totalMessages: exportedMessages.length,
        totalToolExecutions: exportedToolExecutions.length,
        dateRange: {
          start: statistics.timespan.start,
          end: statistics.timespan.end
        },
        exportOptions: options
      },
      context: {
        systemPrompt: options.includeSystemPrompts ? contextManager.systemPrompt : '',
        maxTokens: contextManager.maxTokens,
        tokenCount: stats.tokenCount,
        config: serialized.config
      },
      messages: exportedMessages,
      toolExecutions: exportedToolExecutions,
      statistics
    };
  }

  /**
   * Generate export content based on format
   */
  private async generateExportContent(data: ConversationExportData, options: ExportOptions): Promise<string> {
    switch (options.format) {
      case 'json':
        return this.generateJsonExport(data, options);
      case 'markdown':
        return this.generateMarkdownExport(data, options);
      case 'csv':
        return this.generateCsvExport(data, options);
      case 'html':
        return this.generateHtmlExport(data, options);
      case 'txt':
        return this.generateTextExport(data, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Generate JSON export
   */
  private generateJsonExport(data: ConversationExportData, options: ExportOptions): string {
    return JSON.stringify(data, null, options.prettyPrint ? 2 : 0);
  }

  /**
   * Generate Markdown export
   */
  private generateMarkdownExport(data: ConversationExportData, options: ExportOptions): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Conversation Export: ${data.metadata.title || data.metadata.conversationId}`);
    lines.push('');
    lines.push(`**Exported:** ${data.metadata.exportedAt.toISOString()}`);
    lines.push(`**Messages:** ${data.metadata.totalMessages}`);
    lines.push(`**Tool Executions:** ${data.metadata.totalToolExecutions}`);
    lines.push('');

    // Statistics
    if (options.includeStatistics) {
      lines.push('## Statistics');
      lines.push('');
      lines.push(`- **Total Messages:** ${data.statistics.messageCount.total}`);
      lines.push(`- **User Messages:** ${data.statistics.messageCount.byRole.user || 0}`);
      lines.push(`- **Assistant Messages:** ${data.statistics.messageCount.byRole.assistant || 0}`);
      lines.push(`- **Tool Executions:** ${data.statistics.toolExecutions.total}`);
      lines.push(`- **Successful Tools:** ${data.statistics.toolExecutions.successful}`);
      lines.push(`- **Failed Tools:** ${data.statistics.toolExecutions.failed}`);
      lines.push(`- **Total Tokens:** ${data.statistics.tokens.total}`);
      lines.push(`- **Conversation Duration:** ${Math.round(data.statistics.timespan.duration / 1000 / 60)} minutes`);
      lines.push('');
    }

    // System Prompt
    if (options.includeSystemPrompts && data.context.systemPrompt) {
      lines.push('## System Prompt');
      lines.push('');
      lines.push('```');
      lines.push(data.context.systemPrompt);
      lines.push('```');
      lines.push('');
    }

    // Messages
    lines.push('## Conversation');
    lines.push('');

    for (const message of data.messages) {
      const roleIcon = this.getRoleIcon(message.role);
      const timestamp = options.includeMetadata ? ` *(${message.timestamp.toISOString()})*` : '';
      
      lines.push(`### ${roleIcon} ${message.role.charAt(0).toUpperCase() + message.role.slice(1)}${timestamp}`);
      lines.push('');
      lines.push(message.content);
      lines.push('');

      // Tool calls
      if (options.includeToolExecutions && message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          lines.push(`**🔧 Tool Call:** ${toolCall.name}`);
          lines.push('```json');
          lines.push(JSON.stringify(toolCall.parameters, null, 2));
          lines.push('```');
          lines.push('');
        }
      }

      // Tool results
      if (options.includeToolExecutions && message.toolResults) {
        for (const result of message.toolResults) {
          const status = result.success ? '✅' : '❌';
          lines.push(`**${status} Tool Result:** ${result.metadata.toolName}`);
          if (result.output) {
            lines.push('```');
            lines.push(result.output);
            lines.push('```');
          }
          if (result.error) {
            lines.push('```');
            lines.push(`Error: ${result.error}`);
            lines.push('```');
          }
          lines.push('');
        }
      }
    }

    // Tool Execution Summary
    if (options.includeToolExecutions && data.toolExecutions.length > 0) {
      lines.push('## Tool Execution Summary');
      lines.push('');
      
      for (const execution of data.toolExecutions) {
        const status = execution.result.success ? '✅' : '❌';
        lines.push(`### ${status} ${execution.toolName}`);
        lines.push('');
        lines.push(`**Executed:** ${execution.metadata.timestamp.toISOString()}`);
        lines.push(`**Duration:** ${execution.metadata.executionTime}ms`);
        lines.push('');
        
        if (Object.keys(execution.parameters).length > 0) {
          lines.push('**Parameters:**');
          lines.push('```json');
          lines.push(JSON.stringify(execution.parameters, null, 2));
          lines.push('```');
          lines.push('');
        }
        
        if (execution.result.output) {
          lines.push('**Output:**');
          lines.push('```');
          lines.push(execution.result.output);
          lines.push('```');
          lines.push('');
        }
        
        if (execution.result.error) {
          lines.push('**Error:**');
          lines.push('```');
          lines.push(execution.result.error);
          lines.push('```');
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate CSV export
   */
  private generateCsvExport(data: ConversationExportData, options: ExportOptions): string {
    const lines: string[] = [];
    
    // Header
    const headers = ['timestamp', 'role', 'content', 'token_count'];
    if (options.includeToolExecutions) {
      headers.push('tool_calls', 'tool_results');
    }
    if (options.includeMetadata) {
      headers.push('processing_time', 'model');
    }
    
    lines.push(headers.join(','));

    // Messages
    for (const message of data.messages) {
      const row: string[] = [
        `"${message.timestamp.toISOString()}"`,
        `"${message.role}"`,
        `"${this.escapeCsvValue(message.content)}"`,
        `"${message.metadata?.tokenCount || 0}"`
      ];

      if (options.includeToolExecutions) {
        row.push(`"${message.toolCalls ? JSON.stringify(message.toolCalls) : ''}"`);
        row.push(`"${message.toolResults ? JSON.stringify(message.toolResults) : ''}"`);
      }

      if (options.includeMetadata) {
        row.push(`"${message.metadata?.processingTime || 0}"`);
        row.push(`"${message.metadata?.model || ''}"`);
      }

      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Generate HTML export
   */
  private generateHtmlExport(data: ConversationExportData, options: ExportOptions): string {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conversation Export: ${data.metadata.title || data.metadata.conversationId}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; line-height: 1.6; }
        .header { border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
        .message { margin-bottom: 30px; padding: 15px; border-radius: 8px; }
        .user { background-color: #f0f9ff; border-left: 4px solid #0ea5e9; }
        .assistant { background-color: #f0fdf4; border-left: 4px solid #22c55e; }
        .system { background-color: #fef3c7; border-left: 4px solid #f59e0b; }
        .tool { background-color: #f3e8ff; border-left: 4px solid #a855f7; }
        .role { font-weight: bold; margin-bottom: 10px; }
        .timestamp { color: #666; font-size: 0.9em; }
        .tool-call { background-color: #f8fafc; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .statistics { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
        pre { background-color: #f1f5f9; padding: 10px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Conversation Export</h1>
        <p><strong>ID:</strong> ${data.metadata.conversationId}</p>
        <p><strong>Title:</strong> ${data.metadata.title || 'Untitled'}</p>
        <p><strong>Exported:</strong> ${data.metadata.exportedAt.toISOString()}</p>
        <p><strong>Messages:</strong> ${data.metadata.totalMessages}</p>
        <p><strong>Tool Executions:</strong> ${data.metadata.totalToolExecutions}</p>
    </div>

    ${options.includeStatistics ? this.generateHtmlStatistics(data.statistics) : ''}
    
    ${options.includeSystemPrompts && data.context.systemPrompt ? `
    <div class="system-prompt">
        <h2>System Prompt</h2>
        <pre>${this.escapeHtml(data.context.systemPrompt)}</pre>
    </div>
    ` : ''}

    <div class="messages">
        <h2>Conversation</h2>
        ${data.messages.map(msg => this.generateHtmlMessage(msg, options)).join('')}
    </div>

    ${options.includeToolExecutions && data.toolExecutions.length > 0 ? `
    <div class="tool-executions">
        <h2>Tool Execution Summary</h2>
        ${data.toolExecutions.map(exec => this.generateHtmlToolExecution(exec)).join('')}
    </div>
    ` : ''}
</body>
</html>`;

    return html;
  }

  /**
   * Generate plain text export
   */
  private generateTextExport(data: ConversationExportData, options: ExportOptions): string {
    const lines: string[] = [];

    // Header
    lines.push(`CONVERSATION EXPORT: ${data.metadata.title || data.metadata.conversationId}`);
    lines.push('='.repeat(80));
    lines.push(`Exported: ${data.metadata.exportedAt.toISOString()}`);
    lines.push(`Messages: ${data.metadata.totalMessages}`);
    lines.push(`Tool Executions: ${data.metadata.totalToolExecutions}`);
    lines.push('');

    // System Prompt
    if (options.includeSystemPrompts && data.context.systemPrompt) {
      lines.push('SYSTEM PROMPT:');
      lines.push('-'.repeat(40));
      lines.push(data.context.systemPrompt);
      lines.push('');
    }

    // Messages
    lines.push('CONVERSATION:');
    lines.push('-'.repeat(40));

    for (const message of data.messages) {
      const timestamp = options.includeMetadata ? ` [${message.timestamp.toISOString()}]` : '';
      lines.push(`${message.role.toUpperCase()}${timestamp}:`);
      lines.push(message.content);
      lines.push('');

      // Tool calls and results
      if (options.includeToolExecutions) {
        if (message.toolCalls) {
          for (const toolCall of message.toolCalls) {
            lines.push(`TOOL CALL: ${toolCall.name}`);
            lines.push(JSON.stringify(toolCall.parameters, null, 2));
            lines.push('');
          }
        }

        if (message.toolResults) {
          for (const result of message.toolResults) {
            lines.push(`TOOL RESULT: ${result.metadata.toolName} (${result.success ? 'SUCCESS' : 'FAILED'})`);
            if (result.output) {
              lines.push(result.output);
            }
            if (result.error) {
              lines.push(`ERROR: ${result.error}`);
            }
            lines.push('');
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Calculate conversation statistics
   */
  private calculateStatistics(messages: ExportedMessage[], toolExecutions: ExportedToolExecution[]): ConversationStatistics {
    const messagesByRole: Record<string, number> = {};
    const tokensByRole: Record<string, number> = {};
    const toolsByName: Record<string, number> = {};
    
    let totalTokens = 0;
    let successfulTools = 0;
    let totalExecutionTime = 0;

    // Process messages
    for (const message of messages) {
      messagesByRole[message.role] = (messagesByRole[message.role] || 0) + 1;
      
      const tokens = message.metadata?.tokenCount || this.estimateTokens(message.content);
      tokensByRole[message.role] = (tokensByRole[message.role] || 0) + tokens;
      totalTokens += tokens;
    }

    // Process tool executions
    for (const execution of toolExecutions) {
      toolsByName[execution.toolName] = (toolsByName[execution.toolName] || 0) + 1;
      totalExecutionTime += execution.metadata.executionTime;
      
      if (execution.result.success) {
        successfulTools++;
      }
    }

    // Calculate timespan
    const timestamps = messages.map(m => m.timestamp.getTime());
    const start = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date();
    const end = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date();

    return {
      messageCount: {
        total: messages.length,
        byRole: messagesByRole
      },
      toolExecutions: {
        total: toolExecutions.length,
        successful: successfulTools,
        failed: toolExecutions.length - successfulTools,
        byTool: toolsByName,
        averageExecutionTime: toolExecutions.length > 0 ? totalExecutionTime / toolExecutions.length : 0
      },
      tokens: {
        total: totalTokens,
        average: messages.length > 0 ? totalTokens / messages.length : 0,
        byRole: tokensByRole
      },
      timespan: {
        start,
        end,
        duration: end.getTime() - start.getTime()
      }
    };
  }

  /**
   * Helper methods
   */
  private getFileExtension(format: ExportFormat): string {
    const extensions: Record<ExportFormat, string> = {
      json: 'json',
      markdown: 'md',
      csv: 'csv',
      html: 'html',
      txt: 'txt'
    };
    return extensions[format];
  }

  private getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      user: '👤',
      assistant: '🤖',
      system: '⚙️',
      tool: '🔧'
    };
    return icons[role] || '💬';
  }

  private escapeCsvValue(value: string): string {
    return value.replace(/"/g, '""').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private generateHtmlStatistics(stats: ConversationStatistics): string {
    return `
    <div class="statistics">
        <h2>Statistics</h2>
        <p><strong>Total Messages:</strong> ${stats.messageCount.total}</p>
        <p><strong>User Messages:</strong> ${stats.messageCount.byRole.user || 0}</p>
        <p><strong>Assistant Messages:</strong> ${stats.messageCount.byRole.assistant || 0}</p>
        <p><strong>Tool Executions:</strong> ${stats.toolExecutions.total}</p>
        <p><strong>Successful Tools:</strong> ${stats.toolExecutions.successful}</p>
        <p><strong>Failed Tools:</strong> ${stats.toolExecutions.failed}</p>
        <p><strong>Total Tokens:</strong> ${stats.tokens.total}</p>
        <p><strong>Duration:</strong> ${Math.round(stats.timespan.duration / 1000 / 60)} minutes</p>
    </div>`;
  }

  private generateHtmlMessage(message: ExportedMessage, options: ExportOptions): string {
    const timestamp = options.includeMetadata ? `<span class="timestamp">${message.timestamp.toISOString()}</span>` : '';
    
    let toolCallsHtml = '';
    if (options.includeToolExecutions && message.toolCalls) {
      toolCallsHtml = message.toolCalls.map(call => `
        <div class="tool-call">
            <strong>🔧 Tool Call: ${call.name}</strong>
            <pre>${JSON.stringify(call.parameters, null, 2)}</pre>
        </div>
      `).join('');
    }

    let toolResultsHtml = '';
    if (options.includeToolExecutions && message.toolResults) {
      toolResultsHtml = message.toolResults.map(result => `
        <div class="tool-call">
            <strong>${result.success ? '✅' : '❌'} Tool Result: ${result.metadata.toolName}</strong>
            ${result.output ? `<pre>${this.escapeHtml(result.output)}</pre>` : ''}
            ${result.error ? `<pre>Error: ${this.escapeHtml(result.error)}</pre>` : ''}
        </div>
      `).join('');
    }

    return `
    <div class="message ${message.role}">
        <div class="role">${this.getRoleIcon(message.role)} ${message.role.charAt(0).toUpperCase() + message.role.slice(1)} ${timestamp}</div>
        <div class="content">${this.escapeHtml(message.content)}</div>
        ${toolCallsHtml}
        ${toolResultsHtml}
    </div>`;
  }

  private generateHtmlToolExecution(execution: ExportedToolExecution): string {
    const status = execution.result.success ? '✅' : '❌';
    return `
    <div class="tool-call">
        <h3>${status} ${execution.toolName}</h3>
        <p><strong>Executed:</strong> ${execution.metadata.timestamp.toISOString()}</p>
        <p><strong>Duration:</strong> ${execution.metadata.executionTime}ms</p>
        ${Object.keys(execution.parameters).length > 0 ? `
        <p><strong>Parameters:</strong></p>
        <pre>${JSON.stringify(execution.parameters, null, 2)}</pre>
        ` : ''}
        ${execution.result.output ? `
        <p><strong>Output:</strong></p>
        <pre>${this.escapeHtml(execution.result.output)}</pre>
        ` : ''}
        ${execution.result.error ? `
        <p><strong>Error:</strong></p>
        <pre>${this.escapeHtml(execution.result.error)}</pre>
        ` : ''}
    </div>`;
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (approximately 4 characters per token)
    return Math.ceil(text.length / 4);
  }
}