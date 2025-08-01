import { sessionReducer, SessionEffects } from './session';

export const reducers = {
  session: sessionReducer
};

export const effects = [SessionEffects];
