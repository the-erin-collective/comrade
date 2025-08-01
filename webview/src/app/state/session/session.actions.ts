import { createAction, props } from '@ngrx/store';
import { ConversationSession } from '../../models/session.model';

export const loadSessions = createAction('[Session] Load Sessions');
export const loadSessionsSuccess = createAction('[Session] Load Sessions Success', props<{ sessions: ConversationSession[] }>());
export const loadSessionsFailure = createAction('[Session] Load Sessions Failure', props<{ error: any }>());

export const createSession = createAction('[Session] Create Session', props<{ sessionType: string }>());
export const createSessionSuccess = createAction('[Session] Create Session Success', props<{ session: ConversationSession }>());
export const createSessionFailure = createAction('[Session] Create Session Failure', props<{ error: any }>());
