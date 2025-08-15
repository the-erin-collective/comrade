import { AIAgentService } from '../../core/ai-agent';
import { expect } from 'chai';
import * as sinon from 'sinon';

describe('AIAgentService Streaming', () => {
  let agentService: AIAgentService;
  
  beforeEach(() => {
    agentService = new AIAgentService();
    
    // Mock the model configuration
    agentService.setModel({
      name: 'test-model',
      provider: 'custom',
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
    expect(response).to.exist;
    expect(response.content).to.include('simulated streaming response');
    expect(chunks.length).to.be.greaterThan(0);
    
    // Verify chunks form the complete response
    const streamedContent = chunks.map(c => c.content).join('');
    expect(streamedContent).to.equal(response.content);
    
    // Verify the last chunk is marked as complete
    expect(chunks[chunks.length - 1].isComplete).to.be.true;
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
    try {
      await responsePromise;
      expect.fail('Expected promise to be rejected');
    } catch (error) {
      expect((error as Error).message).to.include('Streaming was aborted');
    }
    
    // Should have received some chunks before aborting
    expect(chunks.length).to.be.greaterThan(0);
    expect(chunks[chunks.length - 1].isComplete).to.be.false;
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
    try {
      await agentService.sendMessage(sessionId, testMessage, () => {});
      expect.fail('Expected promise to be rejected');
    } catch (error) {
      expect((error as Error).message).to.include('A streaming operation is already in progress');
    }
    
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
    expect(context).to.exist;
    
    // Should have both user and assistant messages
    expect(context!.messages.length).to.equal(2);
    expect(context!.messages[0].role).to.equal('user');
    expect(context!.messages[0].content).to.equal(testMessage);
    expect(context!.messages[1].role).to.equal('assistant');
    expect(context!.messages[1].content).to.include('simulated streaming response');
  });
});
