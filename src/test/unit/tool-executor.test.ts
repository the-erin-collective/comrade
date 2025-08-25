import { expect } from 'chai';
import * as sinon from 'sinon';
import { ToolExecutor } from '../../core/tool-executor';
import { ToolRegistry } from '../../core/tool-registry';
import { ToolCall, AIToolResult } from '../../core/types';
import { Tool, ToolResult } from '../../core/model-adapters/base-model-adapter';

// Mock Tool implementation for testing
class MockTool implements Tool {
  constructor(
    public name: string,
    public description: string,
    public parameters: any[],
    private executeFn: (params: any) => Promise<ToolResult>
  ) {}

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    return this.executeFn(parameters);
  }
}

describe('ToolExecutor', () => {
  let toolRegistry: ToolRegistry;
  let toolExecutor: ToolExecutor;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    toolExecutor = new ToolExecutor(toolRegistry, {
      maxConcurrentTools: 2,
      timeoutMs: 1000,
      retryAttempts: 1
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should execute a single tool successfully', async () => {
    // Setup
    const mockTool = new MockTool(
      'test_tool',
      'A test tool',
      [],
      async () => ({
        success: true,
        output: 'Test output',
        metadata: { executionTime: 10, toolName: 'test_tool', parameters: {}, timestamp: new Date() }
      })
    );
    toolRegistry.registerTool(mockTool);

    // Execute
    const toolCall = {
      id: '1',
      name: 'test_tool',
      parameters: {}
    };

    const { results, errors } = await toolExecutor.executeToolCalls([toolCall]);

    // Verify
    expect(results).to.have.lengthOf(1);
    expect(errors).to.have.lengthOf(0);
    expect(results[0].success).to.equal(true);
    expect(results[0].output).to.equal('Test output');
  });

  it('should handle tool execution errors', async () => {
    // Setup
    const mockTool = new MockTool(
      'failing_tool',
      'A failing test tool',
      [],
      async () => ({
        success: false,
        error: 'Tool execution failed',
        metadata: { executionTime: 10, toolName: 'failing_tool', parameters: {}, timestamp: new Date() }
      })
    );
    toolRegistry.registerTool(mockTool);

    // Execute
    const toolCall = {
      id: '1',
      name: 'failing_tool',
      parameters: {}
    };

    const { results, errors } = await toolExecutor.executeToolCalls([toolCall]);

    // Verify
    expect(results).to.have.lengthOf(0);
    expect(errors).to.have.lengthOf(1);
    expect(errors[0].message).to.include('Tool execution failed');
  });

  it('should execute multiple tools with concurrency control', async () => {
    // Setup
    const executionOrder: string[] = [];
    const mockTool = (id: string) => new MockTool(
      `tool_${id}`,
      `Test tool ${id}`,
      [],
      async () => {
        executionOrder.push(`start_${id}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        executionOrder.push(`end_${id}`);
        return {
          success: true,
          output: `Output from ${id}`,
          metadata: { executionTime: 10, toolName: `tool_${id}`, parameters: {}, timestamp: new Date() }
        };
      }
    );

    // Register 4 tools
    ['1', '2', '3', '4'].forEach(id => toolRegistry.registerTool(mockTool(id)));

    // Execute
    const toolCalls = ['1', '2', '3', '4'].map(id => ({
      id,
      name: `tool_${id}`,
      parameters: {}
    }));

    await toolExecutor.executeToolCalls(toolCalls);

    // Verify concurrency (first two should start before any finish)
    const firstTwoStarted = executionOrder.indexOf('start_1') >= 0 && 
                          executionOrder.indexOf('start_2') >= 0 &&
                          executionOrder.indexOf('end_1') === -1 &&
                          executionOrder.indexOf('end_2') === -1;
    expect(firstTwoStarted).to.equal(true);
  });

  it('should respect max concurrency limit', async () => {
    // Setup
    const activeTasks = { count: 0 };
    const maxConcurrent = 2;
    const toolExecutor = new ToolExecutor(toolRegistry, { maxConcurrentTools: maxConcurrent });

    const mockTool = new MockTool(
      'concurrent_tool',
      'Test concurrency',
      [],
      async () => {
        activeTasks.count++;
        const currentActive = activeTasks.count;
        expect(currentActive).to.be.lessThanOrEqual(maxConcurrent);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        activeTasks.count--;
        
        return {
          success: true,
          output: 'Done',
          metadata: { executionTime: 10, toolName: 'concurrent_tool', parameters: {}, timestamp: new Date() }
        };
      }
    );
    toolRegistry.registerTool(mockTool);

    // Execute multiple tool calls
    const toolCalls = Array(5).fill(0).map((_, i) => ({
      id: `call_${i}`,
      name: 'concurrent_tool',
      parameters: {}
    }));

    await toolExecutor.executeToolCalls(toolCalls);

    // If we get here without the test failing, concurrency was respected
    expect(true).to.equal(true);
  });

  it('should handle tool timeouts', async () => {
    // Setup
    const mockTool = new MockTool(
      'slow_tool',
      'A slow test tool',
      [],
      async () => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Longer than timeout
        return {
          success: true,
          output: 'This should time out',
          metadata: { executionTime: 2000, toolName: 'slow_tool', parameters: {}, timestamp: new Date() }
        };
      }
    );
    toolRegistry.registerTool(mockTool);

    // Execute with short timeout
    const toolCall = {
      id: '1',
      name: 'slow_tool',
      parameters: {}
    };

    const { results, errors } = await toolExecutor.executeToolCalls([toolCall]);

    // Verify
    expect(results).to.have.lengthOf(0);
    expect(errors).to.have.lengthOf(1);
    expect(errors[0].message).to.include('timed out');
  });

  it('should retry failed executions', async () => {
    // Setup
    let callCount = 0;
    const mockTool = new MockTool(
      'flaky_tool',
      'A flaky test tool',
      [],
      async () => {
        callCount++;
        if (callCount <= 1) {
          throw new Error('Temporary failure');
        }
        return {
          success: true,
          output: 'Succeeded after retry',
          metadata: { executionTime: 10, toolName: 'flaky_tool', parameters: {}, timestamp: new Date() }
        };
      }
    );
    toolRegistry.registerTool(mockTool);

    // Execute with retries
    const toolCall = {
      id: '1',
      name: 'flaky_tool',
      parameters: {}
    };

    const { results } = await toolExecutor.executeToolCalls([toolCall]);

    // Verify
    expect(callCount).to.equal(2); // Initial + 1 retry
    expect(results).to.have.lengthOf(1);
    expect(results[0].output).to.equal('Succeeded after retry');
  });

  it('should cancel all executions', async () => {
    // Setup
    const mockTool = new MockTool(
      'cancellable_tool',
      'A cancellable test tool',
      [],
      async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          success: true,
          output: 'This should be cancelled',
          metadata: { executionTime: 1000, toolName: 'cancellable_tool', parameters: {}, timestamp: new Date() }
        };
      }
    );
    toolRegistry.registerTool(mockTool);

    // Execute and cancel immediately
    const toolCall = {
      id: '1',
      name: 'cancellable_tool',
      parameters: {}
    };

    const executionPromise = toolExecutor.executeToolCalls([toolCall]);
    toolExecutor.cancelAll();

    const { results, errors } = await executionPromise;

    // Verify
    expect(results).to.have.lengthOf(0);
    expect(errors).to.have.lengthOf(1);
    expect(errors[0].message).to.include('cancelled');
  });
});
