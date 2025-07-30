/**
 * Workspace context and action list data models
 */

export interface FileNode {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  language?: string;
  summary?: string;
  children?: FileNode[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'npm' | 'pip' | 'cargo' | 'maven' | 'other';
  isDev: boolean;
}

export interface ContextSummary {
  totalFiles: number;
  totalLines: number;
  primaryLanguages: string[];
  frameworks: string[];
  description: string;
}

export interface WorkspaceContext {
  timestamp: string;
  workspaceRoot: string;
  fileStructure: FileNode[];
  dependencies: DependencyInfo[];
  summary: ContextSummary;
  tokenCount: number;
}

export enum ActionType {
  CREATE_FILE = 'create_file',
  MODIFY_FILE = 'modify_file',
  DELETE_FILE = 'delete_file',
  RUN_COMMAND = 'run_command',
  INSTALL_DEPENDENCY = 'install_dependency'
}

export enum ActionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface ActionResult {
  success: boolean;
  output?: string;
  error?: string;
  timestamp: Date;
}

export interface Action {
  id: string;
  type: ActionType;
  description: string;
  parameters: Record<string, any>;
  dependencies: string[];
  status: ActionStatus;
  result?: ActionResult;
}

export interface ActionMetadata {
  totalActions: number;
  estimatedDuration: number;
  complexity: 'simple' | 'moderate' | 'complex';
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ActionList {
  version: string;
  timestamp: string;
  actions: Action[];
  metadata: ActionMetadata;
}