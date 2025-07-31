/**
 * Mock agent configurations and instances for testing
 */

import { IAgent, AgentCapabilities, LLMProvider, AgentConfig } from '../../core/agent';
import { AgentConfigurationItem } from '../../core/config';

export const mockAgentCapabilities: Record<string, AgentCapabilities> = {
  basic: {
    hasVision: false,
    hasToolUse: false,
    reasoningDepth: 'basic',
    speed: 'fast',
    costTier: 'low',
    maxTokens: 2000,
    supportedLanguages: ['en'],
    specializations: ['code']
  },
  
  intermediate: {
    hasVision: false,
    hasToolUse: true,
    reasoningDepth: 'intermediate',
    speed: 'medium',
    costTier: 'medium',
    maxTokens: 4000,
    supportedLanguages: ['en'],
    specializations: ['code', 'analysis']
  },
  
  advanced: {
    hasVision: true,
    hasToolUse: true,
    reasoningDepth: 'advanced',
    speed: 'slow',
    costTier: 'high',
    maxTokens: 8000,
    supportedLanguages: ['en', 'es', 'fr'],
    specializations: ['code', 'analysis', 'planning', 'debugging']
  },
  
  vision: {
    hasVision: true,
    hasToolUse: false,
    reasoningDepth: 'intermediate',
    speed: 'medium',
    costTier: 'high',
    maxTokens: 4000,
    supportedLanguages: ['en'],
    specializations: ['vision', 'analysis']
  },
  
  tools: {
    hasVision: false,
    hasToolUse: true,
    reasoningDepth: 'advanced',
    speed: 'medium',
    costTier: 'medium',
    maxTokens: 4000,
    supportedLanguages: ['en'],
    specializations: ['tools', 'execution']
  }
};

export const mockAgentConfigurations: AgentConfigurationItem[] = [
  {
    id: 'openai-gpt4',
    name: 'OpenAI GPT-4',
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 4000,
    timeout: 30000,
    capabilities: mockAgentCapabilities.advanced,
    isEnabledForAssignment: true
  },
  
  {
    id: 'openai-gpt35',
    name: 'OpenAI GPT-3.5 Turbo',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 4000,
    timeout: 30000,
    capabilities: mockAgentCapabilities.intermediate,
    isEnabledForAssignment: true
  },
  
  {
    id: 'anthropic-claude',
    name: 'Anthropic Claude',
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.7,
    maxTokens: 4000,
    timeout: 30000,
    capabilities: mockAgentCapabilities.advanced,
    isEnabledForAssignment: true
  },
  
  {
    id: 'ollama-llama2',
    name: 'Ollama Llama 2',
    provider: 'ollama',
    model: 'llama2',
    endpoint: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 60000,
    capabilities: mockAgentCapabilities.basic,
    isEnabledForAssignment: false
  },
  
  {
    id: 'custom-model',
    name: 'Custom Model',
    provider: 'custom',
    model: 'custom-model-v1',
    endpoint: 'https://api.custom.com/v1/chat/completions',
    temperature: 0.5,
    maxTokens: 4000,
    timeout: 30000,
    capabilities: mockAgentCapabilities.intermediate,
    isEnabledForAssignment: true
  }
];

export class MockAgent implements IAgent {
  constructor(
    public id: string,
    public name: string,
    public provider: LLMProvider,
    public config: AgentConfig,
    public capabilities: AgentCapabilities,
    public isEnabledForAssignment: boolean = true,
    private availabilityStatus: boolean = true
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.availabilityStatus;
  }

  setAvailability(available: boolean): void {
    this.availabilityStatus = available;
  }
}

export function createMockAgent(configItem: AgentConfigurationItem): MockAgent {
  return new MockAgent(
    configItem.id,
    configItem.name,
    configItem.provider,
    {
      provider: configItem.provider,
      model: configItem.model,
      endpoint: configItem.endpoint,
      temperature: configItem.temperature,
      maxTokens: configItem.maxTokens,
      timeout: configItem.timeout
    },
    configItem.capabilities,
    configItem.isEnabledForAssignment
  );
}

export const mockAgents = mockAgentConfigurations.map(createMockAgent);

// Specialized mock agents for specific test scenarios
export const mockAgentsByCapability = {
  vision: mockAgents.find(a => a.capabilities.hasVision)!,
  tools: mockAgents.find(a => a.capabilities.hasToolUse && !a.capabilities.hasVision)!,
  advanced: mockAgents.find(a => a.capabilities.reasoningDepth === 'advanced')!,
  basic: mockAgents.find(a => a.capabilities.reasoningDepth === 'basic')!,
  fast: mockAgents.find(a => a.capabilities.speed === 'fast')!,
  lowCost: mockAgents.find(a => a.capabilities.costTier === 'low')!
};