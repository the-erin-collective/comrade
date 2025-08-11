import { createReducer, on } from '@ngrx/store';
import * as SessionActions from './session.actions';
import { ConversationSession } from '../../models/session.model';

export interface SessionState {
  sessions: ConversationSession[];
  loading: boolean;
  error: any;
  activeSession: ConversationSession | null;
}

export const initialState: SessionState = {
  sessions: [],
  loading: false,
  error: null,
  activeSession: null
};

export const sessionReducer = createReducer(
  initialState,
  on(SessionActions.loadSessions, (state) => ({ ...state, loading: true, error: null })),
  on(SessionActions.loadSessionsSuccess, (state, { sessions }) => ({
    ...state,
    loading: false,
    sessions,
    activeSession: sessions.length > 0 ? sessions[sessions.length - 1] : null
  })),
  on(SessionActions.loadSessionsFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(SessionActions.createSession, (state) => ({ ...state, loading: true, error: null })),
  on(SessionActions.createSessionSuccess, (state, { session }) => ({
    ...state,
    loading: false,
    sessions: [...state.sessions, session],
    activeSession: session
  })),
  on(SessionActions.createSessionFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(SessionActions.closeSession, (state) => ({ ...state, loading: true, error: null })),
  on(SessionActions.closeSessionSuccess, (state, { sessionId }) => {
    const updatedSessions = state.sessions.map(session => 
      session.id === sessionId 
        ? { ...session, isClosed: true, isActive: false }
        : session
    );
    const activeSessions = updatedSessions.filter(session => !session.isClosed);
    const newActiveSession = state.activeSession?.id === sessionId 
      ? (activeSessions.length > 0 ? activeSessions[activeSessions.length - 1] : null)
      : state.activeSession;
    return {
      ...state,
      loading: false,
      sessions: updatedSessions,
      activeSession: newActiveSession
    };
  }),
  on(SessionActions.closeSessionFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(SessionActions.switchToSession, (state) => ({ ...state, loading: true, error: null })),
  on(SessionActions.switchToSessionSuccess, (state, { sessionId }) => {
    const updatedSessions = state.sessions.map(session => ({
      ...session,
      isActive: session.id === sessionId
    }));
    const activeSession = updatedSessions.find(session => session.id === sessionId) || null;
    return {
      ...state,
      loading: false,
      sessions: updatedSessions,
      activeSession
    };
  }),
  on(SessionActions.switchToSessionFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(SessionActions.deleteSession, (state) => ({ ...state, loading: true, error: null })),
  on(SessionActions.deleteSessionSuccess, (state, { sessionId }) => {
    const updatedSessions = state.sessions.filter(session => session.id !== sessionId);
    const activeSessions = updatedSessions.filter(session => !session.isClosed);
    const newActiveSession = state.activeSession?.id === sessionId 
      ? (activeSessions.length > 0 ? activeSessions[activeSessions.length - 1] : null)
      : state.activeSession;
    return {
      ...state,
      loading: false,
      sessions: updatedSessions,
      activeSession: newActiveSession
    };
  }),
  on(SessionActions.deleteSessionFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(SessionActions.clearAllSessions, (state) => ({ ...state, loading: true, error: null })),
  on(SessionActions.clearAllSessionsSuccess, (state) => ({
    ...state,
    loading: false,
    sessions: [],
    activeSession: null
  })),
  on(SessionActions.clearAllSessionsFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(SessionActions.reopenSession, (state) => ({ ...state, loading: true, error: null })),
  on(SessionActions.reopenSessionSuccess, (state, { sessionId }) => {
    const updatedSessions = state.sessions.map(session => ({
      ...session,
      isActive: session.id === sessionId,
      isClosed: session.id === sessionId ? false : session.isClosed,
      lastActivity: session.id === sessionId ? new Date() : session.lastActivity
    }));
    const activeSession = updatedSessions.find(session => session.id === sessionId) || null;
    return {
      ...state,
      loading: false,
      sessions: updatedSessions,
      activeSession
    };
  }),
  on(SessionActions.reopenSessionFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(SessionActions.restoreSessions, (state) => ({ ...state, loading: true, error: null })),
  on(SessionActions.restoreSessionsSuccess, (state, { restoredSession }) => ({
    ...state,
    loading: false,
    activeSession: restoredSession
  })),
  on(SessionActions.restoreSessionsFailure, (state, { error }) => ({ ...state, loading: false, error }))
);
