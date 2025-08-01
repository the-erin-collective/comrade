import { TestBed } from '@angular/core/testing';
import { MessageService, WebviewMessage, ExtensionMessage } from './message.service';

declare global {
  interface Window {
    addEventListener: any;
  }
}

describe('MessageService', () => {
  let service: MessageService;
  let postMessageSpy: jasmine.Spy;
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
    postMessageSpy = service['vscode'].postMessage;
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
});
