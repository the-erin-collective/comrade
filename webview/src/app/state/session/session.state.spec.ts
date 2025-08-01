import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Observable, of, throwError, Subject } from 'rxjs';
import * as SessionActions from './session.actions';
import { sessionReducer, initialState, SessionState } from './session.reducer';
import * as SessionSelectors from './session.selectors';
import { SessionEffects } from './session.effects';
import { SessionService } from '../../services/session.service';
import { Action } from '@ngrx/store';

// Mock data
const mockAgentConfig = {
  id: 'agent1',
  name: 'Test Agent',
  provider: 'test',
  model: 'gpt',
  capabilities: {
    hasVision: false,
    hasToolUse: false,
    reasoningDepth: 'basic' as const,
    speed: 'fast' as const,
    costTier: 'low' as const,
  },
};
const mockSessions = [
  {
    id: '1',
    title: 'Session 1',
    type: 'conversation' as const,
    isActive: true,
    lastActivity: new Date(),
    metadata: {},
    messages: [],
  currentPhase: 'context' as const,
    agentConfig: mockAgentConfig,
  },
  {
    id: '2',
    title: 'Session 2',
    type: 'conversation' as const,
    isActive: false,
    lastActivity: new Date(),
    metadata: {},
    messages: [],
  currentPhase: 'planning' as const,
    agentConfig: mockAgentConfig,
  },
];

// Actions
const loadAction = SessionActions.loadSessions();
const loadSuccessAction = SessionActions.loadSessionsSuccess({ sessions: mockSessions });
const loadFailureAction = SessionActions.loadSessionsFailure({ error: 'fail' });
const createAction = SessionActions.createSession({ sessionType: 'conversation' });
const createSuccessAction = SessionActions.createSessionSuccess({ session: mockSessions[0] });
const createFailureAction = SessionActions.createSessionFailure({ error: 'fail' });

describe('Session NgRx State', () => {
  describe('Reducer', () => {
    it('should set loading true on loadSessions', () => {
      const state = sessionReducer(initialState, loadAction);
      expect(state.loading).toBeTrue();
    });
    it('should set sessions and activeSession on loadSessionsSuccess', () => {
      const state = sessionReducer(initialState, loadSuccessAction);
      expect(state.sessions.length).toBe(2);
      expect(state.activeSession).toEqual(mockSessions[1]);
    });
    it('should set error on loadSessionsFailure', () => {
      const state = sessionReducer(initialState, loadFailureAction);
      expect(state.error).toBe('fail');
    });
    it('should set loading true on createSession', () => {
      const state = sessionReducer(initialState, createAction);
      expect(state.loading).toBeTrue();
    });
    it('should add session on createSessionSuccess', () => {
      const state = sessionReducer(initialState, createSuccessAction);
      expect(state.sessions.length).toBe(1);
      expect(state.activeSession).toEqual(mockSessions[0]);
    });
    it('should set error on createSessionFailure', () => {
      const state = sessionReducer(initialState, createFailureAction);
      expect(state.error).toBe('fail');
    });
  });

  describe('Selectors', () => {
    const state: { session: SessionState } = {
      session: {
        ...initialState,
        sessions: mockSessions,
        activeSession: mockSessions[0],
        loading: true,
        error: 'err',
      },
    };
    it('should select sessions', () => {
      expect(SessionSelectors.selectSessions(state)).toEqual(mockSessions);
    });
    it('should select active session', () => {
      expect(SessionSelectors.selectActiveSession(state)).toEqual(mockSessions[0]);
    });
    it('should select loading', () => {
      expect(SessionSelectors.selectSessionLoading(state)).toBeTrue();
    });
    it('should select error', () => {
      expect(SessionSelectors.selectSessionError(state)).toBe('err');
    });
  });

  describe('Effects', () => {
    let actions$: Subject<Action>;
    let effects: SessionEffects;
    let sessionService: jasmine.SpyObj<SessionService>;
    let store: MockStore;

    beforeEach(() => {
      actions$ = new Subject<Action>();
  sessionService = jasmine.createSpyObj('SessionService', ['getSessions', 'createSession$']);
      TestBed.configureTestingModule({
        providers: [
          SessionEffects,
          provideMockStore(),
          provideMockActions(() => actions$),
          { provide: SessionService, useValue: sessionService },
        ],
      });
      effects = TestBed.inject(SessionEffects);
      store = TestBed.inject(MockStore);
    });

    it('should dispatch loadSessionsSuccess on loadSessions', (done) => {
      sessionService.getSessions.and.returnValue(of(mockSessions));
      effects.loadSessions$.subscribe(action => {
        expect(action).toEqual(loadSuccessAction);
        done();
      });
      actions$.next(loadAction);
    });

    it('should dispatch loadSessionsFailure on error', (done) => {
      sessionService.getSessions.and.returnValue(throwError(() => 'fail'));
      effects.loadSessions$.subscribe(action => {
        expect(action).toEqual(loadFailureAction);
        done();
      });
      actions$.next(loadAction);
    });

    it('should dispatch createSessionSuccess on createSession', (done) => {
  sessionService.createSession$.and.returnValue(of(mockSessions[0]));
      effects.createSession$.subscribe(action => {
        expect(action).toEqual(createSuccessAction);
        done();
      });
      actions$.next(createAction);
    });

    it('should dispatch createSessionFailure on error', (done) => {
  sessionService.createSession$.and.returnValue(throwError(() => 'fail'));
      effects.createSession$.subscribe(action => {
        expect(action).toEqual(createFailureAction);
        done();
      });
      actions$.next(createAction);
    });
  });
});
