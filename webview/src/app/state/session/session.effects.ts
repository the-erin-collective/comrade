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

  constructor(private actions$: Actions, private sessionService: SessionService) {}
}
