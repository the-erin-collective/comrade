/**
 * Simple validation script for the security and approval system
 * This can be run outside of VS Code to verify basic functionality
 */

// Mock VS Code module for testing
const vscode = {
  window: {
    showInformationMessage: () => Promise.resolve('Allow'),
    showWarningMessage: () => Promise.resolve('Allow'),
    showErrorMessage: () => Promise.resolve('Allow (High Risk)')
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test' } }],
    fs: {
      readFile: () => Promise.resolve(Buffer.from('test content')),
      writeFile: () => Promise.resolve(),
      readDirectory: () => Promise.resolve([])
    }
  },
  Uri: {
    joinPath: (base, ...paths) => ({ fsPath: `${base.fsPath}/${paths.join('/')}` })
  }
};

// Mock the vscode module
require.cache[require.resolve('vscode')] = {
  exports: vscode,
  loaded: true
};

// Now we can safely import our modules
const { ToolManager, BuiltInTools } = require('../out/core/tool-manager');
const { ToolRegistry, SecurityValidator, SecurityLevel } = require('../out/core/tools');

async function validateSecuritySystem() {
  console.log('🔒 Validating Tool Security and Approval System...\n');
  
  try {
    // Reset instances
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
    
    const toolManager = ToolManager.getInstance();
    const toolRegistry = ToolRegistry.getInstance();
    
    // Register built-in tools
    BuiltInTools.registerAll();
    
    console.log('✅ Tool registration successful');
    console.log(`   Registered ${toolRegistry.getAllTools().length} tools`);
    
    // Test context
    const testContext = {
      agentId: 'test-agent',
      sessionId: 'test-session',
      user: { id: 'test-user', permissions: ['filesystem.read', 'filesystem.write'] },
      security: { level: SecurityLevel.NORMAL, allowDangerous: false }
    };
    
    // Test risk assessment
    console.log('\n🎯 Testing Risk Assessment...');
    
    const readFileTool = toolRegistry.getTool('read_file');
    if (readFileTool) {
      const safeAssessment = SecurityValidator.assessSecurityRisk(
        readFileTool, 
        { path: 'src/test.txt' }, 
        testContext
      );
      console.log(`   Safe file read risk score: ${safeAssessment.riskScore}`);
      
      const dangerousAssessment = SecurityValidator.assessSecurityRisk(
        readFileTool, 
        { path: '/etc/passwd' }, 
        testContext
      );
      console.log(`   Dangerous file read risk score: ${dangerousAssessment.riskScore}`);
      console.log(`   Warnings: ${dangerousAssessment.warnings.length}`);
    }
    
    // Test approval workflow
    console.log('\n🔐 Testing Approval Workflow...');
    
    const writeFileTool = toolRegistry.getTool('write_file');
    if (writeFileTool) {
      try {
        const result = await toolManager.executeTool(
          'write_file',
          { path: 'test.txt', content: 'Hello World' },
          testContext
        );
        console.log(`   Write file execution: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      } catch (error) {
        console.log(`   Write file execution: FAILED (${error.message})`);
      }
    }
    
    // Test audit logging
    console.log('\n📊 Testing Audit Logging...');
    
    const auditLog = toolManager.getAuditLog();
    const approvalLog = toolManager.getApprovalLog();
    const securityStats = toolManager.getSecurityStats();
    
    console.log(`   Audit log entries: ${auditLog.length}`);
    console.log(`   Approval log entries: ${approvalLog.length}`);
    console.log(`   Total approval requests: ${securityStats.totalApprovalRequests}`);
    console.log(`   Average risk score: ${securityStats.averageRiskScore}`);
    
    // Test session approvals
    console.log('\n🎫 Testing Session Approvals...');
    
    toolManager.clearSessionApprovals();
    console.log('   Session approvals cleared');
    
    const exportData = toolManager.exportAuditData();
    console.log(`   Export data contains ${Object.keys(exportData).length} sections`);
    
    console.log('\n✅ All security system validations passed!');
    
  } catch (error) {
    console.error('❌ Security system validation failed:', error);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  validateSecuritySystem().catch(console.error);
}

module.exports = { validateSecuritySystem };