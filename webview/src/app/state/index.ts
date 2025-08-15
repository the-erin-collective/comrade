import { sessionReducer, SessionEffects } from './session';
import { providerReducer, ProviderEffects } from './provider';
import { agentReducer, AgentEffects } from './agent';

export const reducers = {
  session: sessionReducer,
  provider: providerReducer,
  agent: agentReducer
};

export const effects = [SessionEffects, ProviderEffects, AgentEffects];
