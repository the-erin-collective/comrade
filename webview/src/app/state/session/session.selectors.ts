import { createSelector, createFeatureSelector } from '@ngrx/store';
import { SessionState } from './session.reducer';

// Feature selector
export const selectSessionState = createFeatureSelector<SessionState>('session');

// Select all sessions
export const selectSessions = createSelector(
  selectSessionState,
  (state: SessionState) => state.sessions
);

// Select active session
export const selectActiveSession = createSelector(
  selectSessionState,
  (state: SessionState) => state.activeSession
);

// Select loading state
export const selectSessionLoading = createSelector(
  selectSessionState,
  (state: SessionState) => state.loading
);

// Select error state
export const selectSessionError = createSelector(
  selectSessionState,
  (state: SessionState) => state.error
);
