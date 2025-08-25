/**
 * Tool Executor for managing concurrent tool execution with retries and timeouts
 */

import { ToolCall, AIToolResult } from './types';
import { ToolRegistry } from './tool-registry';

export interface ToolExecutionOptions {
  maxConcurrentTools?: number;
  timeoutMs?: number;
  retryAttempts?: number;
}

interface ToolExecutionTask {
  toolCall: ToolCall;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: AIToolResult;
  retries: number;
}

export class ToolExecutor {
  private toolRegistry: ToolRegistry;
  private maxConcurrentTools: number;
  private timeoutMs: number;
  private retryAttempts: number;
  private pendingQueue: ToolExecutionTask[] = [];
  private runningTasks: Map<string, Promise<AIToolResult>> = new Map();
  private taskCallbacks: Map<string, (result: AIToolResult) => void> = new Map();
  private isCancelled = false;

  constructor(
    toolRegistry: ToolRegistry,
    options: ToolExecutionOptions = {}
  ) {
    this.toolRegistry = toolRegistry;
    this.maxConcurrentTools = options.maxConcurrentTools ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30000; // 30 seconds default timeout
    this.retryAttempts = options.retryAttempts ?? 1;
  }

  /**
   * Execute multiple tool calls with concurrency control
   */
  async executeToolCalls(
    toolCalls: ToolCall[]
  ): Promise<{ results: AIToolResult[]; errors: Error[] }> {
    this.isCancelled = false;
    const tasks = toolCalls.map(toolCall => ({
      toolCall,
      status: 'pending' as const,
      result: undefined,
      retries: 0
    }));

    this.pendingQueue = [...this.pendingQueue, ...tasks];
    const results: AIToolResult[] = [];
    const errors: Error[] = [];

    // Process the queue until all tasks are done
    while ((this.pendingQueue.length > 0 || this.runningTasks.size > 0) && !this.isCancelled) {
      // Start new tasks if we have capacity
      while (
        this.runningTasks.size < this.maxConcurrentTools && 
        this.pendingQueue.length > 0 &&
        !this.isCancelled
      ) {
        const task = this.pendingQueue.shift()!;
        const taskPromise = this.executeToolTask(task);
        
        this.runningTasks.set(task.toolCall.id, taskPromise);
        
        taskPromise
          .then(result => {
            if (result.success) {
              results.push(result);
            } else {
              errors.push(new Error(result.error || 'Tool execution failed'));
            }
          })
          .catch(error => {
            errors.push(error instanceof Error ? error : new Error(String(error)));
          })
          .finally(() => {
            this.runningTasks.delete(task.toolCall.id);
          });
      }

      // Wait for at least one task to complete if we still have running tasks
      if (this.runningTasks.size > 0 && !this.isCancelled) {
        try {
          await Promise.race([...this.runningTasks.values()]);
        } catch (error) {
          // Individual task errors are already handled above
          continue;
        }
      }
    }

    return { results, errors };
  }

  private async executeToolTask(task: ToolExecutionTask): Promise<AIToolResult> {
    const { toolCall } = task;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      if (this.isCancelled) {
        return this.createCancelledResult(toolCall);
      }

      try {
        const timeoutPromise = new Promise<AIToolResult>((_, reject) => 
          setTimeout(
            () => reject(new Error(`Tool execution timed out after ${this.timeoutMs}ms`)),
            this.timeoutMs
          )
        );

        const executionPromise = this.toolRegistry.executeTool(
          toolCall.name,
          toolCall.parameters
        ).then(toolResult => ({
          ...toolResult,
          toolName: toolCall.name,
          parameters: toolCall.parameters
        } as AIToolResult));

        // Race the tool execution against the timeout
        const result = await Promise.race([executionPromise, timeoutPromise]);
        return result;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.retryAttempts) {
          // Exponential backoff before retry
          await new Promise(resolve => 
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    }

    // If we get here, all retries failed
    return {
      success: false,
      error: lastError?.message || 'Unknown error during tool execution',
      toolName: toolCall.name,
      parameters: toolCall.parameters,
      metadata: {
        executionTime: 0,
        toolName: toolCall.name,
        parameters: toolCall.parameters,
        timestamp: new Date(),
        attempts: task.retries + 1
      }
    };
  }

  private createCancelledResult(toolCall: ToolCall): AIToolResult {
    return {
      success: false,
      error: 'Tool execution was cancelled',
      toolName: toolCall.name,
      parameters: toolCall.parameters,
      metadata: {
        executionTime: 0,
        toolName: toolCall.name,
        parameters: toolCall.parameters,
        timestamp: new Date(),
        cancelled: true
      }
    };
  }

  /**
   * Cancel all pending and running tool executions
   */
  cancelAll(): void {
    this.isCancelled = true;
    this.pendingQueue = [];
    
    // Clear any pending timeouts or other resources
    for (const [id, promise] of this.runningTasks.entries()) {
      const callback = this.taskCallbacks.get(id);
      if (callback) {
        callback(this.createCancelledResult({ id, name: '', parameters: {} }));
      }
    }
    
    this.runningTasks.clear();
    this.taskCallbacks.clear();
  }
}
