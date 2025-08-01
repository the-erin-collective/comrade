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
  on(SessionActions.createSessionFailure, (state, { error }) => ({ ...state, loading: false, error }))
);
