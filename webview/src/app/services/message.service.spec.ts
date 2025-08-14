import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MessageService, WebviewMessage, ExtensionMessage } from './message.service';

// Remove the redeclaration of addEventListener to avoid type conflicts

describe('MessageService', () => {
  let service: MessageService;
  let postMessageSpy: jasmine.Spy<(msg: ExtensionMessage) => void>;
  let originalAcquireVsCodeApi: any;

  beforeAll(() => {
    // Mock acquireVsCodeApi globally
    originalAcquireVsCodeApi = (globalThis as any).acquireVsCodeApi;
    (globalThis as any).acquireVsCodeApi = () => ({
      postMessage: jasmine.createSpy('postMessage'),
      getState: () => ({}),
      setState: () => {},
    });
  });

  afterAll(() => {
    (globalThis as any).acquireVsCodeApi = originalAcquireVsCodeApi;
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MessageService],
    });
    service = TestBed.inject(MessageService);
  postMessageSpy = (globalThis as any).acquireVsCodeApi().postMessage;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set messageReceived signal on window message', () => {
    const testMsg: WebviewMessage = { type: 'updateSession', payload: { foo: 'bar' } };
    window.dispatchEvent(new MessageEvent('message', { data: testMsg }));
    expect(service.messageReceived()).toEqual(testMsg);
  });

  it('should sendMessage using vscode.postMessage', () => {
    const msg: ExtensionMessage = { type: 'sendMessage', payload: { test: 1 } };
    service.sendMessage(msg);
    expect(postMessageSpy).toHaveBeenCalledWith(msg);
  });

  it('should sendChatMessage with correct payload', () => {
    service.sendChatMessage('sid', 'hello', [{ foo: 1 }]);
    expect(postMessageSpy).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'sendMessage',
      payload: jasmine.objectContaining({ sessionId: 'sid', message: 'hello' })
    }));
  });

  it('should call sendMessage for switchSession, createSession, closeSession, openConfig, addContext, switchAgent, cancelOperation, retryOperation, extendTimeout, openConfiguration', () => {
    service.switchSession('sid');
    service.createSession('conversation');
    service.closeSession('sid');
    service.openConfig('type');
    service.addContext('type', 'content');
    service.switchAgent('sid', 'aid', 'phase');
    service.cancelOperation('sid', 'op');
    service.retryOperation('sid', 'op');
    service.extendTimeout('sid', 'op', 123);
    service.openConfiguration('type', 'sid');
    expect(postMessageSpy).toHaveBeenCalledTimes(10);
  });

  describe('Streaming Messages', () => {
    let messageCallback: (chunk: { content: string; isComplete: boolean; error?: string }) => void;
    let messageId: string;
    
    beforeEach(() => {
      // Mock the streaming callback
      messageCallback = jasmine.createSpy('streamingCallback');
      messageId = service.sendChatMessage('sid', 'test', [], messageCallback);
      
      // Verify the message was sent with streaming enabled
      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'sendMessage',
        payload: jasmine.objectContaining({
          sessionId: 'sid',
          message: 'test',
          stream: true,
          messageId: jasmine.any(String)
        })
      });
    });
    
    it('should handle streaming chunks', fakeAsync(() => {
      // Simulate a streaming chunk
      const chunk1: WebviewMessage = {
        type: 'streamChunk',
        payload: { messageId, content: 'Hello', done: false }
      };
      
      // Simulate another chunk
      const chunk2: WebviewMessage = {
        type: 'streamChunk',
        payload: { messageId, content: ' World', done: true }
      };
      
      // Dispatch the chunks
      window.dispatchEvent(new MessageEvent('message', { data: chunk1 }));
      window.dispatchEvent(new MessageEvent('message', { data: chunk2 }));
      
      // Verify the callback was called with the correct chunks
      expect(messageCallback).toHaveBeenCalledWith({
        content: 'Hello',
        isComplete: false
      });
      
      expect(messageCallback).toHaveBeenCalledWith({
        content: ' World',
        isComplete: true
      });
      
      // Verify the callback was cleaned up after completion
      const cleanupSpy = spyOn(service as any, 'cleanupStreamingCallback');
      tick(300000); // Wait for the cleanup timeout
      expect(cleanupSpy).not.toHaveBeenCalled(); // Should be cleaned up by the done message
    }));
    
    it('should handle streaming errors', () => {
      const errorMsg = 'Streaming error occurred';
      const errorChunk: WebviewMessage = {
        type: 'streamChunk',
        payload: { messageId, error: errorMsg, done: true }
      };
      
      window.dispatchEvent(new MessageEvent('message', { data: errorChunk }));
      
      expect(messageCallback).toHaveBeenCalledWith({
        content: '',
        isComplete: true,
        error: errorMsg
      });
    });
    
    it('should cancel streaming messages', () => {
      // Cancel the streaming message
      service.cancelStreamingMessage(messageId);
      
      // Verify the cancel message was sent
      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'cancelMessage',
        payload: { messageId }
      });
      
      // Verify the callback was cleaned up
      expect(service['streamingCallbacks'].has(messageId)).toBeFalse();
    });
    
    it('should clean up abandoned streams after timeout', fakeAsync(() => {
      // Reset the spy to track cleanup
      postMessageSpy.calls.reset();
      
      // Wait for the cleanup timeout
      tick(300000);
      
      // Verify the callback was cleaned up
      expect(service['streamingCallbacks'].has(messageId)).toBeFalse();
      
      // Verify no cancel message was sent for abandoned streams
      expect(postMessageSpy).not.toHaveBeenCalled();
    }));
    
    it('should handle multiple concurrent streams', () => {
      const callback1 = jasmine.createSpy('streamingCallback1');
      const callback2 = jasmine.createSpy('streamingCallback2');
      
      const id1 = service.sendChatMessage('sid1', 'test1', [], callback1);
      const id2 = service.sendChatMessage('sid2', 'test2', [], callback2);
      
      // Send updates to both streams
      const chunk1: WebviewMessage = {
        type: 'streamChunk',
        payload: { messageId: id1, content: 'Stream 1', done: false }
      };
      
      const chunk2: WebviewMessage = {
        type: 'streamChunk',
        payload: { messageId: id2, content: 'Stream 2', done: true }
      };
      
      window.dispatchEvent(new MessageEvent('message', { data: chunk1 }));
      window.dispatchEvent(new MessageEvent('message', { data: chunk2 }));
      
      // Verify each callback received the correct data
      expect(callback1).toHaveBeenCalledWith({
        content: 'Stream 1',
        isComplete: false
      });
      
      expect(callback2).toHaveBeenCalledWith({
        content: 'Stream 2',
        isComplete: true
      });
      
      // Verify callbacks were cleaned up appropriately
      expect(service['streamingCallbacks'].has(id1)).toBeTrue(); // Still active
      expect(service['streamingCallbacks'].has(id2)).toBeFalse(); // Completed
    });
  });
});
