/**
 * Agent assignment service interfaces for intelligent phase mapping
 */

import { IAgent, PhaseAgentMapping, SessionRequirements } from './agent';

export interface IAgentAssignmentService {
  assignAgentsToPhases(
    availableAgents: IAgent[], 
    sessionRequirements: SessionRequirements
  ): Promise<PhaseAgentMapping>;
  
  validateAssignment(mapping: PhaseAgentMapping, agents: IAgent[]): boolean;
  recalculateAssignments(sessionId: string): Promise<PhaseAgentMapping>;
  getAssignmentPreview(agents: IAgent[]): Promise<PhaseAgentMapping>;
}

export interface AssignmentCriteria {
  prioritizeSpeed: boolean;
  prioritizeCost: boolean;
  requireVision: boolean;
  requireToolUse: boolean;
  minimumReasoningDepth: 'basic' | 'intermediate' | 'advanced';
  preferredSpecializations: string[];
}

export interface AssignmentResult {
  mapping: PhaseAgentMapping;
  score: number;
  reasoning: string;
  warnings: string[];
  alternatives: PhaseAgentMapping[];
}

export interface AssignmentContext {
  sessionRequirements: SessionRequirements;
  availableAgents: IAgent[];
  criteria: AssignmentCriteria;
  constraints: AssignmentConstraints;
}

export interface AssignmentConstraints {
  maxCostPerSession?: number;
  requiredAgents?: string[]; // agent IDs that must be used
  excludedAgents?: string[]; // agent IDs that cannot be used
  phaseConstraints?: Record<string, string[]>; // phase -> allowed agent IDs
}

import { IChatBridge } from './chat';
import { PhaseType } from './agent';

export class AgentAssignmentService implements IAgentAssignmentService {
  private sessionMappings: Map<string, PhaseAgentMapping> = new Map();
  private chatBridge: IChatBridge;

  constructor(chatBridge: IChatBridge) {
    this.chatBridge = chatBridge;
  }

  async assignAgentsToPhases(
    availableAgents: IAgent[], 
    sessionRequirements: SessionRequirements
  ): Promise<PhaseAgentMapping> {
    
    // Filter agents that are enabled for assignment and available
    const eligibleAgents = await this.filterEligibleAgents(availableAgents);
    
    if (eligibleAgents.length === 0) {
      throw new Error('No eligible agents available for assignment');
    }

    // Create assignment context
    const context: AssignmentContext = {
      sessionRequirements,
      availableAgents: eligibleAgents,
      criteria: this.buildAssignmentCriteria(sessionRequirements),
      constraints: this.buildAssignmentConstraints(sessionRequirements)
    };

    // Use LLM-powered assignment algorithm
    const assignmentResult = await this.performLLMAssignment(context);
    
    // Validate the assignment
    if (!this.validateAssignment(assignmentResult.mapping, eligibleAgents)) {
  // Fall back to rule-based assignment
  return this.performRuleBasedAssignment(context);
    }

    return assignmentResult.mapping;
  }

  validateAssignment(mapping: PhaseAgentMapping, agents: IAgent[]): boolean {
    const agentIds = new Set(agents.map(a => a.id));
    
    // Check that all assigned agents exist
    for (const agentId of Object.values(mapping.assignments)) {
      if (!agentIds.has(agentId)) {
        return false;
      }
    }

    // Check that all required phases have assignments
    const requiredPhases = [PhaseType.CONTEXT, PhaseType.PLANNING, PhaseType.EXECUTION];
    for (const phase of requiredPhases) {
      if (!mapping.assignments[phase]) {
        return false;
      }
    }

    // Validate agent capabilities match phase requirements
    for (const [phase, agentId] of Object.entries(mapping.assignments)) {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) {
        continue;
      }

      if (!this.isAgentSuitableForPhase(agent, phase as PhaseType)) {
        return false;
      }
    }

