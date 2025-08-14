import { AIAgentService } from '../../core/ai-agent';

describe('AIAgentService Streaming', () => {
  let agentService: AIAgentService;
  
  beforeEach(() => {
    agentService = new AIAgentService();
    
    // Mock the model configuration
    agentService.setModel({
      provider: 'mock',
      model: 'test-model',
      temperature: 0.7,
      maxTokens: 1000
    });
  });

  afterEach(() => {
    // Clean up any pending operations
    agentService.abortStreaming();
  });

  it('should support streaming responses', async () => {
    const sessionId = 'test-session';
    const testMessage = 'Hello, world!';
    const chunks: { content: string; isComplete: boolean }[] = [];
    
    // Start streaming
    const responsePromise = agentService.sendMessage(
      sessionId, 
      testMessage,
      (chunk) => {
        chunks.push(chunk);
      }
    );

    // Wait for streaming to complete
    const response = await responsePromise;
    
    // Verify the response
    expect(response).toBeDefined();
    expect(response.content).toContain('simulated streaming response');
    expect(chunks.length).toBeGreaterThan(0);
    
    // Verify chunks form the complete response
    const streamedContent = chunks.map(c => c.content).join('');
    expect(streamedContent).toBe(response.content);
    
    // Verify the last chunk is marked as complete
    expect(chunks[chunks.length - 1].isComplete).toBe(true);
  });

  it('should allow aborting a streaming response', async () => {
    const sessionId = 'test-session';
    const testMessage = 'Hello, world!';
    const chunks: { content: string; isComplete: boolean }[] = [];
    
    // Start streaming
    const responsePromise = agentService.sendMessage(
      sessionId, 
      testMessage,
      (chunk) => {
        chunks.push(chunk);
        
        // Abort after first chunk
        if (chunks.length === 1) {
          agentService.abortStreaming();
        }
      }
    );

    // Should reject with abort error
    await expectAsync(responsePromise).toBeRejectedWithError('Streaming was aborted');
    
    // Should have received some chunks before aborting
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[chunks.length - 1].isComplete).toBe(false);
  });

  it('should prevent multiple concurrent streaming requests', async () => {
    const sessionId = 'test-session';
    const testMessage = 'Hello, world!';
    
    // Start first streaming request
    const firstRequest = agentService.sendMessage(
      sessionId, 
      testMessage,
      () => {}
    );
    
    // Try to start a second streaming request (should fail)
    await expectAsync(
      agentService.sendMessage(sessionId, testMessage, () => {})
    ).toBeRejectedWithError('A streaming operation is already in progress');
    
    // Clean up
    agentService.abortStreaming();
    await firstRequest.catch(() => {}); // Ignore the rejection from the abort
  });

  it('should add streaming responses to conversation context', async () => {
    const sessionId = 'test-session';
    const testMessage = 'Hello, world!';
    
    // Start streaming
    await agentService.sendMessage(
      sessionId, 
      testMessage,
      () => {} // No-op chunk handler for this test
    );
    
    // Get the conversation context
    const context = agentService.getConversationContext(sessionId);
    expect(context).toBeDefined();
    
    // Should have both user and assistant messages
    expect(context!.messages.length).toBe(2);
    expect(context!.messages[0].role).toBe('user');
    expect(context!.messages[0].content).toBe(testMessage);
    expect(context!.messages[1].role).toBe('assistant');
    expect(context!.messages[1].content).toContain('simulated streaming response');
  });
});
