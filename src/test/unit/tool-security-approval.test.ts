/**
 * Tests for Tool Security and Approval System
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  ToolRegistry,
  SecurityValidator,
  ToolDefinition,
  ExecutionContext,
  SecurityLevel
} from '../../core/tools';
import {
  ToolManager,
  ToolExecutionError
} from '../../core/tool-manager';

describe('Tool Security and Approval System Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let toolRegistry: ToolRegistry;
  let toolManager: ToolManager;  beforeEach(() => {
    sandbox = sinon.createSandbox();
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
    toolRegistry = ToolRegistry.getInstance();
    toolManager = ToolManager.getInstance();
    SecurityValidator.clearExecutionHistory();
  });  afterEach(() => {
    sandbox.restore();
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
    SecurityValidator.clearExecutionHistory();
  });

  describe('Enhanced Risk Assessment', () => {  it('should assess risk based on tool category', () => {
      const lowRiskTool: ToolDefinition = {
        name: 'low_risk_tool',
        description: 'Low risk tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const highRiskTool: ToolDefinition = {
        name: 'high_risk_tool',
        description: 'High risk tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: false, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const lowRiskAssessment = SecurityValidator.assessSecurityRisk(lowRiskTool, {}, context);
      const highRiskAssessment = SecurityValidator.assessSecurityRisk(highRiskTool, {}, context);

      assert.ok(lowRiskAssessment.riskScore < highRiskAssessment.riskScore);
      assert.ok(lowRiskAssessment.riskScore >= 10); // Base low risk score
      assert.ok(highRiskAssessment.riskScore >= 70); // Base high risk score
    });

  it('should detect dangerous patterns in parameters', () => {
      const testTool: ToolDefinition = {
        name: 'test_tool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const safeParams = { message: 'hello world' };
      const dangerousParams = { command: 'rm -rf /' };

      const safeAssessment = SecurityValidator.assessSecurityRisk(testTool, safeParams, context);
      const dangerousAssessment = SecurityValidator.assessSecurityRisk(testTool, dangerousParams, context);

      assert.ok(safeAssessment.riskScore < dangerousAssessment.riskScore);
      assert.ok(dangerousAssessment.warnings.some(w => w.includes('Destructive file operations')));
      assert.ok(dangerousAssessment.riskFactors.includes('Destructive file operations'));
    });

  it('should assess file path risks', () => {
      const testTool: ToolDefinition = {
        name: 'file_tool',
        description: 'File tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const safePathParams = { path: 'src/file.txt' };
      const absolutePathParams = { path: '/etc/passwd' };
      const sensitiveFileParams = { path: '.env' };

      const safeAssessment = SecurityValidator.assessSecurityRisk(testTool, safePathParams, context);
      const absoluteAssessment = SecurityValidator.assessSecurityRisk(testTool, absolutePathParams, context);
      const sensitiveAssessment = SecurityValidator.assessSecurityRisk(testTool, sensitiveFileParams, context);

      assert.ok(safeAssessment.riskScore < absoluteAssessment.riskScore);
      assert.ok(safeAssessment.riskScore < sensitiveAssessment.riskScore);
      assert.ok(absoluteAssessment.warnings.some(w => w.includes('Absolute file path')));
      assert.ok(sensitiveAssessment.warnings.some(w => w.includes('sensitive files')));
    });

  it('should assess URL risks', () => {
      const testTool: ToolDefinition = {
        name: 'web_tool',
        description: 'Web tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const httpsParams = { url: 'https://api.example.com/data' };
      const httpParams = { url: 'http://api.example.com/data' };
      const shortenerParams = { url: 'https://bit.ly/abc123' };
      const localhostParams = { url: 'http://localhost:3000/api' };

      const httpsAssessment = SecurityValidator.assessSecurityRisk(testTool, httpsParams, context);
      const httpAssessment = SecurityValidator.assessSecurityRisk(testTool, httpParams, context);
      const shortenerAssessment = SecurityValidator.assessSecurityRisk(testTool, shortenerParams, context);
      const localhostAssessment = SecurityValidator.assessSecurityRisk(testTool, localhostParams, context);

      assert.ok(httpsAssessment.riskScore < httpAssessment.riskScore);
      assert.ok(httpsAssessment.riskScore < shortenerAssessment.riskScore);
      assert.ok(httpAssessment.warnings.some(w => w.includes('Non-HTTPS')));
      assert.ok(shortenerAssessment.warnings.some(w => w.includes('URL shortener')));
      assert.ok(localhostAssessment.warnings.some(w => w.includes('Local/private network')));
    });

  it('should detect rapid successive executions', () => {
      const testTool: ToolDefinition = {
        name: 'rapid_tool',
        description: 'Tool for rapid execution test',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: false, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // First execution should not trigger rapid execution warning
      const firstAssessment = SecurityValidator.assessSecurityRisk(testTool, {}, context);
      assert.ok(!firstAssessment.warnings.some(w => w.includes('rapid executions')));

      // Simulate multiple rapid executions
      for (let i = 0; i < 6; i++) {
        SecurityValidator.assessSecurityRisk(testTool, {}, context);
      }

      const rapidAssessment = SecurityValidator.assessSecurityRisk(testTool, {}, context);
      assert.ok(rapidAssessment.warnings.some(w => w.includes('rapid executions')));
      assert.ok(rapidAssessment.riskFactors.includes('Rapid successive executions detected'));
    });

  it('should block high-risk tools in restricted mode', () => {
      const highRiskTool: ToolDefinition = {
        name: 'restricted_tool',
        description: 'High risk tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: false, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      const restrictedContext: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.RESTRICTED, allowDangerous: false }
      };

      const assessment = SecurityValidator.assessSecurityRisk(highRiskTool, {}, restrictedContext);
      
      assert.strictEqual(assessment.blockExecution, true);
      assert.ok(assessment.warnings.some(w => w.includes('blocked in restricted mode')));
    });
  });

  describe('Enhanced Approval Workflow', () => {  it('should show different approval dialogs based on risk level', async () => {
      const lowRiskTool: ToolDefinition = {
        name: 'low_approval_tool',
        description: 'Low risk tool requiring approval',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      const mediumRiskTool: ToolDefinition = {
        name: 'medium_approval_tool',
        description: 'Medium risk tool requiring approval',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'medium' },
        executor: async () => ({ success: true })
      };

      const highRiskTool: ToolDefinition = {
        name: 'high_approval_tool',
        description: 'High risk tool requiring approval',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(lowRiskTool);
      toolManager.registerTool(mediumRiskTool);
      toolManager.registerTool(highRiskTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.ELEVATED, allowDangerous: true }
      };

      // Mock VS Code dialogs
      const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves('Allow' as any);
      const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Allow (High Risk)' as any);

      // Test low risk tool
      await toolManager.executeTool('low_approval_tool', {}, context);
      assert.ok(showInfoStub.calledOnce);

      // Test medium risk tool
      await toolManager.executeTool('medium_approval_tool', {}, context);
      assert.ok(showWarningStub.calledOnce);

      // Test high risk tool
      showWarningStub.resolves('Yes, I understand the risks' as any); // For confirmation dialog
      await toolManager.executeTool('high_approval_tool', {}, context);
      assert.ok(showErrorStub.calledOnce);
      assert.ok(showWarningStub.calledTwice); // Once for medium risk, once for high risk confirmation
    });

  it('should handle session-level approvals', async () => {
      const testTool: ToolDefinition = {
        name: 'session_approval_tool',
        description: 'Tool for session approval test',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'medium' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(testTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // Mock "Always Allow for this Session" choice
      const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage')
        .resolves('Always Allow for this Session' as any);

      // First execution should show approval dialog
      await toolManager.executeTool('session_approval_tool', {}, context);
      assert.ok(showWarningStub.calledOnce);

      // Second execution should not show dialog (session approval active)
      showWarningStub.resetHistory();
      await toolManager.executeTool('session_approval_tool', {}, context);
      assert.ok(showWarningStub.notCalled);

      // Clear session approvals and verify dialog shows again
      toolManager.clearSessionApprovals(context.sessionId);
      showWarningStub.resolves('Allow' as any);
      await toolManager.executeTool('session_approval_tool', {}, context);
      assert.ok(showWarningStub.calledOnce);
    });

  it('should handle user denial', async () => {
      const testTool: ToolDefinition = {
        name: 'denial_tool',
        description: 'Tool for denial test',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(testTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // Mock user denial
      sandbox.stub(vscode.window, 'showInformationMessage').resolves('Deny' as any);

      try {
        await toolManager.executeTool('denial_tool', {}, context);
        assert.fail('Should have thrown USER_DENIED error');
      } catch (error) {
        assert.ok(error instanceof ToolExecutionError);
        assert.strictEqual(error.code, 'USER_DENIED');
      }

      // Verify approval was logged
      const approvalLog = toolManager.getApprovalLog();
      assert.strictEqual(approvalLog.length, 1);
      assert.strictEqual(approvalLog[0].decision, 'denied');
      assert.strictEqual(approvalLog[0].toolName, 'denial_tool');
    });

  it('should handle high-risk tool confirmation denial', async () => {
      const highRiskTool: ToolDefinition = {
        name: 'high_risk_confirmation_tool',
        description: 'High risk tool for confirmation test',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(highRiskTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.ELEVATED, allowDangerous: true }
      };

      // Mock initial approval but confirmation denial
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Allow (High Risk)' as any);
      const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves('No, cancel' as any);

      try {
        await toolManager.executeTool('high_risk_confirmation_tool', {}, context);
        assert.fail('Should have thrown USER_DENIED error');
      } catch (error) {
        assert.ok(error instanceof ToolExecutionError);
        assert.strictEqual(error.code, 'USER_DENIED');
      }

      assert.ok(showErrorStub.calledOnce);
      assert.ok(showWarningStub.calledOnce);
    });
  });

  describe('Audit Logging', () => {  it('should log approval decisions', async () => {
      const testTool: ToolDefinition = {
        name: 'audit_tool',
        description: 'Tool for audit test',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'medium' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(testTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // Mock approval
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);

      await toolManager.executeTool('audit_tool', { param: 'value' }, context);

      const approvalLog = toolManager.getApprovalLog();
      assert.strictEqual(approvalLog.length, 1);

      const logEntry = approvalLog[0];
      assert.strictEqual(logEntry.toolName, 'audit_tool');
      assert.strictEqual(logEntry.decision, 'approved');
      assert.deepStrictEqual(logEntry.parameters, { param: 'value' });
      assert.strictEqual(logEntry.context.agentId, 'test-agent');
      assert.strictEqual(logEntry.context.sessionId, 'test-session');
      assert.strictEqual(logEntry.context.userId, 'test-user');
      assert.ok(logEntry.riskScore >= 0);
      assert.ok(Array.isArray(logEntry.riskFactors));
      assert.ok(Array.isArray(logEntry.warnings));
      assert.ok(logEntry.timestamp instanceof Date);
    });

  it('should provide approval log filtering', () => {
      // Create mock approval log entries
      const mockEntries = [
        {
          timestamp: new Date(),
          toolName: 'tool1',
          parameters: {},
          context: {
            agentId: 'agent1',
            sessionId: 'session1',
            userId: 'user1',
            securityLevel: SecurityLevel.NORMAL
          },
          decision: 'approved' as const,
          riskScore: 30,
          riskFactors: ['Medium-risk tool category'],
          warnings: []
        },
        {
          timestamp: new Date(),
          toolName: 'tool2',
          parameters: {},
          context: {
            agentId: 'agent1',
            sessionId: 'session1',
            userId: 'user1',
            securityLevel: SecurityLevel.NORMAL
          },
          decision: 'denied' as const,
          riskScore: 80,
          riskFactors: ['High-risk tool category'],
          warnings: ['High risk operation']
        }
      ];

      // Access private property for testing
      (toolManager as any).approvalLog = mockEntries;

      const tool1Log = toolManager.getApprovalLogForTool('tool1');
      const tool2Log = toolManager.getApprovalLogForTool('tool2');

      assert.strictEqual(tool1Log.length, 1);
      assert.strictEqual(tool1Log[0].toolName, 'tool1');
      assert.strictEqual(tool2Log.length, 1);
      assert.strictEqual(tool2Log[0].toolName, 'tool2');
    });

  it('should provide security statistics', async () => {
      const testTool: ToolDefinition = {
        name: 'stats_tool',
        description: 'Tool for stats test',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(testTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.ELEVATED, allowDangerous: true }
      };

      // Clear existing logs
      toolManager.clearApprovalLog();

      // Mock approvals and denials
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
      const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage');

      // First execution - approved
      showErrorStub.resolves('Allow (High Risk)' as any);
      showWarningStub.resolves('Yes, I understand the risks' as any);
      await toolManager.executeTool('stats_tool', {}, context);

      // Second execution - denied
      showErrorStub.resolves('Deny' as any);
      try {
        await toolManager.executeTool('stats_tool', {}, context);
      } catch (error) {
        // Expected denial
      }

      const stats = toolManager.getSecurityStats();
      assert.strictEqual(stats.totalApprovalRequests, 2);
      assert.strictEqual(stats.approvedRequests, 1);
      assert.strictEqual(stats.deniedRequests, 1);
      assert.ok(stats.averageRiskScore > 0);
      assert.strictEqual(stats.highRiskExecutions, 2); // Both were high risk
    });

  it('should export comprehensive audit data', async () => {
      const testTool: ToolDefinition = {
        name: 'export_tool',
        description: 'Tool for export test',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'medium' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(testTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // Mock approval
      sandbox.stub(vscode.window, 'showWarningMessage').resolves('Allow' as any);

      await toolManager.executeTool('export_tool', {}, context);

      const auditData = toolManager.exportAuditData();

      assert.ok(auditData.executionLog);
      assert.ok(auditData.approvalLog);
      assert.ok(auditData.statistics);
      assert.ok(auditData.exportTimestamp instanceof Date);

      assert.strictEqual(auditData.executionLog.length, 1);
      assert.strictEqual(auditData.approvalLog.length, 1);
      assert.strictEqual(auditData.statistics.totalExecutions, 1);
      assert.strictEqual(auditData.statistics.totalApprovalRequests, 1);
    });
  });

  describe('Security Policy Enforcement', () => {  it('should enforce restricted mode policies', async () => {
      const highRiskTool: ToolDefinition = {
        name: 'restricted_policy_tool',
        description: 'High risk tool for policy test',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: false, riskLevel: 'high' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(highRiskTool);

      const restrictedContext: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.RESTRICTED, allowDangerous: false }
      };

      try {
        await toolManager.executeTool('restricted_policy_tool', {}, restrictedContext);
        assert.fail('Should have thrown SECURITY_VIOLATION error');
      } catch (error) {
        assert.ok(error instanceof ToolExecutionError);
        assert.strictEqual(error.code, 'SECURITY_VIOLATION');
      }
    });

  it('should validate permissions before execution', async () => {
      const permissionTool: ToolDefinition = {
        name: 'permission_policy_tool',
        description: 'Tool requiring specific permissions',
        parameters: { type: 'object', properties: {} },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low',
          permissions: ['filesystem.write', 'vscode.commands']
        },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(permissionTool);

      const noPermContext: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      const withPermContext: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: ['filesystem.write', 'vscode.commands'] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // Should fail without permissions
      try {
        await toolManager.executeTool('permission_policy_tool', {}, noPermContext);
        assert.fail('Should have thrown SECURITY_VIOLATION error');
      } catch (error) {
        assert.ok(error instanceof ToolExecutionError);
        assert.strictEqual(error.code, 'SECURITY_VIOLATION');
      }

      // Should succeed with permissions
      const result = await toolManager.executeTool('permission_policy_tool', {}, withPermContext);
      assert.strictEqual(result.success, true);
    });
  });

  describe('Integration with Existing System', () => {  it('should maintain backward compatibility with existing approval system', async () => {
      const legacyTool: ToolDefinition = {
        name: 'legacy_tool',
        description: 'Legacy tool',
        parameters: { type: 'object', properties: {} },
        security: { requiresApproval: true, allowedInWeb: true, riskLevel: 'low' },
        executor: async () => ({ success: true })
      };

      toolManager.registerTool(legacyTool);

      const context: ExecutionContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        user: { id: 'test-user', permissions: [] },
        security: { level: SecurityLevel.NORMAL, allowDangerous: false }
      };

      // Mock approval
      const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves('Allow' as any);

      const result = await toolManager.executeTool('legacy_tool', {}, context);
      assert.strictEqual(result.success, true);
      assert.ok(showInfoStub.calledOnce);
    });

  it('should work with existing built-in tools', async () => {
      // Test that existing built-in tools still work with enhanced security
      const readFileTool = toolRegistry.getTool('read_file');
      if (readFileTool) {
        const context: ExecutionContext = {
          agentId: 'test-agent',
          sessionId: 'test-session',
          user: { id: 'test-user', permissions: ['filesystem.read'] },
          security: { level: SecurityLevel.NORMAL, allowDangerous: false }
        };

        // Should not require approval for low-risk read operation
        const result = await toolManager.executeTool('read_file', { path: 'test.txt' }, context);
        // Note: This will fail in test environment due to no actual file, but security validation should pass
        assert.ok(result.success === false); // Expected to fail due to no file, but security passed
        assert.ok(result.error?.includes('No workspace available') || result.error?.includes('Failed to read file'));
      }
    });
  });
});

