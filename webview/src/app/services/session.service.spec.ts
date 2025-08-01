import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';
import { MessageService } from './message.service';
import { ConversationSession, SessionTab } from '../models/session.model';
import { of } from 'rxjs';

class MockMessageService {
  createSession = jasmine.createSpy('createSession');
  messageReceived = jasmine.createSpy('messageReceived').and.returnValue(null);
}

describe('SessionService', () => {
  let service: SessionService;
  let messageService: MockMessageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SessionService,
        { provide: MessageService, useClass: MockMessageService },
      ],
    });
    service = TestBed.inject(SessionService);
    messageService = TestBed.inject(MessageService) as any;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create a new session via createSession$', (done) => {
    spyOn(service as any, 'createSession').and.callThrough();
    service.createSession$('conversation').subscribe(session => {
      expect((service as any).createSession).toHaveBeenCalledWith('conversation');
      expect(session).toBeTruthy();
      expect(session.type).toBe('conversation');
      done();
    });
  });

  it('should return sessions via getSessions', (done) => {
    // Add a session to the signal map
    const session: ConversationSession = { id: '1', type: 'conversation', messages: [], title: 'Test' } as any;
    (service as any).sessionsMap.update((map: Map<string, SessionTab>) => {
      map.set('1', session);
      return map;
    });
    service.getSessions().subscribe(sessions => {
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].id).toBe('1');
      done();
    });
  });

  it('should update activeSessionIdSignal when setActiveSession is called', () => {
    (service as any).setActiveSession('abc');
    expect((service as any).activeSessionIdSignal()).toBe('abc');
  });

  it('should remove a session', () => {
    // Add a session
    const session: ConversationSession = { id: '2', type: 'conversation', messages: [], title: 'Test2' } as any;
    (service as any).sessionsMap.update((map: Map<string, SessionTab>) => {
      map.set('2', session);
      return map;
    });
    (service as any).removeSession('2');
    expect((service as any).sessionsMap().has('2')).toBeFalse();
  });

  // Add more tests for signals, computed, and persistence as needed
});
