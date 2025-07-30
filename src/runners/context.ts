/**
 * ContextRunner for workspace analysis and context generation
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { BaseRunner, RunnerResult } from './base';
import { WorkspaceContext, FileNode, DependencyInfo, ContextSummary } from '../core/workspace';

interface FileAnalysis {
  path: string;
  size: number;
  language?: string;
  summary?: string;
  tokenCount: number;
  isImportant: boolean;
}

interface WorkspaceStats {
  totalFiles: number;
  totalSize: number;
  languageDistribution: Map<string, number>;
  frameworks: string[];
  dependencies: DependencyInfo[];
}

/**
 * ContextRunner analyzes workspace files and generates structured context
 */
export class ContextRunner extends BaseRunner {
  private maxFiles: number;
  private maxTokens: number;
  private ignorePatterns: string[];

  constructor(session: any, agent: any, personality: string) {
    super(session, agent, personality);
    
    // Get configuration values
    const config = vscode.workspace.getConfiguration('comrade.context');
    this.maxFiles = config.get<number>('maxFiles', 100);
    this.maxTokens = config.get<number>('maxTokens', 8000);
    
    // Default ignore patterns (will be extended with .gitignore)
    this.ignorePatterns = [
      'node_modules/**',
      '.git/**',
      '.vscode/**',
      '**/*.log',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.min.js',
      '**/*.min.css',
      '**/coverage/**',
      '**/.nyc_output/**',
      '**/tmp/**',
      '**/temp/**'
    ];
  }

  protected getRunnerName(): string {
    return 'Context Analysis';
  }

  protected validateInputs(): boolean {
    // Check if workspace is available
    if (!this.session.workspaceUri) {
      return false;
    }

    // Check if agent is available
    return true; // Will be validated in base class
  }

