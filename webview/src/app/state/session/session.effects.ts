import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { SessionService } from '../../services/session.service';
import * as SessionActions from './session.actions';
import { catchError, map, mergeMap, of } from 'rxjs';

@Injectable()
export class SessionEffects {
  loadSessions$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SessionActions.loadSessions),
      mergeMap(() =>
        this.sessionService.getSessions().pipe(
          map((sessions) => SessionActions.loadSessionsSuccess({ sessions })),
          catchError((error) => of(SessionActions.loadSessionsFailure({ error })))
        )
      )
    )
  );

  createSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SessionActions.createSession),
      mergeMap(({ sessionType }) =>
  this.sessionService.createSession$(sessionType as 'conversation' | 'configuration').pipe(
          map((session) => SessionActions.createSessionSuccess({ session })),
          catchError((error) => of(SessionActions.createSessionFailure({ error })))
        )
      )
    )
  );

  closeSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SessionActions.closeSession),
      mergeMap(({ sessionId }) => {
        this.sessionService.closeSession(sessionId);
        return of(SessionActions.closeSessionSuccess({ sessionId }));
      }),
      catchError((error) => of(SessionActions.closeSessionFailure({ error })))
    )
  );

  switchToSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SessionActions.switchToSession),
      mergeMap(({ sessionId }) => {
        this.sessionService.switchToSession(sessionId);
        return of(SessionActions.switchToSessionSuccess({ sessionId }));
      }),
      catchError((error) => of(SessionActions.switchToSessionFailure({ error })))
    )
  );

  deleteSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SessionActions.deleteSession),
      mergeMap(({ sessionId }) => {
        this.sessionService.deleteSession(sessionId);
        return of(SessionActions.deleteSessionSuccess({ sessionId }));
      }),
      catchError((error) => of(SessionActions.deleteSessionFailure({ error })))
    )
  );

  clearAllSessions$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SessionActions.clearAllSessions),
      mergeMap(() => {
        this.sessionService.clearAllSessions();
        return of(SessionActions.clearAllSessionsSuccess());
      }),
      catchError((error) => of(SessionActions.clearAllSessionsFailure({ error })))
    )
  );

  reopenSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SessionActions.reopenSession),
      mergeMap(({ sessionId }) => {
        this.sessionService.reopenSession(sessionId);
        return of(SessionActions.reopenSessionSuccess({ sessionId }));
      }),
      catchError((error) => of(SessionActions.reopenSessionFailure({ error })))
    )
  );

  restoreSessions$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SessionActions.restoreSessions),
      mergeMap(() => {
        console.log('NgRx Effect: Processing restoreSessions action');
        try {
          const restoredSession = this.sessionService.restoreOpenSessions();
          console.log('NgRx Effect: Restored session:', restoredSession);
          return of(SessionActions.restoreSessionsSuccess({ restoredSession }));
        } catch (error) {
          console.error('NgRx Effect: Error restoring sessions:', error);
          return of(SessionActions.restoreSessionsFailure({ error }));
        }
      })
    )
  );

  constructor(private actions$: Actions, private sessionService: SessionService) {}
}
