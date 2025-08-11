import { createAction, props } from '@ngrx/store';
import { ConversationSession } from '../../models/session.model';

export const loadSessions = createAction('[Session] Load Sessions');
export const loadSessionsSuccess = createAction('[Session] Load Sessions Success', props<{ sessions: ConversationSession[] }>());
export const loadSessionsFailure = createAction('[Session] Load Sessions Failure', props<{ error: any }>());

export const createSession = createAction('[Session] Create Session', props<{ sessionType: string }>());
export const createSessionSuccess = createAction('[Session] Create Session Success', props<{ session: ConversationSession }>());
export const createSessionFailure = createAction('[Session] Create Session Failure', props<{ error: any }>());

export const closeSession = createAction('[Session] Close Session', props<{ sessionId: string }>());
export const closeSessionSuccess = createAction('[Session] Close Session Success', props<{ sessionId: string }>());
export const closeSessionFailure = createAction('[Session] Close Session Failure', props<{ error: any }>());

export const switchToSession = createAction('[Session] Switch To Session', props<{ sessionId: string }>());
export const switchToSessionSuccess = createAction('[Session] Switch To Session Success', props<{ sessionId: string }>());
export const switchToSessionFailure = createAction('[Session] Switch To Session Failure', props<{ error: any }>());

export const deleteSession = createAction('[Session] Delete Session', props<{ sessionId: string }>());
export const deleteSessionSuccess = createAction('[Session] Delete Session Success', props<{ sessionId: string }>());
export const deleteSessionFailure = createAction('[Session] Delete Session Failure', props<{ error: any }>());

export const clearAllSessions = createAction('[Session] Clear All Sessions');
export const clearAllSessionsSuccess = createAction('[Session] Clear All Sessions Success');
export const clearAllSessionsFailure = createAction('[Session] Clear All Sessions Failure', props<{ error: any }>());

export const reopenSession = createAction('[Session] Reopen Session', props<{ sessionId: string }>());
export const reopenSessionSuccess = createAction('[Session] Reopen Session Success', props<{ sessionId: string }>());
export const reopenSessionFailure = createAction('[Session] Reopen Session Failure', props<{ error: any }>());

export const restoreSessions = createAction('[Session] Restore Sessions');
export const restoreSessionsSuccess = createAction('[Session] Restore Sessions Success', props<{ restoredSession: ConversationSession | null }>());
export const restoreSessionsFailure = createAction('[Session] Restore Sessions Failure', props<{ error: any }>());