  protected async execute(): Promise<RunnerResult> {
    try {
      this.reportProgress('Discovering workspace files...');
      
      // Load .gitignore patterns
      await this.loadGitignorePatterns();
      
      // Discover all files in workspace
      const allFiles = await this.discoverFiles();
      
      this.reportProgress('Analyzing file content and structure...');
      
      // Analyze files and get statistics
      const fileAnalyses = await this.analyzeFiles(allFiles);
      const workspaceStats = this.calculateWorkspaceStats(fileAnalyses);
      
      this.reportProgress('Generating context summary...');
      
      // Select most important files within token limits
      const selectedFiles = this.selectImportantFiles(fileAnalyses);
      
      // Generate file structure tree
      const fileStructure = await this.generateFileStructure(selectedFiles);
      
      // Generate context summary
      const summary = this.generateContextSummary(workspaceStats, selectedFiles);
      
      // Create workspace context object
      const context: WorkspaceContext = {
        timestamp: new Date().toISOString(),
        workspaceRoot: this.getWorkspaceRoot(),
        fileStructure,
        dependencies: workspaceStats.dependencies,
        summary,
        tokenCount: this.calculateTotalTokens(selectedFiles)
      };
      
      this.reportProgress('Saving context data...');
      
      // Save context to workspace
      await this.saveContext(context);
      
      return {
        success: true,
        data: context,
        metadata: {
          totalFilesDiscovered: allFiles.length,
          filesAnalyzed: fileAnalyses.length,
          filesSelected: selectedFiles.length,
          tokenCount: context.tokenCount
        }
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw this.createRecoverableError(
        `Context generation failed: ${errorMessage}`,
        'CONTEXT_GENERATION_FAILED',
        { error: errorMessage }
      );
    }
  }

  protected async handleError(error: Error): Promise<void> {
    await this.defaultErrorHandler(error);
  }

  /**
   * Load .gitignore patterns from workspace
   */
  private async loadGitignorePatterns(): Promise<void> {
    try {
      const gitignoreContent = await this.readWorkspaceFile('.gitignore');
      const patterns = gitignoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(pattern => {
          // Convert gitignore patterns to glob patterns
          if (pattern.endsWith('/')) {
            return pattern + '**';
          }
          if (!pattern.includes('/')) {
            return '**/' + pattern;
          }
          return pattern;
        });
      
      this.ignorePatterns.push(...patterns);
    } catch {
      // .gitignore doesn't exist or can't be read, use defaults
    }
  }

  /**
   * Discover all files in workspace respecting ignore patterns
   */
  private async discoverFiles(): Promise<vscode.Uri[]> {
    const files: vscode.Uri[] = [];
    
    // Use VS Code's file search with exclude patterns
    const excludePattern = `{${this.ignorePatterns.join(',')}}`;
    
    const fileUris = await vscode.workspace.findFiles(
      '**/*',
      excludePattern,
      this.maxFiles * 2 // Get more files initially for better selection
    );
    
    // Filter out directories and very large files
    for (const uri of fileUris) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.File && stat.size < 1024 * 1024) { // Max 1MB per file
          files.push(uri);
        }
      } catch {
        // Skip files that can't be accessed
      }
    }
    
    return files;
  }

  /**
   * Analyze files for content, language, and importance
   */
  private async analyzeFiles(files: vscode.Uri[]): Promise<FileAnalysis[]> {
    const analyses: FileAnalysis[] = [];
    
    for (const file of files) {
      this.checkCancellation();
      
      try {
        const stat = await vscode.workspace.fs.stat(file);
        const relativePath = vscode.workspace.asRelativePath(file);
        const language = this.detectLanguage(relativePath);
        
        // Read file content for analysis
        let content = '';
        let summary = '';
        let tokenCount = 0;
        
        try {
          content = await this.readWorkspaceFile(relativePath);
          tokenCount = this.estimateTokenCount(content);
          summary = this.generateFileSummary(content, language);
        } catch {
          // Skip files that can't be read
          continue;
        }
        
        const analysis: FileAnalysis = {
          path: relativePath,
          size: stat.size,
          language,
          summary,
          tokenCount,
          isImportant: this.assessFileImportance(relativePath, content, language)
        };
        
        analyses.push(analysis);
        
      } catch {
        // Skip files that can't be analyzed
      }
    }
    
    return analyses;
  }

  /**
   * Calculate workspace statistics
   */
  private calculateWorkspaceStats(analyses: FileAnalysis[]): WorkspaceStats {
    const languageDistribution = new Map<string, number>();
    let totalSize = 0;
    let totalFiles = 0;
    
    for (const analysis of analyses) {
      totalFiles++;
      totalSize += analysis.size;
      
      if (analysis.language) {
        languageDistribution.set(
          analysis.language,
          (languageDistribution.get(analysis.language) || 0) + 1
        );
      }
    }
    
    // Detect frameworks and dependencies
    const frameworks = this.detectFrameworks(analyses);
    const dependencies = this.extractDependencies(analyses);
    
    return {
      totalFiles,
      totalSize,
      languageDistribution,
      frameworks,
      dependencies
    };
  }

  /**
   * Select most important files within token limits
   */
  private selectImportantFiles(analyses: FileAnalysis[]): FileAnalysis[] {
    // Sort by importance and token efficiency
    const sorted = analyses.sort((a, b) => {
      const aScore = this.calculateFileScore(a);
      const bScore = this.calculateFileScore(b);
      return bScore - aScore;
    });
    
    const selected: FileAnalysis[] = [];
    let totalTokens = 0;
    
    for (const analysis of sorted) {
      if (selected.length >= this.maxFiles) {
        break;
      }
      
      if (totalTokens + analysis.tokenCount <= this.maxTokens) {
        selected.push(analysis);
        totalTokens += analysis.tokenCount;
      } else if (analysis.isImportant && selected.length < this.maxFiles / 2) {
        // Include important files even if they push us slightly over limit
        selected.push(analysis);
        totalTokens += analysis.tokenCount;
      }
    }
    
    return selected;
  }

  /**
   * Generate file structure tree
   */
  private async generateFileStructure(analyses: FileAnalysis[]): Promise<FileNode[]> {
    const root: FileNode[] = [];
    const pathMap = new Map<string, FileNode>();
    
    // Create directory structure
    for (const analysis of analyses) {
      const parts = analysis.path.split('/');
      let currentPath = '';
      let currentLevel = root;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        let node = pathMap.get(currentPath);
        if (!node) {
          const isFile = i === parts.length - 1;
          node = {
            path: currentPath,
            type: isFile ? 'file' : 'directory',
            ...(isFile && {
              size: analysis.size,
              language: analysis.language,
              summary: analysis.summary
            }),
            ...(!isFile && { children: [] })
          };
          
          pathMap.set(currentPath, node);
          currentLevel.push(node);
        }
        
        if (!node.children) {
          node.children = [];
        }
        currentLevel = node.children;
      }
    }
    
    return root;
  }

  /**
   * Generate context summary
   */
  private generateContextSummary(stats: WorkspaceStats, analyses: FileAnalysis[]): ContextSummary {
    const primaryLanguages = Array.from(stats.languageDistribution.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([lang]) => lang);
    
    const totalLines = analyses.reduce((sum, analysis) => {
      return sum + (analysis.tokenCount / 4); // Rough estimate: 4 tokens per line
    }, 0);
    
    // Generate description based on detected patterns
    let description = `A ${primaryLanguages[0] || 'mixed-language'} project`;
    if (stats.frameworks.length > 0) {
      description += ` using ${stats.frameworks.slice(0, 3).join(', ')}`;
    }
    if (stats.dependencies.length > 0) {
      description += ` with ${stats.dependencies.length} dependencies`;
    }
    
    return {
      totalFiles: stats.totalFiles,
      totalLines: Math.round(totalLines),
      primaryLanguages,
      frameworks: stats.frameworks,
      description
    };
  }

  /**
   * Save context to workspace
   */
  private async saveContext(context: WorkspaceContext): Promise<void> {
    // Ensure .comrade directory exists
    try {
      await this.createWorkspaceDirectory('.comrade');
    } catch {
      // Directory might already exist
    }
    
    // Save context.json
    const contextJson = JSON.stringify(context, null, 2);
    await this.writeWorkspaceFile('.comrade/context.json', contextJson);
  }

  /**
   * Detect programming language from file path
   */
  private detectLanguage(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.sql': 'sql',
      '.sh': 'shell',
      '.bash': 'shell',
      '.zsh': 'shell',
      '.fish': 'shell'
    };
    
    return languageMap[ext];
  }

  /**
   * Estimate token count for text content
   */
  private estimateTokenCount(content: string): number {
    // Rough estimation: ~4 characters per token for code
    return Math.ceil(content.length / 4);
  }

  /**
   * Generate a brief summary of file content
   */
  private generateFileSummary(content: string, language?: string): string {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim());
    
    if (nonEmptyLines.length === 0) {
      return 'Empty file';
    }
    
    // Extract key information based on language
    const summary: string[] = [];
    
    if (language === 'javascript' || language === 'typescript') {
      // Look for exports, classes, functions
      const exports = nonEmptyLines.filter(line => 
        line.includes('export') || line.includes('module.exports')
      ).length;
      const functions = nonEmptyLines.filter(line => 
        line.includes('function') || line.includes('=>')
      ).length;
      const classes = nonEmptyLines.filter(line => 
        line.includes('class ')
      ).length;
      
      if (exports > 0) summary.push(`${exports} exports`);
      if (functions > 0) summary.push(`${functions} functions`);
      if (classes > 0) summary.push(`${classes} classes`);
    }
    
    if (language === 'json') {
      try {
        const parsed = JSON.parse(content);
        if (parsed.name) summary.push(`Package: ${parsed.name}`);
        if (parsed.dependencies) summary.push(`${Object.keys(parsed.dependencies).length} dependencies`);
      } catch {
        // Invalid JSON
      }
    }
    
    if (summary.length === 0) {
      summary.push(`${nonEmptyLines.length} lines`);
    }
    
    return summary.join(', ');
  }

  /**
   * Assess file importance for context inclusion
   */
  private assessFileImportance(filePath: string, content: string, language?: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.dirname(filePath).toLowerCase();
    
    // High importance files
    const importantFiles = [
      'package.json', 'package-lock.json', 'yarn.lock',
      'requirements.txt', 'pyproject.toml', 'setup.py',
      'cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
      'readme.md', 'readme.txt', 'changelog.md',
      'tsconfig.json', 'jsconfig.json', '.eslintrc',
      'webpack.config.js', 'vite.config.js', 'rollup.config.js'
    ];
    
    if (importantFiles.includes(fileName)) {
      return true;
    }
    
    // Important directories
    if (dirName.includes('src') || dirName.includes('lib') || dirName === '.') {
      return true;
    }
    
    // Main entry points
    if (fileName.includes('index.') || fileName.includes('main.') || fileName.includes('app.')) {
      return true;
    }
    
    // Configuration files
    if (fileName.includes('config') || fileName.includes('settings')) {
      return true;
    }
    
    // Small important files
    if (content.length < 1000 && (language === 'json' || language === 'yaml')) {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate file score for selection priority
   */
  private calculateFileScore(analysis: FileAnalysis): number {
    let score = 0;
    
    // Importance bonus
    if (analysis.isImportant) {
      score += 100;
    }
    
    // Language bonus
    const languageBonus: Record<string, number> = {
      'typescript': 20,
      'javascript': 15,
      'python': 15,
      'java': 10,
      'json': 25,
      'yaml': 20,
      'markdown': 5
    };
    
    if (analysis.language && languageBonus[analysis.language]) {
      score += languageBonus[analysis.language];
    }
    
    // Size penalty (prefer smaller files for better token efficiency)
    score -= Math.log(analysis.tokenCount + 1) * 2;
    
    // Path depth penalty (prefer root-level files)
    const depth = analysis.path.split('/').length;
    score -= depth * 2;
    
    return score;
  }

  /**
   * Detect frameworks used in the project
   */
  private detectFrameworks(analyses: FileAnalysis[]): string[] {
    const frameworks: Set<string> = new Set();
    
    for (const analysis of analyses) {
      const fileName = path.basename(analysis.path).toLowerCase();
      const content = analysis.summary || '';
      
      // Package.json detection
      if (fileName === 'package.json') {
        // This would need actual content parsing, simplified for now
        if (content.includes('react')) frameworks.add('React');
        if (content.includes('vue')) frameworks.add('Vue.js');
        if (content.includes('angular')) frameworks.add('Angular');
        if (content.includes('express')) frameworks.add('Express.js');
        if (content.includes('next')) frameworks.add('Next.js');
        if (content.includes('nuxt')) frameworks.add('Nuxt.js');
      }
      
      // File-based detection
      if (analysis.path.includes('angular.json')) frameworks.add('Angular');
      if (analysis.path.includes('vue.config.js')) frameworks.add('Vue.js');
      if (analysis.path.includes('next.config.js')) frameworks.add('Next.js');
      if (analysis.path.includes('nuxt.config.js')) frameworks.add('Nuxt.js');
      if (analysis.path.includes('gatsby-config.js')) frameworks.add('Gatsby');
      if (analysis.path.includes('svelte.config.js')) frameworks.add('Svelte');
    }
    
    return Array.from(frameworks);
  }

  /**
   * Extract dependency information
   */
  private extractDependencies(analyses: FileAnalysis[]): DependencyInfo[] {
    const dependencies: DependencyInfo[] = [];
    
    // This is a simplified implementation
    // In a real implementation, we would parse package.json, requirements.txt, etc.
    
    for (const analysis of analyses) {
      const fileName = path.basename(analysis.path).toLowerCase();
      
      if (fileName === 'package.json') {
        // Would parse actual JSON content here
        dependencies.push({
          name: 'npm-dependencies',
          version: 'various',
          type: 'npm',
          isDev: false
        });
      }
      
      if (fileName === 'requirements.txt') {
        dependencies.push({
          name: 'python-dependencies',
          version: 'various',
          type: 'pip',
          isDev: false
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Calculate total tokens for selected files
   */
  private calculateTotalTokens(analyses: FileAnalysis[]): number {
    return analyses.reduce((total, analysis) => total + analysis.tokenCount, 0);
  }
}