    return true;
  }

  async recalculateAssignments(sessionId: string): Promise<PhaseAgentMapping> {
    // In a real implementation, this would retrieve session context
    // For now, return cached mapping or throw error
    const cachedMapping = this.sessionMappings.get(sessionId);
    if (!cachedMapping) {
      throw new Error(`No assignment found for session ${sessionId}`);
    }
    return cachedMapping;
  }

  async getAssignmentPreview(agents: IAgent[]): Promise<PhaseAgentMapping> {
    // Create default session requirements for preview
    const defaultRequirements: SessionRequirements = {
      hasImages: false,
      workspaceSize: 'medium',
      complexity: 'moderate',
      timeConstraints: 'none',
      toolsRequired: [],
      preferredCostTier: 'medium'
    };

    return this.assignAgentsToPhases(agents, defaultRequirements);
  }

  private async filterEligibleAgents(agents: IAgent[]): Promise<IAgent[]> {
    const eligible: IAgent[] = [];
    
    for (const agent of agents) {
      if (agent.isEnabledForAssignment && await agent.isAvailable()) {
        eligible.push(agent);
      }
    }
    
    return eligible;
  }

  private buildAssignmentCriteria(requirements: SessionRequirements): AssignmentCriteria {
    return {
      prioritizeSpeed: requirements.timeConstraints === 'strict',
      prioritizeCost: requirements.preferredCostTier === 'low',
      requireVision: requirements.hasImages,
      requireToolUse: requirements.toolsRequired.length > 0,
      minimumReasoningDepth: this.mapComplexityToReasoningDepth(requirements.complexity),
      preferredSpecializations: this.inferSpecializations(requirements)
    };
  }

  private buildAssignmentConstraints(requirements: SessionRequirements): AssignmentConstraints {
    const constraints: AssignmentConstraints = {};
    
    if (requirements.preferredCostTier === 'low') {
      constraints.maxCostPerSession = 1.0; // $1 max
    } else if (requirements.preferredCostTier === 'medium') {
      constraints.maxCostPerSession = 5.0; // $5 max
    }

    return constraints;
  }

  private async performLLMAssignment(context: AssignmentContext): Promise<AssignmentResult> {
    // Find an agent suitable for meta-reasoning about agent assignment
    const assignmentAgent = this.findBestAssignmentAgent(context.availableAgents);
    
    if (!assignmentAgent) {
      // Fall back to rule-based assignment
      return {
        mapping: this.performRuleBasedAssignment(context),
        score: 0.5,
        reasoning: 'No suitable agent for LLM-powered assignment, used rule-based fallback',
        warnings: ['LLM assignment unavailable'],
        alternatives: []
      };
    }

    const prompt = this.buildAssignmentPrompt(context);
    
    try {
      const response = await this.chatBridge.sendMessage(assignmentAgent, [
        { role: 'user', content: prompt }
      ]);

      const assignmentData = this.parseAssignmentResponse(response.content);
      
      return {
        mapping: assignmentData.mapping,
        score: assignmentData.confidence || 0.8,
        reasoning: assignmentData.reasoning || 'LLM-powered assignment',
        warnings: assignmentData.warnings || [],
        alternatives: assignmentData.alternatives || []
      };
      
    } catch (error) {
      // Fall back to rule-based assignment on LLM failure
      return {
        mapping: this.performRuleBasedAssignment(context),
        score: 0.5,
        reasoning: `LLM assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        warnings: ['LLM assignment failed, used rule-based fallback'],
        alternatives: []
      };
    }
  }

  private performRuleBasedAssignment(context: AssignmentContext): PhaseAgentMapping {
    const { availableAgents, sessionRequirements, criteria } = context;
    
    // Score agents for each phase
    const phaseAssignments: Record<PhaseType, string> = {} as Record<PhaseType, string>;
    const alternatives: Record<PhaseType, string[]> = {} as Record<PhaseType, string[]>;

    // Assign context phase - prioritize speed and basic reasoning
    const contextCandidates = this.scoreAgentsForPhase(availableAgents, PhaseType.CONTEXT, criteria);
    phaseAssignments[PhaseType.CONTEXT] = contextCandidates[0]?.id || availableAgents[0].id;
    alternatives[PhaseType.CONTEXT] = contextCandidates.slice(1, 3).map(a => a.id);

    // Assign planning phase - prioritize reasoning depth
    const planningCandidates = this.scoreAgentsForPhase(availableAgents, PhaseType.PLANNING, criteria);
    phaseAssignments[PhaseType.PLANNING] = planningCandidates[0]?.id || availableAgents[0].id;
    alternatives[PhaseType.PLANNING] = planningCandidates.slice(1, 3).map(a => a.id);

    // Assign execution phase - balance speed and tool use
    const executionCandidates = this.scoreAgentsForPhase(availableAgents, PhaseType.EXECUTION, criteria);
    phaseAssignments[PhaseType.EXECUTION] = executionCandidates[0]?.id || availableAgents[0].id;
    alternatives[PhaseType.EXECUTION] = executionCandidates.slice(1, 3).map(a => a.id);

    // Optional phases
    if (availableAgents.length > 1) {
      const reviewCandidates = this.scoreAgentsForPhase(availableAgents, PhaseType.REVIEW, criteria);
      phaseAssignments[PhaseType.REVIEW] = reviewCandidates[0]?.id || availableAgents[0].id;
      alternatives[PhaseType.REVIEW] = reviewCandidates.slice(1, 3).map(a => a.id);

      const recoveryCandidates = this.scoreAgentsForPhase(availableAgents, PhaseType.RECOVERY, criteria);
      phaseAssignments[PhaseType.RECOVERY] = recoveryCandidates[0]?.id || availableAgents[0].id;
      alternatives[PhaseType.RECOVERY] = recoveryCandidates.slice(1, 3).map(a => a.id);
    }

    return {
      assignments: phaseAssignments,
      reasoning: 'Rule-based assignment using agent capabilities and session requirements',
      confidence: 0.7,
      alternatives
    };
  }

  private scoreAgentsForPhase(agents: IAgent[], phase: PhaseType, criteria: AssignmentCriteria): IAgent[] {
    const scored = agents.map(agent => ({
      agent,
      score: this.calculateAgentPhaseScore(agent, phase, criteria)
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .map(item => item.agent);
  }

  private calculateAgentPhaseScore(agent: IAgent, phase: PhaseType, criteria: AssignmentCriteria): number {
    let score = 0;

    // Base capability requirements
    if (criteria.requireVision && !agent.capabilities.hasVision) {
      return 0;
    }
    if (criteria.requireToolUse && !agent.capabilities.hasToolUse) {
      return 0;
    }

    // Phase-specific scoring
    switch (phase) {
      case PhaseType.CONTEXT:
        score += agent.capabilities.speed === 'fast' ? 30 : agent.capabilities.speed === 'medium' ? 20 : 10;
        score += agent.capabilities.costTier === 'low' ? 20 : 10;
        break;
        
      case PhaseType.PLANNING:
        score += agent.capabilities.reasoningDepth === 'advanced' ? 40 : 
                 agent.capabilities.reasoningDepth === 'intermediate' ? 25 : 10;
        score += agent.capabilities.hasToolUse ? 15 : 0;
        break;
        
      case PhaseType.EXECUTION:
        score += agent.capabilities.hasToolUse ? 30 : 0;
        score += agent.capabilities.speed === 'fast' ? 20 : agent.capabilities.speed === 'medium' ? 15 : 5;
        break;
        
      case PhaseType.REVIEW:
        score += agent.capabilities.reasoningDepth === 'advanced' ? 35 : 
                 agent.capabilities.reasoningDepth === 'intermediate' ? 20 : 5;
        break;
        
      case PhaseType.RECOVERY:
        score += agent.capabilities.reasoningDepth === 'advanced' ? 25 : 15;
        score += agent.capabilities.hasToolUse ? 20 : 0;
        break;
    }

    // Apply criteria preferences
    if (criteria.prioritizeSpeed) {
      score += agent.capabilities.speed === 'fast' ? 15 : 0;
    }
    
    if (criteria.prioritizeCost) {
      score += agent.capabilities.costTier === 'low' ? 15 : 
               agent.capabilities.costTier === 'medium' ? 5 : -10;
    }

    // Specialization bonus
    for (const spec of criteria.preferredSpecializations) {
      if (agent.capabilities.specializations.includes(spec)) {
        score += 10;
      }
    }

    return Math.max(0, score);
  }

  private findBestAssignmentAgent(agents: IAgent[]): IAgent | null {
    // Look for an agent with advanced reasoning for meta-assignment tasks
    return agents.find(agent => 
      agent.capabilities.reasoningDepth === 'advanced' && 
      agent.capabilities.specializations.includes('analysis')
    ) || agents.find(agent => agent.capabilities.reasoningDepth === 'advanced') || null;
  }

  private buildAssignmentPrompt(context: AssignmentContext): string {
    const agentDescriptions = context.availableAgents.map(agent => 
      `${agent.id}: ${agent.name} - ${JSON.stringify(agent.capabilities)}`
    ).join('\n');

    return `You are an expert at assigning AI agents to workflow phases based on their capabilities and session requirements.

Available Agents:
${agentDescriptions}

Session Requirements:
${JSON.stringify(context.sessionRequirements, null, 2)}

Assignment Criteria:
${JSON.stringify(context.criteria, null, 2)}

Please assign the best agent to each phase (context, planning, execution, review, recovery) considering:
1. Agent capabilities vs phase requirements
2. Cost optimization if requested
3. Speed requirements
4. Tool usage needs
5. Reasoning depth requirements

Respond with a JSON object containing:
{
  "mapping": {
    "assignments": {
      "context": "agent_id",
      "planning": "agent_id", 
      "execution": "agent_id",
      "review": "agent_id",
      "recovery": "agent_id"
    },
    "reasoning": "explanation of assignment decisions",
    "confidence": 0.8,
    "alternatives": {
      "context": ["alt_agent_id1", "alt_agent_id2"],
      "planning": ["alt_agent_id1"],
      ...
    }
  },
  "warnings": ["any concerns or limitations"],
  "confidence": 0.8
}`;
  }

  private parseAssignmentResponse(content: string): any {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      throw new Error(`Failed to parse assignment response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private isAgentSuitableForPhase(agent: IAgent, phase: PhaseType): boolean {
    switch (phase) {
      case PhaseType.CONTEXT:
        return true; // All agents can handle context
        
      case PhaseType.PLANNING:
        return agent.capabilities.reasoningDepth !== 'basic';
        
      case PhaseType.EXECUTION:
        return agent.capabilities.hasToolUse || agent.capabilities.specializations.includes('code');
        
      case PhaseType.REVIEW:
        return agent.capabilities.reasoningDepth === 'advanced' || 
               agent.capabilities.specializations.includes('analysis');
        
      case PhaseType.RECOVERY:
        return agent.capabilities.reasoningDepth !== 'basic' && 
               (agent.capabilities.hasToolUse || agent.capabilities.specializations.includes('debugging'));
        
      default:
        return true;
    }
  }

  private mapComplexityToReasoningDepth(complexity: string): 'basic' | 'intermediate' | 'advanced' {
    switch (complexity) {
      case 'simple': return 'basic';
      case 'moderate': return 'intermediate';
      case 'complex': return 'advanced';
      default: return 'intermediate';
    }
  }

  private inferSpecializations(requirements: SessionRequirements): string[] {
    const specializations: string[] = [];
    
    if (requirements.toolsRequired.length > 0) {
      specializations.push('tools');
    }
    
    if (requirements.hasImages) {
      specializations.push('vision');
    }
    
    if (requirements.workspaceSize === 'large') {
      specializations.push('analysis');
    }
    
    // Always include code as it's a coding assistant
    specializations.push('code');
    
    return specializations;
  }
}